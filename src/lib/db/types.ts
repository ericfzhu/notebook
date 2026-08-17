import type { ClippingKind } from "@/lib/kindle/parser";

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]>;
}

export interface NotebookStats {
  totalClippings: number;
  totalBooks: number;
  favorites: number;
  archived: number;
  needsReview: number;
}

export interface BookSummary {
  id: string;
  title: string;
  author: string;
  clippingCount: number;
  favoriteCount: number;
  lastClippingAt: string | null;
}

export interface TagSummary {
  id: string;
  name: string;
  clippingCount: number;
}

export interface ImportSummary {
  id: string;
  fileName: string;
  importedAt: string;
  parsedCount: number;
  insertedCount: number;
  duplicateCount: number;
  conflictCount: number;
  invalidCount: number;
}

export interface LibraryOverview {
  stats: NotebookStats;
  books: BookSummary[];
  tags: TagSummary[];
  recentImport: ImportSummary | null;
}

export interface ClippingTag {
  id: string;
  name: string;
}

export interface Clipping {
  id: string;
  bookId: string;
  title: string;
  author: string;
  kind: ClippingKind;
  sourceText: string;
  editedText: string | null;
  personalNote: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  locationStart: number | null;
  locationEnd: number | null;
  sourceAddedAt: string | null;
  sourceAddedAtLabel: string | null;
  rawMetadata: string;
  isFavorite: boolean;
  isArchived: boolean;
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
  tags: ClippingTag[];
}

export interface ClippingFilters {
  bookId?: string;
  tagId?: string;
  query?: string;
  kind?: ClippingKind | "all";
  view?: "all" | "favorites" | "review" | "archived";
  sort?: "recent" | "oldest" | "location";
  limit?: number;
  offset?: number;
}

export interface ClippingList {
  items: Clipping[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface UpdateClippingInput {
  editedText?: string | null;
  personalNote?: string | null;
  isFavorite?: boolean;
  archived?: boolean;
  needsReview?: boolean;
  tags?: string[];
}

export interface ImportResult {
  importId: string;
  fileName: string;
  parsedCount: number;
  insertedCount: number;
  duplicateCount: number;
  conflictCount: number;
  invalidCount: number;
  alreadyImported: boolean;
}

export interface ImportStartResult {
  importId: string;
  alreadyImported: boolean;
  result: ImportResult | null;
}

export interface ImportChunkResult {
  chunkIndex: number;
  insertedCount: number;
  duplicateCount: number;
  conflictCount: number;
  alreadyProcessed: boolean;
}

export class ImportStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportStateError";
  }
}
