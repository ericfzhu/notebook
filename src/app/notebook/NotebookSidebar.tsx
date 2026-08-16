import { Archive, BookOpen, CircleAlert, LibraryBig, Star, Tag } from "lucide-react";
import type { LibraryOverview, LibraryView } from "./types";
import { NavigationButton, pluralize } from "./ui";

interface NotebookSidebarProps {
  overview: LibraryOverview;
  overviewLoaded: boolean;
  view: LibraryView;
  selectedBookId: string | null;
  selectedTagId: string | null;
  onSelectView: (view: LibraryView) => void;
  onSelectBook: (bookId: string) => void;
  onSelectTag: (tagId: string) => void;
}

export function NotebookSidebar({
  overview,
  overviewLoaded,
  view,
  selectedBookId,
  selectedTagId,
  onSelectView,
  onSelectBook,
  onSelectTag,
}: NotebookSidebarProps) {
  return (
    <aside className="hidden h-[calc(100vh-7.5rem)] min-h-0 flex-col xl:flex">
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        <nav aria-label="Notebook views" className="space-y-1">
          <NavigationButton
            active={view === "all" && !selectedBookId && !selectedTagId}
            icon={<LibraryBig className="h-4 w-4" />}
            label="All clippings"
            count={overview.stats.totalClippings - overview.stats.archived}
            onClick={() => onSelectView("all")}
          />
          <NavigationButton
            active={view === "favorites"}
            icon={<Star className="h-4 w-4" />}
            label="Favorites"
            count={overview.stats.favorites}
            onClick={() => onSelectView("favorites")}
          />
          <NavigationButton
            active={view === "review"}
            icon={<CircleAlert className="h-4 w-4" />}
            label="Needs review"
            count={overview.stats.needsReview}
            onClick={() => onSelectView("review")}
          />
          <NavigationButton
            active={view === "archived"}
            icon={<Archive className="h-4 w-4" />}
            label="Archive"
            count={overview.stats.archived}
            onClick={() => onSelectView("archived")}
          />
        </nav>

        <section className="mt-7">
          <div className="mb-2 flex items-center justify-between px-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.17em] text-ink/38">
              Books
            </h2>
            <span className="text-[11px] tabular-nums text-ink/30">
              {overview.books.length}
            </span>
          </div>
          <div className="space-y-0.5">
            {overview.books.map((book) => (
              <NavigationButton
                key={book.id}
                active={selectedBookId === book.id}
                icon={<BookOpen className="h-4 w-4" />}
                label={book.title}
                count={book.clippingCount}
                onClick={() => onSelectBook(book.id)}
              />
            ))}
            {overviewLoaded && overview.books.length === 0 && (
              <p className="px-3 py-2 text-xs leading-5 text-ink/40">
                Imported books will appear here.
              </p>
            )}
          </div>
        </section>

        {overview.tags.length > 0 && (
          <section className="mt-7">
            <div className="mb-2 flex items-center justify-between px-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.17em] text-ink/38">
                Tags
              </h2>
              <Tag className="h-3.5 w-3.5 text-ink/25" />
            </div>
            <div className="space-y-0.5">
              {overview.tags.map((tag) => (
                <NavigationButton
                  key={tag.id}
                  active={selectedTagId === tag.id}
                  icon={<span className="text-xs font-semibold">#</span>}
                  label={tag.name}
                  count={tag.clippingCount}
                  onClick={() => onSelectTag(tag.id)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {overview.recentImport && (
        <div className="mt-4 rounded-2xl border border-ink/[0.07] bg-white/55 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink/35">
            Last import
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-ink/65">
            {overview.recentImport.fileName}
          </p>
          <p className="mt-1 text-[11px] text-ink/40">
            {pluralize(overview.recentImport.insertedCount, "new clipping")}
          </p>
        </div>
      )}
    </aside>
  );
}
