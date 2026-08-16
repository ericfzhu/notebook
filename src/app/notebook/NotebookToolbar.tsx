import { Search, SlidersHorizontal, X } from "lucide-react";
import type {
  ClippingKind,
  LibraryOverview,
  LibraryView,
  SortOrder,
} from "./types";
import { pluralize } from "./ui";

interface NotebookToolbarProps {
  mobileSearchRef: { current: HTMLInputElement | null };
  overview: LibraryOverview;
  heading: string;
  subheading: string;
  query: string;
  kind: ClippingKind | "all";
  sort: SortOrder;
  view: LibraryView;
  selectedBookId: string | null;
  selectedTagId: string | null;
  filtersOpen: boolean;
  isLoading: boolean;
  total: number;
  onQueryChange: (query: string) => void;
  onKindChange: (kind: ClippingKind | "all") => void;
  onSortChange: (sort: SortOrder) => void;
  onToggleFilters: () => void;
  onResetScope: (view?: LibraryView) => void;
  onSelectBook: (bookId: string) => void;
  onSelectTag: (tagId: string) => void;
}

export function NotebookToolbar({
  mobileSearchRef,
  overview,
  heading,
  subheading,
  query,
  kind,
  sort,
  view,
  selectedBookId,
  selectedTagId,
  filtersOpen,
  isLoading,
  total,
  onQueryChange,
  onKindChange,
  onSortChange,
  onToggleFilters,
  onResetScope,
  onSelectBook,
  onSelectTag,
}: NotebookToolbarProps) {
  return (
    <>
      <div className="mb-4 space-y-3 md:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
          <input
            ref={mobileSearchRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search your notebook"
            className="h-11 w-full rounded-full border border-ink/10 bg-white pl-11 pr-10 text-sm outline-none focus:border-moss/40 focus:ring-4 focus:ring-moss/10"
          />
          {query && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink/35"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.17em] text-moss">
            Library
          </p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {heading}
          </h1>
          <p className="mt-1 truncate text-sm text-ink/45">{subheading}</p>
        </div>
        <button
          type="button"
          className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition xl:hidden ${
            filtersOpen
              ? "border-ink bg-ink text-white"
              : "border-ink/10 bg-white text-ink/65"
          }`}
          onClick={onToggleFilters}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          aria-label="Clipping type"
          value={kind}
          onChange={(event) =>
            onKindChange(event.target.value as ClippingKind | "all")
          }
          className="rounded-full border border-ink/10 bg-white px-3.5 py-2 text-xs font-semibold text-ink/60 outline-none focus:border-moss/40"
        >
          <option value="all">All types</option>
          <option value="highlight">Highlights</option>
          <option value="note">Notes</option>
          <option value="bookmark">Bookmarks</option>
          <option value="unknown">Other</option>
        </select>
        <select
          aria-label="Sort clippings"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortOrder)}
          className="rounded-full border border-ink/10 bg-white px-3.5 py-2 text-xs font-semibold text-ink/60 outline-none focus:border-moss/40"
        >
          <option value="recent">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="location">Book location</option>
        </select>
        {(selectedBookId || selectedTagId || view !== "all" || kind !== "all") && (
          <button
            type="button"
            className="rounded-full px-3 py-2 text-xs font-semibold text-moss hover:bg-moss/8"
            onClick={() => {
              onResetScope("all");
              onKindChange("all");
            }}
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs tabular-nums text-ink/38">
          {isLoading ? "Loading…" : pluralize(total, "clipping")}
        </span>
      </div>

      {filtersOpen && (
        <div className="mb-4 rounded-2xl border border-ink/10 bg-white p-3 xl:hidden">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["all", "All", overview.stats.totalClippings - overview.stats.archived],
                ["favorites", "Favorites", overview.stats.favorites],
                ["review", "Review", overview.stats.needsReview],
                ["archived", "Archive", overview.stats.archived],
              ] as const
            ).map(([nextView, label, count]) => (
              <button
                type="button"
                key={nextView}
                onClick={() => onResetScope(nextView)}
                className={`rounded-xl px-3 py-2 text-left text-xs font-semibold ${
                  view === nextView && !selectedBookId && !selectedTagId
                    ? "bg-ink text-white"
                    : "bg-canvas text-ink/60"
                }`}
              >
                {label}
                <span className="ml-1 opacity-50">{count}</span>
              </button>
            ))}
          </div>
          {overview.books.length > 0 && (
            <select
              aria-label="Choose a book"
              className="mt-3 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink/70"
              value={selectedBookId ?? ""}
              onChange={(event) =>
                event.target.value
                  ? onSelectBook(event.target.value)
                  : onResetScope("all")
              }
            >
              <option value="">All books</option>
              {overview.books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title} ({book.clippingCount})
                </option>
              ))}
            </select>
          )}
          {overview.tags.length > 0 && (
            <select
              aria-label="Choose a tag"
              className="mt-2 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink/70"
              value={selectedTagId ?? ""}
              onChange={(event) =>
                event.target.value
                  ? onSelectTag(event.target.value)
                  : onResetScope("all")
              }
            >
              <option value="">All tags</option>
              {overview.tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  #{tag.name} ({tag.clippingCount})
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </>
  );
}
