import type { ParsedClipping } from "@/lib/kindle/parser";
import { getDatabase, toNumber, type Numeric } from "@/lib/db/client";
import {
  ImportStateError,
  type D1PreparedStatement,
  type ImportChunkResult,
  type ImportResult,
  type ImportStartResult,
} from "@/lib/db/types";

interface ImportRow {
  id: string;
  file_name: string;
  imported_at: string;
  parsed_count: Numeric;
  inserted_count: Numeric;
  duplicate_count: Numeric;
  conflict_count: Numeric;
  invalid_count: Numeric;
}

interface IdentityRow {
  fingerprint: string;
  source_anchor: string;
}

interface ExistingImportRow extends ImportRow {
  file_hash: string;
  status: "in_progress" | "complete";
  total_chunks: Numeric;
}

interface ImportSessionRow {
  id: string;
  file_name: string;
  status: "in_progress" | "complete";
  total_chunks: Numeric;
  parsed_count: Numeric;
  inserted_count: Numeric;
  duplicate_count: Numeric;
  conflict_count: Numeric;
  invalid_count: Numeric;
  processed_chunks: Numeric;
}

interface ImportChunkRow {
  status: "in_progress" | "complete";
  total_chunks: Numeric;
  inserted_count: Numeric | null;
  duplicate_count: Numeric | null;
  conflict_count: Numeric | null;
}

function importResultFromRow(
  row: Pick<
    ImportSessionRow,
    | "id"
    | "file_name"
    | "parsed_count"
    | "inserted_count"
    | "duplicate_count"
    | "conflict_count"
    | "invalid_count"
  >,
  alreadyImported: boolean,
): ImportResult {
  return {
    importId: row.id,
    fileName: row.file_name,
    parsedCount: toNumber(row.parsed_count),
    insertedCount: alreadyImported ? 0 : toNumber(row.inserted_count),
    duplicateCount: alreadyImported
      ? toNumber(row.parsed_count)
      : toNumber(row.duplicate_count),
    conflictCount: alreadyImported ? 0 : toNumber(row.conflict_count),
    invalidCount: toNumber(row.invalid_count),
    alreadyImported,
  };
}

export async function startImport(input: {
  fileName: string;
  fileHash: string;
  parsedCount: number;
  invalidCount: number;
  totalChunks: number;
}): Promise<ImportStartResult> {
  const db = getDatabase();
  const importId = `import_${input.fileHash.slice(0, 24)}`;
  const existing = await db
    .prepare(
      `SELECT id, file_hash, file_name, status, total_chunks, imported_at,
              parsed_count, inserted_count, duplicate_count, conflict_count,
              invalid_count
       FROM imports
       WHERE file_hash = ?`,
    )
    .bind(input.fileHash)
    .first<ExistingImportRow>();

  if (existing) {
    if (existing.status === "complete") {
      return {
        importId: existing.id,
        alreadyImported: true,
        result: importResultFromRow(existing, true),
      };
    }

    if (
      toNumber(existing.total_chunks) === input.totalChunks &&
      toNumber(existing.parsed_count) === input.parsedCount
    ) {
      return {
        importId: existing.id,
        alreadyImported: false,
        result: null,
      };
    }

    // A code update can change the browser-side chunk layout. Partial imports are
    // hidden from the library, so restarting this one is safe and avoids trapping
    // the user in an unrecoverable session.
  }

  await db.batch([
    db.prepare("DELETE FROM imports WHERE status = 'in_progress'"),
    db.prepare(
      `DELETE FROM books
       WHERE NOT EXISTS (
         SELECT 1 FROM clippings WHERE clippings.book_id = books.id
       )`,
    ),
    db
      .prepare(
        `INSERT INTO imports (
           id,
           file_name,
           file_hash,
           status,
           total_chunks,
           parsed_count,
           invalid_count
         ) VALUES (?, ?, ?, 'in_progress', ?, ?, ?)`,
      )
      .bind(
        importId,
        input.fileName,
        input.fileHash,
        input.totalChunks,
        input.parsedCount,
        input.invalidCount,
      ),
  ]);

  return { importId, alreadyImported: false, result: null };
}

