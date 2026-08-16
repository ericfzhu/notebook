import type { ClippingKind } from "@/lib/kindle/parser";
import type {
  Clipping,
  ClippingFilters,
  ClippingList,
  ClippingTag,
  D1Database,
  D1PreparedStatement,
  ImportSummary,
  LibraryOverview,
  UpdateClippingInput,
} from "@/lib/db/types";
import { getDatabase, toBoolean, toNumber, type Numeric } from "@/lib/db/client";

interface StatsRow {
  total_clippings: Numeric;
  total_books: Numeric;
  favorites: Numeric;
  archived: Numeric;
  needs_review: Numeric;
}

interface BookRow {
  id: string;
  title: string;
  author: string;
  clipping_count: Numeric;
  favorite_count: Numeric;
  last_clipping_at: string | null;
}

interface TagRow {
  id: string;
  name: string;
  clipping_count: Numeric;
}

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

interface ClippingRow {
  id: string;
  book_id: string;
  title: string;
  author: string;
  kind: ClippingKind;
  source_text: string;
  edited_text: string | null;
  personal_note: string | null;
  page_start: Numeric;
  page_end: Numeric;
  location_start: Numeric;
  location_end: Numeric;
  source_added_at: string | null;
  source_added_at_label: string | null;
  raw_metadata: string;
  is_favorite: Numeric;
  archived_at: string | null;
  needs_review: Numeric;
  created_at: string;
  updated_at: string;
}

interface ClippingTagRow {
  clipping_id: string;
  id: string;
  name: string;
}


function mapImport(row: ImportRow): ImportSummary {
  return {
    id: row.id,
    fileName: row.file_name,
    importedAt: row.imported_at,
    parsedCount: toNumber(row.parsed_count),
    insertedCount: toNumber(row.inserted_count),
    duplicateCount: toNumber(row.duplicate_count),
    conflictCount: toNumber(row.conflict_count),
    invalidCount: toNumber(row.invalid_count),
  };
}

function mapClipping(
  row: ClippingRow,
  tagsByClipping: Map<string, ClippingTag[]>,
): Clipping {
  return {
    id: row.id,
    bookId: row.book_id,
    title: row.title,
    author: row.author,
    kind: row.kind,
    sourceText: row.source_text,
    editedText: row.edited_text,
    personalNote: row.personal_note,
    pageStart: row.page_start === null ? null : toNumber(row.page_start),
    pageEnd: row.page_end === null ? null : toNumber(row.page_end),
    locationStart:
      row.location_start === null ? null : toNumber(row.location_start),
    locationEnd:
      row.location_end === null ? null : toNumber(row.location_end),
    sourceAddedAt: row.source_added_at,
    sourceAddedAtLabel: row.source_added_at_label,
    rawMetadata: row.raw_metadata,
    isFavorite: toBoolean(row.is_favorite),
    isArchived: row.archived_at !== null,
    needsReview: toBoolean(row.needs_review),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: tagsByClipping.get(row.id) ?? [],
  };
}

