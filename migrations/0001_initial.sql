PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'complete')),
  total_chunks INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  parsed_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS imports_imported_at_idx
  ON imports(imported_at DESC);

CREATE TABLE IF NOT EXISTS import_chunks (
  import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (import_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL UNIQUE,
  source_title TEXT NOT NULL,
  source_author TEXT NOT NULL DEFAULT '',
  display_title TEXT,
  display_author TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clippings (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL UNIQUE,
  source_anchor TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('highlight', 'note', 'bookmark', 'unknown')),
  source_text TEXT NOT NULL DEFAULT '',
  edited_text TEXT,
  personal_note TEXT,
  page_start INTEGER,
  page_end INTEGER,
  location_start INTEGER,
  location_end INTEGER,
  source_added_at TEXT,
  source_added_at_label TEXT,
  raw_metadata TEXT NOT NULL,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  archived_at TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS clippings_import_id_idx
  ON clippings(import_id);
CREATE INDEX IF NOT EXISTS clippings_book_id_idx
  ON clippings(book_id);
CREATE INDEX IF NOT EXISTS clippings_source_anchor_idx
  ON clippings(source_anchor);
CREATE INDEX IF NOT EXISTS clippings_source_added_at_idx
  ON clippings(source_added_at DESC);
CREATE INDEX IF NOT EXISTS clippings_active_idx
  ON clippings(archived_at, is_favorite, needs_review);
CREATE INDEX IF NOT EXISTS clippings_location_idx
  ON clippings(book_id, location_start, page_start);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clipping_tags (
  clipping_id TEXT NOT NULL REFERENCES clippings(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (clipping_id, tag_id)
);

CREATE INDEX IF NOT EXISTS clipping_tags_tag_id_idx
  ON clipping_tags(tag_id, clipping_id);
