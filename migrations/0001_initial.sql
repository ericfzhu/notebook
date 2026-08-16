PRAGMA foreign_keys = ON;

CREATE TABLE books (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL UNIQUE,
  source_title TEXT NOT NULL,
  source_author TEXT NOT NULL DEFAULT '',
  display_title TEXT,
  display_author TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE clippings (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('highlight', 'note', 'bookmark', 'unknown')),
  source_text TEXT NOT NULL,
  edited_text TEXT,
  commentary TEXT,
  page_start INTEGER,
  page_end INTEGER,
  location_start INTEGER,
  location_end INTEGER,
  source_added_at TEXT,
  raw_metadata TEXT NOT NULL,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE clipping_tags (
  clipping_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (clipping_id, tag_id),
  FOREIGN KEY (clipping_id) REFERENCES clippings(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) WITHOUT ROWID, STRICT;

CREATE TABLE imports (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  parsed_count INTEGER NOT NULL,
  inserted_count INTEGER NOT NULL,
  duplicate_count INTEGER NOT NULL,
  invalid_count INTEGER NOT NULL,
  imported_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_clippings_book_location
  ON clippings (book_id, location_start, page_start);

CREATE INDEX idx_clippings_book_added
  ON clippings (book_id, source_added_at);

CREATE INDEX idx_clippings_kind
  ON clippings (kind);

CREATE INDEX idx_clippings_favorite
  ON clippings (is_favorite)
  WHERE is_favorite = 1;

CREATE INDEX idx_clippings_archived
  ON clippings (archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX idx_imports_imported_at
  ON imports (imported_at DESC);
