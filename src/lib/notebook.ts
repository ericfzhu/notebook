export type ClippingKind = "highlight" | "note" | "bookmark" | "unknown";

export interface ParsedClipping {
  id: string;
  bookId: string;
  bookSourceKey: string;
  fingerprint: string;
  sourceTitle: string;
  sourceAuthor: string;
  kind: ClippingKind;
  sourceText: string;
  pageStart: number | null;
  pageEnd: number | null;
  locationStart: number | null;
  locationEnd: number | null;
  sourceAddedAt: string | null;
  rawMetadata: string;
}

export interface KindleParseError {
  section: number;
  heading: string | null;
  reason: string;
}

export interface KindleParseResult {
  clippings: ParsedClipping[];
  errors: KindleParseError[];
  sectionCount: number;
  duplicateCount: number;
  bookCount: number;
}

export interface ImportPayload {
  fileName: string;
  fileSize: number;
  fileHash: string;
  clippings: ParsedClipping[];
  parseSummary: {
    sectionCount: number;
    errorCount: number;
    duplicateCount: number;
  };
}

export interface ImportResult {
  importId: string;
  parsed: number;
  added: number;
  duplicates: number;
  invalid: number;
  books: number;
  importedAt: string;
}

export interface BookSummary {
  id: string;
  title: string;
  author: string;
  sourceTitle: string;
  sourceAuthor: string;
  clippingCount: number;
  favoriteCount: number;
  lastClippingAt: string | null;
}

export interface LibraryStats {
  books: number;
  clippings: number;
  favorites: number;
  notes: number;
  archived: number;
}

export interface ImportSummary {
  id: string;
  fileName: string;
  importedAt: string;
  parsedCount: number;
  insertedCount: number;
  duplicateCount: number;
  invalidCount: number;
}

export interface BooksResponse {
  books: BookSummary[];
  stats: LibraryStats;
  lastImport: ImportSummary | null;
}

export interface ClippingRecord {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  kind: ClippingKind;
  sourceText: string;
  editedText: string | null;
  commentary: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  locationStart: number | null;
  locationEnd: number | null;
  sourceAddedAt: string | null;
  rawMetadata: string;
  isFavorite: boolean;
  isArchived: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ClippingsResponse {
  clippings: ClippingRecord[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface UpdateClippingPayload {
  editedText: string | null;
  commentary: string | null;
  isFavorite: boolean;
  isArchived: boolean;
  tags: string[];
}

export interface UpdateBookPayload {
  displayTitle: string | null;
  displayAuthor: string | null;
}
