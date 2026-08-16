import { BookOpen, Plus, Search } from "lucide-react";

interface NotebookHeaderProps {
  searchRef: { current: HTMLInputElement | null };
  query: string;
  onQueryChange: (query: string) => void;
  onOpenAll: () => void;
  onImport: () => void;
}

export function NotebookHeader({
  searchRef,
  query,
  onQueryChange,
  onOpenAll,
  onImport,
}: NotebookHeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-20 border-b border-ink/[0.07] bg-canvas/90 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-[1680px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          className="flex shrink-0 items-center gap-3"
          onClick={onOpenAll}
          aria-label="Open all clippings"
        >
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-ink text-white shadow-sm">
            <BookOpen className="h-5 w-5" />
          </span>
          <span className="hidden text-lg font-semibold tracking-tight sm:block">
            Notebook
          </span>
        </button>

        <div className="relative mx-auto hidden w-full max-w-xl md:block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search books, passages, and your notes"
            className="h-11 w-full rounded-full border border-ink/10 bg-white/75 pl-11 pr-16 text-sm outline-none transition placeholder:text-ink/35 focus:border-moss/40 focus:bg-white focus:ring-4 focus:ring-moss/10"
          />
          <kbd className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-ink/10 bg-canvas px-2 py-0.5 text-[10px] font-medium text-ink/35">
            /
          </kbd>
        </div>

        <button
          type="button"
          onClick={onImport}
          className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-ink/90 sm:px-5"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Import Kindle</span>
          <span className="sm:hidden">Import</span>
        </button>
      </div>
    </header>
  );
}
