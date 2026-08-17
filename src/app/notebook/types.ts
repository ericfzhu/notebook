export type ClippingKind = "highlight" | "note" | "bookmark" | "unknown";
export type LibraryView = "all" | "favorites" | "review" | "archived";
export type SortOrder = "recent" | "oldest" | "location";

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

export interface ClippingListResponse {
  items: Clipping[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ParseIssue {
  section: number;
  message: string;
  preview: string;
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
  issues: ParseIssue[];
}
