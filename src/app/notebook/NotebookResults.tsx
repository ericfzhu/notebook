import { CircleAlert, FilePlus2, LoaderCircle, Search, Upload } from "lucide-react";
import type { Clipping } from "./types";
import { ClippingCard, LoadingCards } from "./ui";

interface NotebookResultsProps {
  overviewError: string | null;
  listError: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  isEmptyLibrary: boolean;
  clippings: Clipping[];
  selectedClippingId: string | null;
  hasMore: boolean;
  onSelect: (clipping: Clipping) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onImport: () => void;
  onClearFilters: () => void;
}

export function NotebookResults({
  overviewError,
  listError,
  isLoading,
  isLoadingMore,
  isEmptyLibrary,
  clippings,
  selectedClippingId,
  hasMore,
  onSelect,
  onLoadMore,
  onRetry,
  onImport,
  onClearFilters,
}: NotebookResultsProps) {
  return (
    <>
      {overviewError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
          {overviewError}
        </div>
      )}

      {isLoading ? (
        <LoadingCards />
      ) : listError ? (
        <div className="rounded-[1.5rem] border border-red-200 bg-red-50 px-6 py-7 text-center text-red-900">
          <CircleAlert className="mx-auto h-6 w-6" />
          <p className="mt-3 font-semibold">The library could not be loaded</p>
          <p className="mt-1 text-sm opacity-70">{listError}</p>
          <button
            type="button"
            className="mt-4 rounded-full bg-red-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      ) : clippings.length === 0 ? (
        <div className="grid min-h-[28rem] place-items-center rounded-[1.75rem] border border-dashed border-ink/15 bg-white/40 px-6 py-12 text-center">
          <div className="max-w-md">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-[1.4rem] bg-moss/10 text-moss">
              {isEmptyLibrary ? (
                <FilePlus2 className="h-7 w-7" />
              ) : (
                <Search className="h-7 w-7" />
              )}
            </span>
            <h2 className="mt-5 text-xl font-semibold text-ink">
              {isEmptyLibrary ? "Bring in your first book" : "No clippings found"}
            </h2>
            <p className="mx-auto mt-2 text-sm leading-6 text-ink/50">
              {isEmptyLibrary
                ? "Connect your Kindle, choose My Clippings.txt, and Notebook will organize the passages without uploading the original file permanently."
                : "Try a different search or clear the active filters."}
            </p>
            {isEmptyLibrary ? (
              <button
                type="button"
                onClick={onImport}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white"
              >
                <Upload className="h-4 w-4" />
                Import Kindle clippings
              </button>
            ) : (
              <button
                type="button"
                className="mt-5 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink/65"
                onClick={onClearFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {clippings.map((clipping) => (
              <ClippingCard
                key={clipping.id}
                clipping={clipping}
                selected={selectedClippingId === clipping.id}
                onSelect={() => onSelect(clipping)}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center py-7">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink/65 transition hover:border-ink/20 hover:text-ink disabled:opacity-50"
              >
                {isLoadingMore && (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                )}
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