async function loadTagsForClippings(
  db: D1Database,
  clippingIds: string[],
): Promise<Map<string, ClippingTag[]>> {
  const tagsByClipping = new Map<string, ClippingTag[]>();
  if (clippingIds.length === 0) return tagsByClipping;

  const placeholders = clippingIds.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT ct.clipping_id, t.id, t.name
       FROM clipping_tags ct
       JOIN tags t ON t.id = ct.tag_id
       WHERE ct.clipping_id IN (${placeholders})
       ORDER BY t.name COLLATE NOCASE ASC`,
    )
    .bind(...clippingIds)
    .all<ClippingTagRow>();

  for (const row of result.results) {
    const current = tagsByClipping.get(row.clipping_id) ?? [];
    current.push({ id: row.id, name: row.name });
    tagsByClipping.set(row.clipping_id, current);
  }

  return tagsByClipping;
}

export async function getLibraryOverview(): Promise<LibraryOverview> {
  const db = getDatabase();
  const [statsResult, booksResult, tagsResult, importsResult] = await db.batch([
    db.prepare(
      `SELECT
         COUNT(*) AS total_clippings,
         COUNT(DISTINCT c.book_id) AS total_books,
         COALESCE(SUM(CASE WHEN c.is_favorite = 1 AND c.archived_at IS NULL THEN 1 ELSE 0 END), 0) AS favorites,
         COALESCE(SUM(CASE WHEN c.archived_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS archived,
         COALESCE(SUM(CASE WHEN c.needs_review = 1 AND c.archived_at IS NULL THEN 1 ELSE 0 END), 0) AS needs_review
       FROM clippings c
       JOIN imports source_import
         ON source_import.id = c.import_id AND source_import.status = 'complete'`,
    ),
    db.prepare(
      `SELECT
         b.id,
         COALESCE(NULLIF(b.display_title, ''), b.source_title) AS title,
         COALESCE(NULLIF(b.display_author, ''), b.source_author) AS author,
         COUNT(c.id) AS clipping_count,
         COALESCE(SUM(CASE WHEN c.is_favorite = 1 THEN 1 ELSE 0 END), 0) AS favorite_count,
         MAX(COALESCE(c.source_added_at, c.created_at)) AS last_clipping_at
       FROM books b
       LEFT JOIN clippings c
         ON c.book_id = b.id
        AND c.archived_at IS NULL
        AND c.import_id IN (SELECT id FROM imports WHERE status = 'complete')
       GROUP BY b.id
       HAVING clipping_count > 0
       ORDER BY last_clipping_at DESC, title COLLATE NOCASE ASC`,
    ),
    db.prepare(
      `SELECT t.id, t.name, COUNT(ct.clipping_id) AS clipping_count
       FROM tags t
       JOIN clipping_tags ct ON ct.tag_id = t.id
       JOIN clippings c ON c.id = ct.clipping_id AND c.archived_at IS NULL
       JOIN imports source_import
         ON source_import.id = c.import_id AND source_import.status = 'complete'
       GROUP BY t.id
       ORDER BY clipping_count DESC, t.name COLLATE NOCASE ASC`,
    ),
    db.prepare(
      `SELECT id, file_name, imported_at, parsed_count, inserted_count,
              duplicate_count, conflict_count, invalid_count
       FROM imports
       WHERE status = 'complete'
       ORDER BY imported_at DESC
       LIMIT 1`,
    ),
  ]);

  const statsRow = (statsResult.results[0] ?? {
    total_clippings: 0,
    total_books: 0,
    favorites: 0,
    archived: 0,
    needs_review: 0,
  }) as unknown as StatsRow;
  const bookRows = booksResult.results as unknown as BookRow[];
  const tagRows = tagsResult.results as unknown as TagRow[];
  const importRows = importsResult.results as unknown as ImportRow[];

  return {
    stats: {
      totalClippings: toNumber(statsRow.total_clippings),
      totalBooks: toNumber(statsRow.total_books),
      favorites: toNumber(statsRow.favorites),
      archived: toNumber(statsRow.archived),
      needsReview: toNumber(statsRow.needs_review),
    },
    books: bookRows.map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author,
      clippingCount: toNumber(row.clipping_count),
      favoriteCount: toNumber(row.favorite_count),
      lastClippingAt: row.last_clipping_at,
    })),
    tags: tagRows.map((row) => ({
      id: row.id,
      name: row.name,
      clippingCount: toNumber(row.clipping_count),
    })),
    recentImport: importRows[0] ? mapImport(importRows[0]) : null,
  };
}

export async function listClippings(
  filters: ClippingFilters,
): Promise<ClippingList> {
  const db = getDatabase();
  const where: string[] = [];
  const values: unknown[] = [];
  const view = filters.view ?? "all";
  const limit = Math.min(Math.max(filters.limit ?? 40, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);

  if (view === "archived") {
    where.push("c.archived_at IS NOT NULL");
  } else {
    where.push("c.archived_at IS NULL");
  }

  if (view === "favorites") where.push("c.is_favorite = 1");
  if (view === "review") where.push("c.needs_review = 1");

  if (filters.bookId) {
    where.push("c.book_id = ?");
    values.push(filters.bookId);
  }

  if (filters.tagId) {
    where.push(
      "EXISTS (SELECT 1 FROM clipping_tags selected_tag WHERE selected_tag.clipping_id = c.id AND selected_tag.tag_id = ?)",
    );
    values.push(filters.tagId);
  }

  if (filters.kind && filters.kind !== "all") {
    where.push("c.kind = ?");
    values.push(filters.kind);
  }

  const query = filters.query?.trim();
  if (query) {
    where.push(
      `(
        c.source_text LIKE ? ESCAPE '\\' COLLATE NOCASE OR
        c.edited_text LIKE ? ESCAPE '\\' COLLATE NOCASE OR
        c.personal_note LIKE ? ESCAPE '\\' COLLATE NOCASE OR
        b.source_title LIKE ? ESCAPE '\\' COLLATE NOCASE OR
        b.source_author LIKE ? ESCAPE '\\' COLLATE NOCASE OR
        b.display_title LIKE ? ESCAPE '\\' COLLATE NOCASE OR
        b.display_author LIKE ? ESCAPE '\\' COLLATE NOCASE
      )`,
    );
    const escaped = query.replace(/[\\%_]/g, (character) => `\\${character}`);
    const pattern = `%${escaped}%`;
    values.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql =
    filters.sort === "oldest"
      ? "ORDER BY COALESCE(c.source_added_at, c.created_at) ASC, c.created_at ASC"
      : filters.sort === "location"
        ? "ORDER BY b.source_title COLLATE NOCASE ASC, COALESCE(c.location_start, 2147483647) ASC, COALESCE(c.page_start, 2147483647) ASC"
        : "ORDER BY COALESCE(c.source_added_at, c.created_at) DESC, c.created_at DESC";

  const baseFrom = `
    FROM clippings c
    JOIN imports source_import
      ON source_import.id = c.import_id AND source_import.status = 'complete'
    JOIN books b ON b.id = c.book_id
    ${whereSql}`;

  const [countRow, rowsResult] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS total ${baseFrom}`)
      .bind(...values)
      .first<{ total: Numeric }>(),
    db
      .prepare(
        `SELECT
           c.id,
           c.book_id,
           COALESCE(NULLIF(b.display_title, ''), b.source_title) AS title,
           COALESCE(NULLIF(b.display_author, ''), b.source_author) AS author,
           c.kind,
           c.source_text,
           c.edited_text,
           c.personal_note,
           c.page_start,
           c.page_end,
           c.location_start,
           c.location_end,
           c.source_added_at,
           c.source_added_at_label,
           c.raw_metadata,
           c.is_favorite,
           c.archived_at,
           c.needs_review,
           c.created_at,
           c.updated_at
         ${baseFrom}
         ${orderSql}
         LIMIT ? OFFSET ?`,
      )
      .bind(...values, limit, offset)
      .all<ClippingRow>(),
  ]);

  const rows = rowsResult.results;
  const tagsByClipping = await loadTagsForClippings(
    db,
    rows.map((row) => row.id),
  );
  const total = toNumber(countRow?.total ?? 0);

  return {
    items: rows.map((row) => mapClipping(row, tagsByClipping)),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
  };
}