function clippingImportPayload(
  importId: string,
  clipping: ParsedClipping,
  conflict: boolean,
): Record<string, unknown> {
  return {
    id: clipping.id,
    importId,
    bookId: clipping.bookId,
    fingerprint: clipping.fingerprint,
    sourceAnchor: clipping.sourceAnchor,
    kind: clipping.kind,
    sourceText: clipping.sourceText,
    pageStart: clipping.pageStart,
    pageEnd: clipping.pageEnd,
    locationStart: clipping.locationStart,
    locationEnd: clipping.locationEnd,
    sourceAddedAt: clipping.sourceAddedAt,
    sourceAddedAtLabel: clipping.sourceAddedAtLabel,
    rawMetadata: clipping.rawMetadata,
    needsReview: conflict ? 1 : 0,
  };
}

export async function processImportChunk(input: {
  importId: string;
  chunkIndex: number;
  clippings: ParsedClipping[];
}): Promise<ImportChunkResult> {
  const db = getDatabase();
  const session = await db
    .prepare(
      `SELECT
         i.status,
         i.total_chunks,
         ic.inserted_count,
         ic.duplicate_count,
         ic.conflict_count
       FROM imports i
       LEFT JOIN import_chunks ic
         ON ic.import_id = i.id AND ic.chunk_index = ?
       WHERE i.id = ?`,
    )
    .bind(input.chunkIndex, input.importId)
    .first<ImportChunkRow>();

  if (!session) throw new ImportStateError("This import session no longer exists.");
  if (session.status === "complete") {
    throw new ImportStateError("This import has already been completed.");
  }

  const totalChunks = toNumber(session.total_chunks);
  if (input.chunkIndex < 0 || input.chunkIndex >= totalChunks) {
    throw new ImportStateError("The import chunk is outside the expected range.");
  }

  if (session.inserted_count !== null) {
    return {
      chunkIndex: input.chunkIndex,
      insertedCount: toNumber(session.inserted_count),
      duplicateCount: toNumber(session.duplicate_count),
      conflictCount: toNumber(session.conflict_count),
      alreadyProcessed: true,
    };
  }

  const fingerprints = JSON.stringify(
    input.clippings.map((clipping) => clipping.fingerprint),
  );
  const anchors = JSON.stringify(
    input.clippings.map((clipping) => clipping.sourceAnchor),
  );
  const existingIdentities = await db
    .prepare(
      `SELECT fingerprint, source_anchor
       FROM clippings
       WHERE fingerprint IN (SELECT value FROM json_each(?))
          OR source_anchor IN (SELECT value FROM json_each(?))`,
    )
    .bind(fingerprints, anchors)
    .all<IdentityRow>();

  const knownFingerprints = new Set(
    existingIdentities.results.map((row) => row.fingerprint),
  );
  const knownAnchors = new Set(
    existingIdentities.results.map((row) => row.source_anchor),
  );
  const books = new Map<string, ParsedClipping>();
  const newClippings: Array<ParsedClipping & { conflict: boolean }> = [];
  let duplicateCount = 0;
  let conflictCount = 0;

  for (const clipping of input.clippings) {
    if (knownFingerprints.has(clipping.fingerprint)) {
      duplicateCount += 1;
      continue;
    }

    const conflict = knownAnchors.has(clipping.sourceAnchor);
    if (conflict) conflictCount += 1;

    books.set(clipping.bookId, clipping);
    newClippings.push({ ...clipping, conflict });
    knownFingerprints.add(clipping.fingerprint);
    knownAnchors.add(clipping.sourceAnchor);
  }

  const statements: D1PreparedStatement[] = [];
  if (books.size > 0) {
    const bookPayload = JSON.stringify(
      Array.from(books.values()).map((book) => ({
        id: book.bookId,
        sourceKey: book.bookKey,
        sourceTitle: book.sourceTitle,
        sourceAuthor: book.sourceAuthor,
      })),
    );
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO books (
             id, source_key, source_title, source_author
           )
           SELECT
             json_extract(value, '$.id'),
             json_extract(value, '$.sourceKey'),
             json_extract(value, '$.sourceTitle'),
             json_extract(value, '$.sourceAuthor')
           FROM json_each(?)`,
        )
        .bind(bookPayload),
    );
  }

  if (newClippings.length > 0) {
    const clippingPayload = JSON.stringify(
      newClippings.map((clipping) =>
        clippingImportPayload(input.importId, clipping, clipping.conflict),
      ),
    );
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO clippings (
             id,
             import_id,
             book_id,
             fingerprint,
             source_anchor,
             kind,
             source_text,
             page_start,
             page_end,
             location_start,
             location_end,
             source_added_at,
             source_added_at_label,
             raw_metadata,
             needs_review
           )
           SELECT
             json_extract(value, '$.id'),
             json_extract(value, '$.importId'),
             json_extract(value, '$.bookId'),
             json_extract(value, '$.fingerprint'),
             json_extract(value, '$.sourceAnchor'),
             json_extract(value, '$.kind'),
             json_extract(value, '$.sourceText'),
             json_extract(value, '$.pageStart'),
             json_extract(value, '$.pageEnd'),
             json_extract(value, '$.locationStart'),
             json_extract(value, '$.locationEnd'),
             json_extract(value, '$.sourceAddedAt'),
             json_extract(value, '$.sourceAddedAtLabel'),
             json_extract(value, '$.rawMetadata'),
             json_extract(value, '$.needsReview')
           FROM json_each(?)`,
        )
        .bind(clippingPayload),
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO import_chunks (
           import_id,
           chunk_index,
           inserted_count,
           duplicate_count,
           conflict_count
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        input.importId,
        input.chunkIndex,
        newClippings.length,
        duplicateCount,
        conflictCount,
      ),
    db
      .prepare(
        `UPDATE imports
         SET inserted_count = inserted_count + ?,
             duplicate_count = duplicate_count + ?,
             conflict_count = conflict_count + ?
         WHERE id = ?`,
      )
      .bind(
        newClippings.length,
        duplicateCount,
        conflictCount,
        input.importId,
      ),
  );

  await db.batch(statements);

  return {
    chunkIndex: input.chunkIndex,
    insertedCount: newClippings.length,
    duplicateCount,
    conflictCount,
    alreadyProcessed: false,
  };
}

export async function completeImport(importId: string): Promise<ImportResult> {
  const db = getDatabase();
  const session = await db
    .prepare(
      `SELECT
         i.id,
         i.file_name,
         i.status,
         i.total_chunks,
         i.parsed_count,
         i.inserted_count,
         i.duplicate_count,
         i.conflict_count,
         i.invalid_count,
         COUNT(ic.chunk_index) AS processed_chunks
       FROM imports i
       LEFT JOIN import_chunks ic ON ic.import_id = i.id
       WHERE i.id = ?
       GROUP BY i.id`,
    )
    .bind(importId)
    .first<ImportSessionRow>();

  if (!session) throw new ImportStateError("This import session no longer exists.");

  if (session.status === "complete") {
    return importResultFromRow(session, false);
  }

  if (toNumber(session.processed_chunks) !== toNumber(session.total_chunks)) {
    throw new ImportStateError(
      "Not every clipping batch has arrived yet. Retry the same file to resume the import.",
    );
  }

  await db
    .prepare(
      `UPDATE imports
       SET status = 'complete', completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(importId)
    .run();

  return importResultFromRow(session, false);
}
