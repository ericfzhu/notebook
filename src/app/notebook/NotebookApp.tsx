"use client";

import { Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ClippingEditor } from "./ClippingEditor";
import { ImportDialog } from "./ImportDialog";
import { NotebookHeader } from "./NotebookHeader";
import { NotebookResults } from "./NotebookResults";
import { NotebookSidebar } from "./NotebookSidebar";
import { NotebookToolbar } from "./NotebookToolbar";
import type {
  Clipping,
  ClippingKind,
  ClippingListResponse,
  LibraryOverview,
  LibraryView,
  SortOrder,
} from "./types";

const PAGE_SIZE = 36;

const EMPTY_OVERVIEW: LibraryOverview = {
  stats: {
    totalClippings: 0,
    totalBooks: 0,
    favorites: 0,
    archived: 0,
    needsReview: 0,
  },
  books: [],
  tags: [],
  recentImport: null,
};

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

export function NotebookApp() {
  const desktopSearchRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);
  const [overview, setOverview] = useState<LibraryOverview>(EMPTY_OVERVIEW);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [clippings, setClippings] = useState<Clipping[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedClipping, setSelectedClipping] = useState<Clipping | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [view, setView] = useState<LibraryView>("all");
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [kind, setKind] = useState<ClippingKind | "all">("all");
  const [sort, setSort] = useState<SortOrder>("recent");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const refreshOverview = useCallback(async () => {
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      if (!response.ok) throw new Error(await readApiError(response));
      const data = (await response.json()) as LibraryOverview;
      setOverview(data);
      setOverviewError(null);
    } catch (error) {
      setOverviewError(
        error instanceof Error ? error.message : "Unable to load the library.",
      );
    } finally {
      setOverviewLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview, reloadToken]);

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({
      view,
      kind,
      sort,
      limit: String(PAGE_SIZE),
      offset: "0",
    });

    if (selectedBookId) parameters.set("bookId", selectedBookId);
    if (selectedTagId) parameters.set("tagId", selectedTagId);
    if (debouncedQuery) parameters.set("q", debouncedQuery);

    setIsLoading(true);
    setListError(null);

    fetch(`/api/clippings?${parameters.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response));
        return (await response.json()) as ClippingListResponse;
      })
      .then((data) => {
        setClippings(data.items);
        setTotal(data.total);
        setHasMore(data.hasMore);
        setSelectedClipping((current) => {
          if (!current) return null;
          return data.items.find((item) => item.id === current.id) ?? current;
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setListError(
          error instanceof Error ? error.message : "Unable to load clippings.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, kind, reloadToken, selectedBookId, selectedTagId, sort, view]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        const input = window.matchMedia("(min-width: 768px)").matches
          ? desktopSearchRef.current
          : mobileSearchRef.current;
        input?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const activeBook = useMemo(
    () => overview.books.find((book) => book.id === selectedBookId) ?? null,
    [overview.books, selectedBookId],
  );
  const activeTag = useMemo(
    () => overview.tags.find((tag) => tag.id === selectedTagId) ?? null,
    [overview.tags, selectedTagId],
  );

  const heading = activeBook
    ? activeBook.title
    : activeTag
      ? `#${activeTag.name}`
      : view === "favorites"
        ? "Favorites"
        : view === "review"
          ? "Needs review"
          : view === "archived"
            ? "Archive"
            : "All clippings";
  const subheading = activeBook
    ? activeBook.author || "Unknown author"
    : activeTag
      ? "Clippings organized under this tag"
      : view === "favorites"
        ? "The passages worth keeping close"
        : view === "review"
          ? "Imports that may differ at the same Kindle location"
          : view === "archived"
            ? "Clippings removed from your active library"
            : "Search, edit, and connect what you have read";

  const canLeaveEditor = () =>
    !editorDirty ||
    window.confirm("Discard the changes you have not saved?");

  const resetScope = (nextView: LibraryView = "all") => {
    if (!canLeaveEditor()) return;

    setSelectedClipping(null);
    setView(nextView);
    setSelectedBookId(null);
    setSelectedTagId(null);
    setFiltersOpen(false);
  };

  const selectBook = (bookId: string) => {
    if (!canLeaveEditor()) return;

    setSelectedClipping(null);
    setView("all");
    setSelectedBookId(bookId);
    setSelectedTagId(null);
    setFiltersOpen(false);
  };

  const selectTag = (tagId: string) => {
    if (!canLeaveEditor()) return;

    setSelectedClipping(null);
    setView("all");
    setSelectedTagId(tagId);
    setSelectedBookId(null);
    setFiltersOpen(false);
  };

  const selectClipping = (clipping: Clipping) => {
    if (selectedClipping?.id !== clipping.id && !canLeaveEditor()) return;
    setSelectedClipping(clipping);
  };

  const loadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);

    const parameters = new URLSearchParams({
      view,
      kind,
      sort,
      limit: String(PAGE_SIZE),
      offset: String(clippings.length),
    });
    if (selectedBookId) parameters.set("bookId", selectedBookId);
    if (selectedTagId) parameters.set("tagId", selectedTagId);
    if (debouncedQuery) parameters.set("q", debouncedQuery);

    try {
      const response = await fetch(`/api/clippings?${parameters.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const data = (await response.json()) as ClippingListResponse;
      setClippings((current) => [...current, ...data.items]);
      setHasMore(data.hasMore);
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : "Unable to load more clippings.",
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleUpdated = (updated: Clipping) => {
    const shouldRemain =
      (view === "archived" ? updated.isArchived : !updated.isArchived) &&
      (view !== "favorites" || updated.isFavorite) &&
      (view !== "review" || updated.needsReview);

    setClippings((current) =>
      shouldRemain
        ? current.map((item) => (item.id === updated.id ? updated : item))
        : current.filter((item) => item.id !== updated.id),
    );
    setSelectedClipping(shouldRemain ? updated : null);
    if (!shouldRemain) setTotal((current) => Math.max(0, current - 1));
    setReloadToken((current) => current + 1);
  };

  const clearFilters = () => {
    setQuery("");
    setKind("all");
    resetScope("all");
  };

  const isEmptyLibrary = overviewLoaded && overview.stats.totalClippings === 0;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <NotebookHeader
        searchRef={desktopSearchRef}
        query={query}
        onQueryChange={setQuery}
        onOpenAll={() => resetScope("all")}
        onImport={() => setImportOpen(true)}
      />

      <div className="mx-auto grid max-w-[1680px] gap-5 px-4 py-5 sm:px-6 lg:px-8 xl:grid-cols-[17rem_minmax(0,1fr)_25rem]">
        <NotebookSidebar
          overview={overview}
          overviewLoaded={overviewLoaded}
          view={view}
          selectedBookId={selectedBookId}
          selectedTagId={selectedTagId}
          onSelectView={resetScope}
          onSelectBook={selectBook}
          onSelectTag={selectTag}
        />

        <main className="min-w-0">
          <NotebookToolbar
            mobileSearchRef={mobileSearchRef}
            overview={overview}
            heading={heading}
            subheading={subheading}
            query={query}
            kind={kind}
            sort={sort}
            view={view}
            selectedBookId={selectedBookId}
            selectedTagId={selectedTagId}
            filtersOpen={filtersOpen}
            isLoading={isLoading}
            total={total}
            onQueryChange={setQuery}
            onKindChange={setKind}
            onSortChange={setSort}
            onToggleFilters={() => setFiltersOpen((current) => !current)}
            onResetScope={resetScope}
            onSelectBook={selectBook}
            onSelectTag={selectTag}
          />

          <NotebookResults
            overviewError={overviewError}
            listError={listError}
            isLoading={isLoading}
            isLoadingMore={isLoadingMore}
            isEmptyLibrary={isEmptyLibrary}
            clippings={clippings}
            selectedClippingId={selectedClipping?.id ?? null}
            hasMore={hasMore}
            onSelect={selectClipping}
            onLoadMore={loadMore}
            onRetry={() => setReloadToken((current) => current + 1)}
            onImport={() => setImportOpen(true)}
            onClearFilters={clearFilters}
          />
        </main>

        <div className={selectedClipping ? "block" : "hidden xl:block"}>
          {selectedClipping ? (
            <ClippingEditor
              clipping={selectedClipping}
              onClose={() => setSelectedClipping(null)}
              onUpdated={handleUpdated}
              onDirtyChange={setEditorDirty}
            />
          ) : (
            <div className="sticky top-[6.25rem] grid h-[calc(100vh-7.5rem)] place-items-center rounded-[1.75rem] border border-dashed border-ink/12 bg-white/35 px-8 text-center">
              <div>
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ink/[0.05] text-ink/35">
                  <Sparkles className="h-6 w-6" />
                </span>
                <p className="mt-4 text-sm font-semibold text-ink/65">
                  Select a clipping to work with it
                </p>
                <p className="mt-2 text-xs leading-5 text-ink/40">
                  Edit the text, add your own note, tag it, or inspect the original
                  Kindle metadata.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => setReloadToken((current) => current + 1)}
      />
    </div>
  );
}