async function loadClippingById(
  db: D1Database,
  clippingId: string,
): Promise<Clipping | null> {
  const row = await db
    .prepare(
      `SELECT
         c.id,
         c.book_id,
         COALESCE(NULLIF(b.display_title, ''), b.source_title) AS title,
         COALESCE(NULLIF(b.display_author, ''), b.source_author) AS author,
         c.kind,
         c.source_text,
         c.edited_text,
         c.personal_note,
         c.page_start,
         c.page_end,
         c.location_start,
         c.location_end,
         c.source_added_at,
         c.source_added_at_label,
         c.raw_metadata,
         c.is_favorite,
         c.archived_at,
         c.needs_review,
         c.created_at,
         c.updated_at
       FROM clippings c
       JOIN imports source_import
         ON source_import.id = c.import_id AND source_import.status = 'complete'
       JOIN books b ON b.id = c.book_id
       WHERE c.id = ?`,
    )
    .bind(clippingId)
    .first<ClippingRow>();

  if (!row) return null;
  const tagsByClipping = await loadTagsForClippings(db, [clippingId]);
  return mapClipping(row, tagsByClipping);
}

async function tagIdForName(name: string): Promise<string> {
  const normalized = name.normalize("NFKC").trim().toLocaleLowerCase("en");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `tag_${hex.slice(0, 24)}`;
}

export async function updateClipping(
  clippingId: string,
  input: UpdateClippingInput,
): Promise<Clipping | null> {
  const db = getDatabase();
  const existing = await loadClippingById(db, clippingId);
  if (!existing) return null;

  const editedText =
    input.editedText === undefined
      ? existing.editedText
      : input.editedText?.trim() || null;
  const personalNote =
    input.personalNote === undefined
      ? existing.personalNote
      : input.personalNote?.trim() || null;
  const isFavorite = input.isFavorite ?? existing.isFavorite;
  const archived = input.archived ?? existing.isArchived;
  const needsReview = input.needsReview ?? existing.needsReview;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE clippings
         SET edited_text = ?,
             personal_note = ?,
             is_favorite = ?,
             archived_at = CASE
               WHEN ? = 1 THEN COALESCE(archived_at, CURRENT_TIMESTAMP)
               ELSE NULL
             END,
             needs_review = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        editedText,
        personalNote,
        isFavorite ? 1 : 0,
        archived ? 1 : 0,
        needsReview ? 1 : 0,
        clippingId,
      ),
  ];

  if (input.tags !== undefined) {
    const uniqueTags = Array.from(
      new Map(
        input.tags
          .map((name) => name.normalize("NFKC").trim().replace(/\s+/g, " "))
          .filter(Boolean)
          .slice(0, 20)
          .map((name) => [name.toLocaleLowerCase("en"), name]),
      ).values(),
    );

    statements.push(
      db.prepare("DELETE FROM clipping_tags WHERE clipping_id = ?").bind(clippingId),
    );

    for (const name of uniqueTags) {
      const tagId = await tagIdForName(name);
      statements.push(
        db
          .prepare(
            `INSERT INTO tags (id, name)
             VALUES (?, ?)
             ON CONFLICT(name) DO UPDATE SET name = excluded.name`,
          )
          .bind(tagId, name),
        db
          .prepare(
            `INSERT OR IGNORE INTO clipping_tags (clipping_id, tag_id)
             VALUES (?, ?)`,
          )
          .bind(clippingId, tagId),
      );
    }
  }

  await db.batch(statements);
  return loadClippingById(db, clippingId);
}
