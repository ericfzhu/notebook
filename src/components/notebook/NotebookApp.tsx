"use client";

import {
  Archive,
  BookOpen,
  Bookmark,
  ChevronRight,
  Clock3,
  Edit3,
  Highlighter,
  Import,
  Library,
  Loader2,
  Menu,
  MessageSquareText,
  PencilLine,
  Search,
  Star,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  BookSummary,
  BooksResponse,
  ClippingKind,
  ClippingRecord,
  ClippingsResponse,
  ImportResult,
  ImportSummary,
  LibraryStats,
  UpdateClippingPayload,
} from "@/lib/notebook";
import { BookEditor } from "./BookEditor";
import { ClippingEditor } from "./ClippingEditor";
import { ImportDialog } from "./ImportDialog";

type LibraryView =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "archived" }
  | { kind: "book"; bookId: string };

type KindFilter = "all" | ClippingKind;

const EMPTY_STATS: LibraryStats = {
  books: 0,
  clippings: 0,
  favorites: 0,
  notes: 0,
  archived: 0,
};

function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function relativeDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();
  if (Number.isNaN(elapsed)) return "Unknown";

  const days = Math.floor(elapsed / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 35) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function locator(clipping: ClippingRecord): string | null {
  if (clipping.locationStart !== null) {
    const end = clipping.locationEnd ?? clipping.locationStart;
    return end === clipping.locationStart
      ? `Location ${clipping.locationStart}`
      : `Locations ${clipping.locationStart}–${end}`;
  }

  if (clipping.pageStart !== null) {
    const end = clipping.pageEnd ?? clipping.pageStart;
    return end === clipping.pageStart
      ? `Page ${clipping.pageStart}`
      : `Pages ${clipping.pageStart}–${end}`;
  }

  return null;
}

function kindLabel(kind: ClippingKind): string {
  if (kind === "highlight") return "Highlight";
  if (kind === "note") return "Note";
  if (kind === "bookmark") return "Bookmark";
  return "Clipping";
}

function KindIcon({
  kind,
  className = "h-4 w-4",
}: {
  kind: ClippingKind;
  className?: string;
}) {
  if (kind === "note") return <MessageSquareText className={className} />;
  if (kind === "bookmark") return <Bookmark className={className} />;
  return <Highlighter className={className} />;
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; details?: string };
    return [body.error, body.details].filter(Boolean).join(" ") || "The request failed.";
  } catch {
    return "The request failed.";
  }
}

