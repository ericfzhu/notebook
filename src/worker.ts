import { stableHash } from "./lib/kindle/identity";
import type {
  BookSummary,
  BooksResponse,
  ClippingRecord,
  ClippingsResponse,
  ImportPayload,
  ImportResult,
  LibraryStats,
  ParsedClipping,
  UpdateBookPayload,
  UpdateClippingPayload,
} from "./lib/notebook";

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: { changes?: number; [key: string]: unknown };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]>;
}

interface Fetcher {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
}

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface ApiErrorBody {
  error: string;
  details?: string;
}

const MAX_IMPORT_CLIPPINGS = 20_000;
const MAX_JSON_BYTES = 20 * 1024 * 1024;
const D1_JSON_CHUNK_BYTES = 380_000;
const MAX_BATCH_STATEMENTS = 45;
const MAX_TAGS = 12;
const TAG_SEPARATOR = String.fromCharCode(31);

const BOOK_INSERT_SQL = `
  INSERT OR IGNORE INTO books (
    id, source_key, source_title, source_author, created_at, updated_at
  )
  SELECT
    json_extract(value, '$.id'),
    json_extract(value, '$.sourceKey'),
    json_extract(value, '$.sourceTitle'),
    COALESCE(json_extract(value, '$.sourceAuthor'), ''),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM json_each(?1)
`;

const CLIPPING_INSERT_SQL = `
  INSERT OR IGNORE INTO clippings (
    id,
    book_id,
    fingerprint,
    kind,
    source_text,
    page_start,
    page_end,
    location_start,
    location_end,
    source_added_at,
    raw_metadata,
    created_at,
    updated_at
  )
  SELECT
    json_extract(value, '$.id'),
    json_extract(value, '$.bookId'),
    json_extract(value, '$.fingerprint'),
    json_extract(value, '$.kind'),
    json_extract(value, '$.sourceText'),
    json_extract(value, '$.pageStart'),
    json_extract(value, '$.pageEnd'),
    json_extract(value, '$.locationStart'),
    json_extract(value, '$.locationEnd'),
    json_extract(value, '$.sourceAddedAt'),
    json_extract(value, '$.rawMetadata'),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM json_each(?1)
`;

const CLIPPING_SELECT = `
  SELECT
    c.id,
    c.book_id,
    COALESCE(b.display_title, b.source_title) AS book_title,
    COALESCE(b.display_author, b.source_author) AS book_author,
    c.kind,
    c.source_text,
    c.edited_text,
    c.commentary,
    c.page_start,
    c.page_end,
    c.location_start,
    c.location_end,
    c.source_added_at,
    c.raw_metadata,
    c.is_favorite,
    c.archived_at,
    c.created_at,
    c.updated_at,
    COALESCE(group_concat(t.name, char(31)), '') AS tags
  FROM clippings c
  INNER JOIN books b ON b.id = c.book_id
  LEFT JOIN clipping_tags ct ON ct.clipping_id = c.id
  LEFT JOIN tags t ON t.id = ct.tag_id
`;

function json<T>(value: T, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(value), { ...init, headers });
}

function apiError(status: number, error: string, details?: string): Response {
  const body: ApiErrorBody = { error };
  if (details) body.details = details;
  return json(body, { status });
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function cleanOptionalText(
  value: unknown,
  label: string,
  maxLength: number,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`${label} must be text.`);

  const cleaned = value.replace(/\r\n?/g, "\n").trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) {
    throw new Error(`${label} must be ${maxLength.toLocaleString()} characters or fewer.`);
  }
  return cleaned;
}

function cleanTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!tag) return null;
  if (tag.length > 60) throw new Error("Tags must be 60 characters or fewer.");
  return tag;
}

function normalizeTag(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function validateClipping(value: unknown, index: number): ParsedClipping {
  if (!value || typeof value !== "object") {
    throw new Error(`Clipping ${index + 1} is not an object.`);
  }

  const clipping = value as Partial<ParsedClipping>;
  const required = {
    id: clipping.id,
    bookId: clipping.bookId,
    bookSourceKey: clipping.bookSourceKey,
    fingerprint: clipping.fingerprint,
    sourceTitle: clipping.sourceTitle,
    sourceAuthor: clipping.sourceAuthor,
    kind: clipping.kind,
    sourceText: clipping.sourceText,
    rawMetadata: clipping.rawMetadata,
  };

  for (const [field, candidate] of Object.entries(required)) {
    if (typeof candidate !== "string") {
      throw new Error(`Clipping ${index + 1} is missing ${field}.`);
    }
  }

  const typed = clipping as ParsedClipping;

  if (!typed.id || !typed.bookId || !typed.bookSourceKey || !typed.fingerprint) {
    throw new Error(`Clipping ${index + 1} has an invalid identity.`);
  }
  if (!typed.sourceTitle.trim()) {
    throw new Error(`Clipping ${index + 1} has no book title.`);
  }
  if (!typed.sourceText.trim() && typed.kind !== "bookmark") {
    throw new Error(`Clipping ${index + 1} has no text.`);
  }
  if (!["highlight", "note", "bookmark", "unknown"].includes(typed.kind)) {
    throw new Error(`Clipping ${index + 1} has an unsupported kind.`);
  }

  const numbers = [
    typed.pageStart,
    typed.pageEnd,
    typed.locationStart,
    typed.locationEnd,
  ];
  if (numbers.some((candidate) => candidate !== null && typeof candidate !== "number")) {
    throw new Error(`Clipping ${index + 1} has invalid page or location metadata.`);
  }
  if (typed.sourceAddedAt !== null && typeof typed.sourceAddedAt !== "string") {
    throw new Error(`Clipping ${index + 1} has an invalid sourceAddedAt.`);
  }

  return typed;
}

function chunkJsonObjects<T>(items: T[], maxBytes: number): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = 2;
  const encoder = new TextEncoder();

  for (const item of items) {
    const itemBytes = encoder.encode(JSON.stringify(item)).byteLength + 1;
    if (itemBytes > maxBytes) {
      throw new Error("An individual clipping is too large to import.");
    }
    if (current.length > 0 && currentBytes + itemBytes > maxBytes) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(item);
    currentBytes += itemBytes;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function mapBook(row: Record<string, unknown>): BookSummary {
  return {
    id: String(row.id),
    title: String(row.title),
    author: String(row.author ?? ""),
    sourceTitle: String(row.source_title),
    sourceAuthor: String(row.source_author ?? ""),
    clippingCount: asNumber(row.clipping_count),
    favoriteCount: asNumber(row.favorite_count),
    lastClippingAt: row.last_clipping_at ? String(row.last_clipping_at) : null,
  };
}

function mapClipping(row: Record<string, unknown>): ClippingRecord {
  const tags = String(row.tags ?? "")
    .split(TAG_SEPARATOR)
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    id: String(row.id),
    bookId: String(row.book_id),
    bookTitle: String(row.book_title),
    bookAuthor: String(row.book_author ?? ""),
    kind: String(row.kind) as ClippingRecord["kind"],
    sourceText: String(row.source_text ?? ""),
    editedText:
      row.edited_text === null || row.edited_text === undefined
        ? null
        : String(row.edited_text),
    commentary:
      row.commentary === null || row.commentary === undefined
        ? null
        : String(row.commentary),
    pageStart:
      row.page_start === null || row.page_start === undefined
        ? null
        : asNumber(row.page_start),
    pageEnd:
      row.page_end === null || row.page_end === undefined
        ? null
        : asNumber(row.page_end),
    locationStart:
      row.location_start === null || row.location_start === undefined
        ? null
        : asNumber(row.location_start),
    locationEnd:
      row.location_end === null || row.location_end === undefined
        ? null
        : asNumber(row.location_end),
    sourceAddedAt: row.source_added_at ? String(row.source_added_at) : null,
    rawMetadata: String(row.raw_metadata ?? ""),
    isFavorite: asNumber(row.is_favorite) === 1,
    isArchived: Boolean(row.archived_at),
    tags,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function getClippingById(
  database: D1Database,
  clippingId: string,
): Promise<ClippingRecord | null> {
  const row = await database
    .prepare(
      `${CLIPPING_SELECT}
       WHERE c.id = ?1
       GROUP BY c.id, b.id
       LIMIT 1`,
    )
    .bind(clippingId)
    .first<Record<string, unknown>>();
  return row ? mapClipping(row) : null;
}

async function readJsonBody<T>(request: Request): Promise<T> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_JSON_BYTES) {
    throw new Error("The request is too large.");
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_JSON_BYTES) {
    throw new Error("The request is too large.");
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error("The request body is not valid JSON.");
  }
}

async function listBooks(database: D1Database): Promise<Response> {
  const [bookRows, statsRow, lastImportRow] = await Promise.all([
    database
      .prepare(
        `SELECT
           b.id,
           COALESCE(b.display_title, b.source_title) AS title,
           COALESCE(b.display_author, b.source_author) AS author,
           b.source_title,
           b.source_author,
           COUNT(c.id) AS clipping_count,
           COALESCE(SUM(c.is_favorite), 0) AS favorite_count,
           MAX(COALESCE(c.source_added_at, c.created_at)) AS last_clipping_at
         FROM books b
         INNER JOIN clippings c
           ON c.book_id = b.id
          AND c.archived_at IS NULL
         GROUP BY b.id
         ORDER BY lower(COALESCE(b.display_title, b.source_title)),
                  lower(COALESCE(b.display_author, b.source_author))`,
      )
      .all<Record<string, unknown>>(),
    database
      .prepare(
        `SELECT
           COUNT(DISTINCT CASE WHEN archived_at IS NULL THEN book_id END) AS books,
           COALESCE(SUM(CASE WHEN archived_at IS NULL THEN 1 ELSE 0 END), 0) AS clippings,
           COALESCE(SUM(CASE WHEN archived_at IS NULL AND is_favorite = 1 THEN 1 ELSE 0 END), 0) AS favorites,
           COALESCE(SUM(CASE WHEN archived_at IS NULL AND kind = 'note' THEN 1 ELSE 0 END), 0) AS notes,
           COALESCE(SUM(CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS archived
         FROM clippings`,
      )
      .first<Record<string, unknown>>(),
    database
      .prepare(
        `SELECT
           id, file_name, imported_at, parsed_count, inserted_count,
           duplicate_count, invalid_count
         FROM imports
         ORDER BY imported_at DESC
         LIMIT 1`,
      )
      .first<Record<string, unknown>>(),
  ]);

  const stats: LibraryStats = {
    books: asNumber(statsRow?.books),
    clippings: asNumber(statsRow?.clippings),
    favorites: asNumber(statsRow?.favorites),
    notes: asNumber(statsRow?.notes),
    archived: asNumber(statsRow?.archived),
  };

  const response: BooksResponse = {
    books: (bookRows.results ?? []).map(mapBook),
    stats,
    lastImport: lastImportRow
      ? {
          id: String(lastImportRow.id),
          fileName: String(lastImportRow.file_name),
          importedAt: String(lastImportRow.imported_at),
          parsedCount: asNumber(lastImportRow.parsed_count),
          insertedCount: asNumber(lastImportRow.inserted_count),
          duplicateCount: asNumber(lastImportRow.duplicate_count),
          invalidCount: asNumber(lastImportRow.invalid_count),
        }
      : null,
  };

  return json(response);
}

async function listClippings(database: D1Database, url: URL): Promise<Response> {
  const bookId = url.searchParams.get("book")?.trim() || null;
  const query = url.searchParams.get("q")?.trim() || null;
  const kind = url.searchParams.get("kind")?.trim() || null;
  const favorite = url.searchParams.get("favorite") === "true";
  const archived = url.searchParams.get("archived") === "true";
  const limit = clamp(asNumber(url.searchParams.get("limit") || 40), 1, 100);
  const offset = Math.max(asNumber(url.searchParams.get("offset") || 0), 0);

  if (kind && !["highlight", "note", "bookmark", "unknown"].includes(kind)) {
    return apiError(400, "Unsupported clipping type.");
  }

  const where: string[] = [
    archived ? "c.archived_at IS NOT NULL" : "c.archived_at IS NULL",
  ];
  const bindings: unknown[] = [];
  const bind = (value: unknown): string => {
    bindings.push(value);
    return `?${bindings.length}`;
  };

  if (bookId) where.push(`c.book_id = ${bind(bookId)}`);
  if (kind) where.push(`c.kind = ${bind(kind)}`);
  if (favorite) where.push("c.is_favorite = 1");

  if (query) {
    const placeholder = bind(`%${escapeLike(query)}%`);
    where.push(
      `(COALESCE(c.edited_text, c.source_text) LIKE ${placeholder} ESCAPE '\\'
        OR COALESCE(c.commentary, '') LIKE ${placeholder} ESCAPE '\\'
        OR COALESCE(b.display_title, b.source_title) LIKE ${placeholder} ESCAPE '\\'
        OR COALESCE(b.display_author, b.source_author) LIKE ${placeholder} ESCAPE '\\'
        OR EXISTS (
          SELECT 1
          FROM clipping_tags search_ct
          INNER JOIN tags search_t ON search_t.id = search_ct.tag_id
          WHERE search_ct.clipping_id = c.id
            AND search_t.name LIKE ${placeholder} ESCAPE '\\'
        ))`,
    );
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const orderSql = bookId
    ? `ORDER BY
         COALESCE(c.location_start, 2147483647),
         COALESCE(c.page_start, 2147483647),
         COALESCE(c.source_added_at, c.created_at),
         c.created_at`
    : `ORDER BY COALESCE(c.source_added_at, c.created_at) DESC, c.created_at DESC`;

  const countStatement = database
    .prepare(
      `SELECT COUNT(*) AS total
       FROM clippings c
       INNER JOIN books b ON b.id = c.book_id
       ${whereSql}`,
    )
    .bind(...bindings);

  const rowsStatement = database
    .prepare(
      `${CLIPPING_SELECT}
       ${whereSql}
       GROUP BY c.id, b.id
       ${orderSql}
       LIMIT ?${bindings.length + 1}
       OFFSET ?${bindings.length + 2}`,
    )
    .bind(...bindings, limit, offset);

  const [countRow, rows] = await Promise.all([
    countStatement.first<Record<string, unknown>>(),
    rowsStatement.all<Record<string, unknown>>(),
  ]);

  const total = asNumber(countRow?.total);
  const clippings = (rows.results ?? []).map(mapClipping);
  const response: ClippingsResponse = {
    clippings,
    total,
    limit,
    offset,
    hasMore: offset + clippings.length < total,
  };
  return json(response);
}

async function importClippings(database: D1Database, request: Request): Promise<Response> {
  let payload: ImportPayload;
  try {
    payload = await readJsonBody<ImportPayload>(request);
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "Invalid import request.");
  }

  if (!payload || typeof payload !== "object") {
    return apiError(400, "The import payload is missing.");
  }
  if (typeof payload.fileName !== "string" || !payload.fileName.trim()) {
    return apiError(400, "The import file name is missing.");
  }
  if (payload.fileName.length > 500) {
    return apiError(400, "The import file name is too long.");
  }
  if (!Number.isInteger(payload.fileSize) || payload.fileSize < 0) {
    return apiError(400, "The import file size is invalid.");
  }
  if (typeof payload.fileHash !== "string" || !payload.fileHash) {
    return apiError(400, "The import file hash is missing.");
  }
  if (!Array.isArray(payload.clippings)) {
    return apiError(400, "The import does not contain a clipping list.");
  }
  if (payload.clippings.length > MAX_IMPORT_CLIPPINGS) {
    return apiError(
      413,
      `A single import may contain at most ${MAX_IMPORT_CLIPPINGS.toLocaleString()} clippings.`,
    );
  }

  const uniqueClippings = new Map<string, ParsedClipping>();
  try {
    payload.clippings.forEach((value, index) => {
      const clipping = validateClipping(value, index);
      uniqueClippings.set(clipping.fingerprint, clipping);
    });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "A clipping is invalid.");
  }

  const clippings = Array.from(uniqueClippings.values());
  const books = Array.from(
    new Map(
      clippings.map((clipping) => [
        clipping.bookId,
        {
          id: clipping.bookId,
          sourceKey: clipping.bookSourceKey,
          sourceTitle: clipping.sourceTitle,
          sourceAuthor: clipping.sourceAuthor,
        },
      ]),
    ).values(),
  );

  let clippingChunks: ParsedClipping[][];
  try {
    clippingChunks = chunkJsonObjects(clippings, D1_JSON_CHUNK_BYTES);
  } catch (error) {
    return apiError(413, error instanceof Error ? error.message : "The import is too large.");
  }

  let added = 0;
  try {
    if (books.length > 0) {
      await database.prepare(BOOK_INSERT_SQL).bind(JSON.stringify(books)).run();
    }

    for (let index = 0; index < clippingChunks.length; index += MAX_BATCH_STATEMENTS) {
      const statements = clippingChunks
        .slice(index, index + MAX_BATCH_STATEMENTS)
        .map((chunk) => database.prepare(CLIPPING_INSERT_SQL).bind(JSON.stringify(chunk)));
      const results = await database.batch(statements);
      added += results.reduce(
        (sum, result) => sum + asNumber(result.meta?.changes),
        0,
      );
    }
  } catch (error) {
    return apiError(
      500,
      "The clippings could not be imported.",
      error instanceof Error ? error.message : undefined,
    );
  }

  const invalid = asNumber(payload.parseSummary?.errorCount);
  const fileDuplicates = asNumber(payload.parseSummary?.duplicateCount);
  const requestDuplicates = payload.clippings.length - clippings.length;
  const duplicates = fileDuplicates + requestDuplicates + (clippings.length - added);
  const importedAt = new Date().toISOString();
  const importId = `import_${crypto.randomUUID()}`;

  try {
    await database
      .prepare(
        `INSERT INTO imports (
           id, file_name, file_hash, file_size, parsed_count,
           inserted_count, duplicate_count, invalid_count, imported_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .bind(
        importId,
        payload.fileName.trim(),
        payload.fileHash,
        payload.fileSize,
        clippings.length,
        added,
        duplicates,
        invalid,
        importedAt,
      )
      .run();
  } catch (error) {
    return apiError(
      500,
      "The clippings were saved, but the import history could not be recorded.",
      error instanceof Error ? error.message : undefined,
    );
  }

  const response: ImportResult = {
    importId,
    parsed: clippings.length + invalid + fileDuplicates + requestDuplicates,
    added,
    duplicates,
    invalid,
    books: books.length,
    importedAt,
  };
  return json(response, { status: 201 });
}

async function updateBook(
  database: D1Database,
  bookId: string,
  request: Request,
): Promise<Response> {
  let payload: UpdateBookPayload;
  try {
    payload = await readJsonBody<UpdateBookPayload>(request);
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "Invalid book update.");
  }

  let displayTitle: string | null;
  let displayAuthor: string | null;
  try {
    displayTitle = cleanOptionalText(payload.displayTitle, "Display title", 500);
    displayAuthor = cleanOptionalText(payload.displayAuthor, "Display author", 300);
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "Invalid book update.");
  }

  const result = await database
    .prepare(
      `UPDATE books
       SET display_title = ?1,
           display_author = ?2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?3`,
    )
    .bind(displayTitle, displayAuthor, bookId)
    .run();

  if (asNumber(result.meta?.changes) === 0) return apiError(404, "Book not found.");

  const book = await database
    .prepare(
      `SELECT
         b.id,
         COALESCE(b.display_title, b.source_title) AS title,
         COALESCE(b.display_author, b.source_author) AS author,
         b.source_title,
         b.source_author,
         COUNT(c.id) AS clipping_count,
         COALESCE(SUM(CASE WHEN c.is_favorite = 1 THEN 1 ELSE 0 END), 0) AS favorite_count,
         MAX(COALESCE(c.source_added_at, c.created_at)) AS last_clipping_at
       FROM books b
       LEFT JOIN clippings c
         ON c.book_id = b.id
        AND c.archived_at IS NULL
       WHERE b.id = ?1
       GROUP BY b.id`,
    )
    .bind(bookId)
    .first<Record<string, unknown>>();

  return book ? json(mapBook(book)) : apiError(404, "Book not found.");
}

async function updateClipping(
  database: D1Database,
  clippingId: string,
  request: Request,
): Promise<Response> {
  let payload: UpdateClippingPayload;
  try {
    payload = await readJsonBody<UpdateClippingPayload>(request);
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "Invalid clipping update.");
  }

  if (typeof payload.isFavorite !== "boolean" || typeof payload.isArchived !== "boolean") {
    return apiError(400, "Favorite and archive states must be true or false.");
  }
  if (!Array.isArray(payload.tags)) {
    return apiError(400, "Tags must be supplied as a list.");
  }

  let editedText: string | null;
  let commentary: string | null;
  let tags: string[];
  try {
    editedText = cleanOptionalText(payload.editedText, "Edited text", 30_000);
    commentary = cleanOptionalText(payload.commentary, "Commentary", 20_000);
    tags = Array.from(
      new Map(
        payload.tags
          .map(cleanTag)
          .filter((tag): tag is string => Boolean(tag))
          .map((tag) => [normalizeTag(tag), tag]),
      ).values(),
    );
    if (tags.length > MAX_TAGS) {
      throw new Error(`A clipping may have at most ${MAX_TAGS} tags.`);
    }
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "Invalid clipping update.");
  }

  const existing = await database
    .prepare("SELECT id FROM clippings WHERE id = ?1")
    .bind(clippingId)
    .first<Record<string, unknown>>();
  if (!existing) return apiError(404, "Clipping not found.");

  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `UPDATE clippings
         SET edited_text = ?1,
             commentary = ?2,
             is_favorite = ?3,
             archived_at = CASE
               WHEN ?4 = 1 THEN COALESCE(archived_at, CURRENT_TIMESTAMP)
               ELSE NULL
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?5`,
      )
      .bind(
        editedText,
        commentary,
        payload.isFavorite ? 1 : 0,
        payload.isArchived ? 1 : 0,
        clippingId,
      ),
    database.prepare("DELETE FROM clipping_tags WHERE clipping_id = ?1").bind(clippingId),
  ];

  for (const tag of tags) {
    const normalizedName = normalizeTag(tag);
    const tagId = `tag_${stableHash(normalizedName)}`;
    statements.push(
      database
        .prepare(
          `INSERT INTO tags (id, name, normalized_name)
           VALUES (?1, ?2, ?3)
           ON CONFLICT(normalized_name) DO UPDATE SET name = excluded.name`,
        )
        .bind(tagId, tag, normalizedName),
      database
        .prepare(
          `INSERT OR IGNORE INTO clipping_tags (clipping_id, tag_id)
           SELECT ?1, id FROM tags WHERE normalized_name = ?2`,
        )
        .bind(clippingId, normalizedName),
    );
  }

  try {
    await database.batch(statements);
  } catch (error) {
    return apiError(
      500,
      "The clipping could not be updated.",
      error instanceof Error ? error.message : undefined,
    );
  }

  const clipping = await getClippingById(database, clippingId);
  return clipping ? json(clipping) : apiError(404, "Clipping not found.");
}

function isMigrationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table|no such column/i.test(message);
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && path === "/api/health") {
    return json({ ok: true });
  }
  if (request.method === "GET" && path === "/api/books") {
    return listBooks(env.DB);
  }
  if (request.method === "GET" && path === "/api/clippings") {
    return listClippings(env.DB, url);
  }
  if (request.method === "POST" && path === "/api/import") {
    return importClippings(env.DB, request);
  }

  const bookMatch = path.match(/^\/api\/books\/([^/]+)$/);
  if (request.method === "PATCH" && bookMatch) {
    return updateBook(env.DB, decodeURIComponent(bookMatch[1]), request);
  }

  const clippingMatch = path.match(/^\/api\/clippings\/([^/]+)$/);
  if (request.method === "PATCH" && clippingMatch) {
    return updateClipping(env.DB, decodeURIComponent(clippingMatch[1]), request);
  }

  return apiError(404, "API route not found.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    try {
      return await handleApi(request, env);
    } catch (error) {
      if (isMigrationError(error)) {
        return apiError(
          503,
          "The D1 database has not been migrated yet.",
          "Run the D1 migrations before using Notebook.",
        );
      }

      console.error(error);
      return apiError(
        500,
        "Notebook encountered an unexpected database error.",
        error instanceof Error ? error.message : undefined,
      );
    }
  },
};