export function NotebookApp() {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [stats, setStats] = useState<LibraryStats>(EMPTY_STATS);
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null);
  const [view, setView] = useState<LibraryView>({ kind: "all" });
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [clippings, setClippings] = useState<ClippingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [isClippingsLoading, setIsClippingsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [clippingError, setClippingError] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [editingClipping, setEditingClipping] = useState<ClippingRecord | null>(null);
  const [editingBook, setEditingBook] = useState<BookSummary | null>(null);
  const [favoriteSavingId, setFavoriteSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchText.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchText]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const loadLibrary = useCallback(async () => {
    setIsLibraryLoading(true);
    setLibraryError(null);

    try {
      const response = await fetch("/api/books", {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(await responseError(response));

      const data = (await response.json()) as BooksResponse;
      setBooks(data.books);
      setStats(data.stats);
      setLastImport(data.lastImport);
      setView((current) => {
        if (
          current.kind === "book" &&
          !data.books.some((book) => book.id === current.bookId)
        ) {
          return { kind: "all" };
        }
        return current;
      });
    } catch (caught) {
      setLibraryError(
        caught instanceof Error ? caught.message : "The library could not be loaded.",
      );
    } finally {
      setIsLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const clippingQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "40");

    if (view.kind === "book") params.set("book", view.bookId);
    if (view.kind === "favorites") params.set("favorite", "true");
    if (view.kind === "archived") params.set("archived", "true");
    if (kindFilter !== "all") params.set("kind", kindFilter);
    if (debouncedSearch) params.set("q", debouncedSearch);

    return params;
  }, [debouncedSearch, kindFilter, view]);

  const loadClippings = useCallback(
    async (offset: number, append: boolean, signal?: AbortSignal) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsClippingsLoading(true);
        setClippingError(null);
      }

      const params = new URLSearchParams(clippingQuery);
      params.set("offset", String(offset));

      try {
        const response = await fetch(`/api/clippings?${params.toString()}`, {
          headers: { accept: "application/json" },
          signal,
        });
        if (!response.ok) throw new Error(await responseError(response));

        const data = (await response.json()) as ClippingsResponse;
        setClippings((current) =>
          append ? [...current, ...data.clippings] : data.clippings,
        );
        setTotal(data.total);
        setHasMore(data.hasMore);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;

        setClippingError(
          caught instanceof Error ? caught.message : "Clippings could not be loaded.",
        );
        if (!append) {
          setClippings([]);
          setTotal(0);
          setHasMore(false);
        }
      } finally {
        if (append) setIsLoadingMore(false);
        else setIsClippingsLoading(false);
      }
    },
    [clippingQuery],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadClippings(0, false, controller.signal);
    return () => controller.abort();
  }, [loadClippings]);

  const selectedBook = useMemo(
    () =>
      view.kind === "book"
        ? books.find((book) => book.id === view.bookId) ?? null
        : null,
    [books, view],
  );

  const viewTitle = selectedBook
    ? selectedBook.title
    : view.kind === "favorites"
      ? "Favorites"
      : view.kind === "archived"
        ? "Archived"
        : "Your library";

  const viewSubtitle = selectedBook
    ? selectedBook.author || `${selectedBook.clippingCount} clippings`
    : view.kind === "favorites"
      ? "Highlights you want close at hand"
      : view.kind === "archived"
        ? "Hidden from your active library"
        : "Every highlight, note, and bookmark";

  const selectView = (nextView: LibraryView) => {
    setView(nextView);
    setIsMobileNavOpen(false);
  };

  const handleImported = (result: ImportResult) => {
    setToast(
      result.added > 0
        ? `Added ${result.added.toLocaleString()} new clipping${result.added === 1 ? "" : "s"}.`
        : "Everything in that file was already in your library.",
    );
    void loadLibrary();
    void loadClippings(0, false);
  };

  const handleBookSaved = (saved: BookSummary) => {
    setBooks((current) =>
      current.map((book) => (book.id === saved.id ? saved : book)),
    );
    setClippings((current) =>
      current.map((clipping) =>
        clipping.bookId === saved.id
          ? { ...clipping, bookTitle: saved.title, bookAuthor: saved.author }
          : clipping,
      ),
    );
    setEditingBook(null);
    setToast("Book metadata updated.");
  };

  const handleClippingSaved = (saved: ClippingRecord) => {
    setEditingClipping(null);
    setClippings((current) =>
      current.map((item) => (item.id === saved.id ? saved : item)),
    );
    setToast("Clipping updated.");
    void loadLibrary();
    void loadClippings(0, false);
  };

  const toggleFavorite = async (clipping: ClippingRecord) => {
    if (favoriteSavingId) return;
    setFavoriteSavingId(clipping.id);

    const payload: UpdateClippingPayload = {
      editedText: clipping.editedText,
      commentary: clipping.commentary,
      tags: clipping.tags,
      isFavorite: !clipping.isFavorite,
      isArchived: clipping.isArchived,
    };

    try {
      const response = await fetch(
        `/api/clippings/${encodeURIComponent(clipping.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));

      const saved = (await response.json()) as ClippingRecord;
      setClippings((current) => {
        if (view.kind === "favorites" && !saved.isFavorite) {
          return current.filter((item) => item.id !== saved.id);
        }
        return current.map((item) => (item.id === saved.id ? saved : item));
      });
      setTotal((current) =>
        view.kind === "favorites" && !saved.isFavorite
          ? Math.max(0, current - 1)
          : current,
      );
      void loadLibrary();
    } catch (caught) {
      setToast(
        caught instanceof Error ? caught.message : "The favorite could not be changed.",
      );
    } finally {
      setFavoriteSavingId(null);
    }
  };

  const isViewActive = (candidate: LibraryView["kind"], bookId?: string) =>
    view.kind === candidate &&
    (candidate !== "book" ||
      (view.kind === "book" && view.bookId === bookId));

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-5 pt-6 lg:px-6">
        <button
          className="group flex items-center gap-3 text-left"
          onClick={() => selectView({ kind: "all" })}
          type="button"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-950 text-white shadow-sm transition group-hover:-translate-y-0.5">
            <BookOpen className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-base font-semibold tracking-tight text-stone-950">
              Notebook
            </span>
            <span className="block text-xs text-stone-500">Kindle highlights</span>
          </span>
        </button>
        <button
          aria-label="Close navigation"
          className="rounded-full p-2 text-stone-500 hover:bg-stone-200 lg:hidden"
          onClick={() => setIsMobileNavOpen(false)}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-4 lg:px-5">
        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
          onClick={() => {
            setIsMobileNavOpen(false);
            setIsImportOpen(true);
          }}
          type="button"
        >
          <Import className="h-4 w-4" />
          Import Kindle file
        </button>
      </div>

      <nav aria-label="Library navigation" className="mt-6 space-y-1 px-3 lg:px-4">
        {[
          {
            view: { kind: "all" } as LibraryView,
            label: "All clippings",
            count: stats.clippings,
            icon: Library,
          },
          {
            view: { kind: "favorites" } as LibraryView,
            label: "Favorites",
            count: stats.favorites,
            icon: Star,
          },
          {
            view: { kind: "archived" } as LibraryView,
            label: "Archived",
            count: stats.archived,
            icon: Archive,
          },
        ].map((item) => {
          const active = isViewActive(item.view.kind);
          const Icon = item.icon;

          return (
            <button
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-white font-semibold text-stone-950 shadow-sm ring-1 ring-stone-200"
                  : "text-stone-600 hover:bg-stone-200/70 hover:text-stone-900"
              }`}
              key={item.label}
              onClick={() => selectView(item.view)}
              type="button"
            >
              <Icon
                className={`h-4 w-4 ${
                  item.label === "Favorites" && active
                    ? "fill-amber-400 text-amber-500"
                    : ""
                }`}
              />
              <span className="flex-1 text-left">{item.label}</span>
              <span className="text-xs tabular-nums text-stone-400">
                {item.count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-7 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-6 pb-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
            Books
          </p>
          <span className="text-xs tabular-nums text-stone-400">{books.length}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 lg:px-4">
          {isLibraryLoading && books.length === 0 ? (
            <div className="space-y-2 px-2 py-2">
              {[0, 1, 2, 3].map((item) => (
                <div
                  className="h-14 animate-pulse rounded-xl bg-stone-200/70"
                  key={item}
                />
              ))}
            </div>
          ) : books.length === 0 ? (
            <p className="px-3 py-3 text-sm leading-6 text-stone-500">
              Your books will appear here after the first import.
            </p>
          ) : (
            <div className="space-y-1">
              {books.map((book) => {
                const active = isViewActive("book", book.id);
                return (
                  <button
                    aria-current={active ? "page" : undefined}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      active
                        ? "bg-amber-100/80 text-stone-950"
                        : "text-stone-700 hover:bg-stone-200/70"
                    }`}
                    key={book.id}
                    onClick={() =>
                      selectView({ kind: "book", bookId: book.id })
                    }
                    type="button"
                  >
                    <span
                      className={`h-8 w-1 shrink-0 rounded-full ${
                        active
                          ? "bg-amber-500"
                          : "bg-stone-300 group-hover:bg-stone-400"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {book.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-stone-500">
                        {book.author || "Unknown author"}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-stone-400">
                      {book.clippingCount}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-stone-200 px-5 py-4 text-xs leading-5 text-stone-500">
        {lastImport ? (
          <>
            <div className="flex items-center gap-2 font-medium text-stone-700">
              <Clock3 className="h-3.5 w-3.5" />
              Last import {relativeDate(lastImport.importedAt)}
            </div>
            <p className="mt-0.5 truncate pl-5">{lastImport.fileName}</p>
          </>
        ) : (
          <p>No imports yet.</p>
        )}
      </div>
    </div>
  );

  const noLibraryYet =
    !isLibraryLoading &&
    stats.clippings === 0 &&
    stats.archived === 0 &&
    !libraryError;

  return (
    <div className="min-h-screen bg-[#f3f0e9] text-stone-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-80 border-r border-stone-200 bg-[#ebe7de] lg:block">
        {renderSidebarContent()}
      </aside>

      {isMobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-stone-950/35 backdrop-blur-[1px]"
            onClick={() => setIsMobileNavOpen(false)}
            type="button"
          />
          <aside className="absolute inset-y-0 left-0 w-[min(88vw,21rem)] border-r border-stone-200 bg-[#ebe7de] shadow-2xl">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      <main className="min-h-screen lg:pl-80">
        <header className="sticky top-0 z-20 border-b border-stone-200/90 bg-[#f3f0e9]/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button
              aria-label="Open navigation"
              className="rounded-xl border border-stone-200 bg-white p-2.5 text-stone-700 shadow-sm lg:hidden"
              onClick={() => setIsMobileNavOpen(true)}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="relative min-w-0 flex-1 sm:max-w-xl">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                aria-label="Search clippings"
                className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-9 text-sm text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search text, books, authors, or tags"
                type="search"
                value={searchText}
              />
              {searchText && (
                <button
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  onClick={() => setSearchText("")}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              className="hidden items-center gap-2 rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 sm:flex"
              onClick={() => setIsImportOpen(true)}
              type="button"
            >
              <UploadCloud className="h-4 w-4" />
              Import
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-6 lg:px-8 lg:pt-10">
          {libraryError && (
            <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm leading-6 text-red-900">
              <p className="font-semibold">Notebook could not open the library.</p>
              <p className="mt-1">{libraryError}</p>
              <button
                className="mt-3 rounded-lg bg-red-900 px-3 py-2 text-xs font-semibold text-white"
                onClick={() => void loadLibrary()}
                type="button"
              >
                Try again
              </button>
            </section>
          )}

          {noLibraryYet ? (
            <section className="mx-auto mt-8 max-w-3xl overflow-hidden rounded-3xl border border-stone-200 bg-[#fffdf8] shadow-sm sm:mt-14">
              <div className="grid sm:grid-cols-[1.15fr_0.85fr]">
                <div className="p-7 sm:p-10">
                  <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                    <BookOpen className="h-3.5 w-3.5" />
                    Your reading, made useful
                  </div>
                  <h1 className="mt-5 max-w-lg text-3xl font-semibold tracking-[-0.03em] text-stone-950 sm:text-4xl">
                    Bring your Kindle highlights into one calm, searchable notebook.
                  </h1>
                  <p className="mt-4 max-w-xl text-base leading-7 text-stone-600">
                    Import My Clippings.txt, then edit, tag, favorite, annotate, and
                    revisit every idea without changing the original Kindle data.
                  </p>
                  <button
                    className="mt-7 inline-flex items-center gap-2 rounded-xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-stone-800"
                    onClick={() => setIsImportOpen(true)}
                    type="button"
                  >
                    <UploadCloud className="h-4 w-4" />
                    Import your first file
                  </button>
                  <p className="mt-3 text-xs leading-5 text-stone-500">
                    Future uploads are additive. Duplicates are skipped automatically.
                  </p>
                </div>
                <div className="flex min-h-64 items-center justify-center border-t border-stone-200 bg-[#e9e1d3] p-8 sm:border-l sm:border-t-0">
                  <div className="w-full max-w-xs rotate-[-2deg] rounded-2xl border border-stone-300 bg-white p-6 shadow-xl">
                    <div className="mb-5 h-2 w-20 rounded-full bg-amber-400" />
                    <p className="note-serif text-xl leading-8 text-stone-800">
                      “The ideas worth keeping become more valuable when they remain
                      easy to find.”
                    </p>
                    <div className="mt-6 flex items-center justify-between text-xs text-stone-400">
                      <span>Location 1284</span>
                      <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-2xl font-semibold tracking-[-0.025em] text-stone-950 sm:text-3xl">
                      {viewTitle}
                    </h1>
                    {selectedBook && (
                      <button
                        aria-label="Edit book title and author"
                        className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-stone-800"
                        onClick={() => setEditingBook(selectedBook)}
                        type="button"
                      >
                        <PencilLine className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-stone-500">
                    {viewSubtitle}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <p className="text-sm tabular-nums text-stone-500">
                    {isClippingsLoading
                      ? "Loading…"
                      : `${total.toLocaleString()} ${total === 1 ? "item" : "items"}`}
                  </p>
                  <label className="sr-only" htmlFor="kind-filter">
                    Filter by clipping type
                  </label>
                  <select
                    className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 shadow-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                    id="kind-filter"
                    onChange={(event) =>
                      setKindFilter(event.target.value as KindFilter)
                    }
                    value={kindFilter}
                  >
                    <option value="all">All types</option>
                    <option value="highlight">Highlights</option>
                    <option value="note">Notes</option>
                    <option value="bookmark">Bookmarks</option>
                    <option value="unknown">Other</option>
                  </select>
                </div>
              </section>

              {clippingError && (
                <section className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
                  <p>{clippingError}</p>
                  <button
                    className="mt-2 text-xs font-semibold underline underline-offset-4"
                    onClick={() => void loadClippings(0, false)}
                    type="button"
                  >
                    Try again
                  </button>
                </section>
              )}

              {isClippingsLoading ? (
                <div className="space-y-4">
                  {[0, 1, 2].map((item) => (
                    <div
                      className="h-56 animate-pulse rounded-2xl border border-stone-200 bg-white/70"
                      key={item}
                    />
                  ))}
                </div>
              ) : clippings.length === 0 ? (
                <section className="rounded-3xl border border-dashed border-stone-300 bg-white/55 px-6 py-16 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-200 text-stone-600">
                    {view.kind === "archived" ? (
                      <Archive className="h-6 w-6" />
                    ) : (
                      <Search className="h-6 w-6" />
                    )}
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-stone-900">
                    {debouncedSearch
                      ? "No matching clippings"
                      : view.kind === "archived"
                        ? "Nothing is archived"
                        : view.kind === "favorites"
                          ? "No favorites yet"
                          : "No clippings in this view"}
                  </h2>
                  <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-stone-500">
                    {debouncedSearch
                      ? "Try a different word, clear the type filter, or search the whole library."
                      : view.kind === "favorites"
                        ? "Use the star on any clipping to keep it here."
                        : view.kind === "archived"
                          ? "Archived clippings stay safe and can be restored at any time."
                          : "Import another Kindle file or choose a different book."}
                  </p>
                  {debouncedSearch && (
                    <button
                      className="mt-4 rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white"
                      onClick={() => setSearchText("")}
                      type="button"
                    >
                      Clear search
                    </button>
                  )}
                </section>
              ) : (
                <div className="space-y-4">
                  {clippings.map((clipping) => {
                    const displayText = clipping.editedText ?? clipping.sourceText;
                    const clippingLocator = locator(clipping);

                    return (
                      <article
                        className="group rounded-2xl border border-stone-200 bg-[#fffdf8] shadow-[0_1px_2px_rgba(28,25,23,0.04)] transition hover:border-stone-300 hover:shadow-md"
                        key={clipping.id}
                      >
                        <div className="p-5 sm:p-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-stone-500">
                                <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.12em] text-amber-700">
                                  <KindIcon
                                    kind={clipping.kind}
                                    className="h-3.5 w-3.5"
                                  />
                                  {kindLabel(clipping.kind)}
                                </span>
                                {view.kind !== "book" && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    {view.kind === "archived" ? (
                                      <span className="max-w-72 truncate font-medium text-stone-600">
                                        {clipping.bookTitle}
                                      </span>
                                    ) : (
                                      <button
                                        className="max-w-72 truncate font-medium text-stone-600 hover:text-stone-950 hover:underline"
                                        onClick={() =>
                                          selectView({
                                            kind: "book",
                                            bookId: clipping.bookId,
                                          })
                                        }
                                        type="button"
                                      >
                                        {clipping.bookTitle}
                                      </button>
                                    )}
                                  </>
                                )}
                                {clippingLocator && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>{clippingLocator}</span>
                                  </>
                                )}
                                {clipping.sourceAddedAt && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <time dateTime={clipping.sourceAddedAt}>
                                      {formatDate(clipping.sourceAddedAt)}
                                    </time>
                                  </>
                                )}
                              </div>
                              {view.kind !== "book" && clipping.bookAuthor && (
                                <p className="mt-1 truncate text-xs text-stone-400">
                                  {clipping.bookAuthor}
                                </p>
                              )}
                            </div>

                            <button
                              aria-label={
                                clipping.isFavorite
                                  ? "Remove from favorites"
                                  : "Add to favorites"
                              }
                              aria-pressed={clipping.isFavorite}
                              className="rounded-full p-2 text-stone-300 transition hover:bg-amber-50 hover:text-amber-500 disabled:opacity-50"
                              disabled={favoriteSavingId === clipping.id}
                              onClick={() => void toggleFavorite(clipping)}
                              type="button"
                            >
                              {favoriteSavingId === clipping.id ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                <Star
                                  className={`h-5 w-5 ${
                                    clipping.isFavorite
                                      ? "fill-amber-400 text-amber-500"
                                      : ""
                                  }`}
                                />
                              )}
                            </button>
                          </div>

                          <button
                            className="mt-5 block w-full text-left"
                            onClick={() => setEditingClipping(clipping)}
                            type="button"
                          >
                            <blockquote className="note-serif whitespace-pre-wrap text-[18px] leading-8 text-stone-800 sm:text-[19px]">
                              {displayText || "Bookmark"}
                            </blockquote>
                          </button>

                          {clipping.commentary && (
                            <div className="mt-5 flex gap-3 rounded-xl bg-stone-100 px-4 py-3 text-sm leading-6 text-stone-600">
                              <MessageSquareText className="mt-1 h-4 w-4 shrink-0 text-stone-500" />
                              <p className="line-clamp-3 whitespace-pre-wrap">
                                {clipping.commentary}
                              </p>
                            </div>
                          )}

                          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              {clipping.editedText && (
                                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                                  Edited
                                </span>
                              )}
                              {clipping.tags.map((tag) => (
                                <button
                                  className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-200 hover:text-stone-900"
                                  key={tag}
                                  onClick={() => setSearchText(tag)}
                                  type="button"
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>

                            <button
                              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-500 opacity-100 transition hover:bg-stone-100 hover:text-stone-900 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                              onClick={() => setEditingClipping(clipping)}
                              type="button"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}

                  {hasMore && (
                    <div className="flex justify-center pt-3">
                      <button
                        className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-50"
                        disabled={isLoadingMore}
                        onClick={() =>
                          void loadClippings(clippings.length, true)
                        }
                        type="button"
                      >
                        {isLoadingMore ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ChevronRight className="h-4 w-4 rotate-90" />
                        )}
                        {isLoadingMore ? "Loading…" : "Load more"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <button
        aria-label="Import Kindle file"
        className="fixed bottom-5 right-5 z-20 flex h-12 items-center gap-2 rounded-full bg-stone-950 px-5 text-sm font-semibold text-white shadow-xl hover:bg-stone-800 sm:hidden"
        onClick={() => setIsImportOpen(true)}
        type="button"
      >
        <UploadCloud className="h-4 w-4" />
        Import
      </button>

      {toast && (
        <div
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl bg-stone-950 px-4 py-3 text-center text-sm font-medium text-white shadow-xl sm:bottom-6"
          role="status"
        >
          {toast}
        </div>
      )}

      <ImportDialog
        onClose={() => setIsImportOpen(false)}
        onImported={handleImported}
        open={isImportOpen}
      />
      <ClippingEditor
        clipping={editingClipping}
        onClose={() => setEditingClipping(null)}
        onSaved={handleClippingSaved}
        open={Boolean(editingClipping)}
      />
      <BookEditor
        book={editingBook}
        onClose={() => setEditingBook(null)}
        onSaved={handleBookSaved}
        open={Boolean(editingBook)}
      />
    </div>
  );
}
