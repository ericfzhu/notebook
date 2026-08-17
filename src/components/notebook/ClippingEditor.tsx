"use client";

import {
  Archive,
  ArchiveRestore,
  Bookmark,
  Highlighter,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Save,
  Star,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { ClippingRecord, UpdateClippingPayload } from "@/lib/notebook";

interface ClippingEditorProps {
  clipping: ClippingRecord | null;
  open: boolean;
  onClose: () => void;
  onSaved: (clipping: ClippingRecord) => void;
}

function locator(clipping: ClippingRecord): string {
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

  return "No page or location";
}

function kindLabel(kind: ClippingRecord["kind"]): string {
  if (kind === "highlight") return "Highlight";
  if (kind === "note") return "Kindle note";
  if (kind === "bookmark") return "Bookmark";
  return "Clipping";
}

function KindIcon({ kind }: { kind: ClippingRecord["kind"] }) {
  if (kind === "note") {
    return <MessageSquareText className="h-4 w-4" />;
  }

  if (kind === "bookmark") {
    return <Bookmark className="h-4 w-4" />;
  }

  return <Highlighter className="h-4 w-4" />;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; details?: string };
    return [body.error, body.details].filter(Boolean).join(" ") || "The clipping could not be saved.";
  } catch {
    return "The clipping could not be saved.";
  }
}

export function ClippingEditor({
  clipping,
  open,
  onClose,
  onSaved,
}: ClippingEditorProps) {
  const [editedText, setEditedText] = useState("");
  const [commentary, setCommentary] = useState("");
  const [tags, setTags] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clipping) {
      return;
    }

    setEditedText(clipping.editedText ?? clipping.sourceText);
    setCommentary(clipping.commentary ?? "");
    setTags(clipping.tags.join(", "));
    setIsFavorite(clipping.isFavorite);
    setIsArchived(clipping.isArchived);
    setError(null);
    setIsSaving(false);
  }, [clipping]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose, open]);

  const parsedTags = useMemo(
    () =>
      Array.from(
        new Set(
          tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ),
    [tags],
  );

  if (!open || !clipping) {
    return null;
  }

  const save = async () => {
    if (isSaving) {
      return;
    }

    if (parsedTags.length > 12) {
      setError("Use no more than 12 tags on one clipping.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const normalizedEditedText = editedText.trim();
    const payload: UpdateClippingPayload = {
      editedText:
        normalizedEditedText === clipping.sourceText.trim()
          ? null
          : normalizedEditedText || null,
      commentary: commentary.trim() || null,
      tags: parsedTags,
      isFavorite,
      isArchived,
    };

    try {
      const response = await fetch(`/api/clippings/${encodeURIComponent(clipping.id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const saved = (await response.json()) as ClippingRecord;
      onSaved(saved);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The clipping could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/35 backdrop-blur-[1px]" role="presentation">
      <button
        aria-label="Close clipping editor"
        className="absolute inset-0 h-full w-full cursor-default"
        disabled={isSaving}
        onClick={onClose}
        type="button"
      />

      <aside
        aria-labelledby="clipping-editor-title"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 flex max-h-[94vh] flex-col overflow-hidden rounded-t-3xl border border-stone-200 bg-[#fffdf8] shadow-2xl sm:inset-y-0 sm:left-auto sm:w-full sm:max-w-xl sm:rounded-none sm:rounded-l-3xl"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-stone-200 px-5 py-4 sm:px-7 sm:py-5">
          <div className="min-w-0 pr-4">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
              <KindIcon kind={clipping.kind} />
              {kindLabel(clipping.kind)}
            </div>
            <h2 id="clipping-editor-title" className="truncate text-lg font-semibold text-stone-950">
              {clipping.bookTitle}
            </h2>
            <p className="mt-0.5 truncate text-sm text-stone-500">
              {[clipping.bookAuthor, locator(clipping)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            aria-label="Close editor"
            className="rounded-full p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7">
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-semibold text-stone-900" htmlFor="edited-text">
                Display text
              </label>
              {clipping.editedText && (
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                  onClick={() => setEditedText(clipping.sourceText)}
                  type="button"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore original
                </button>
              )}
            </div>
            <textarea
              className="note-serif min-h-44 w-full resize-y rounded-2xl border border-stone-300 bg-white px-4 py-3 text-[17px] leading-7 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
              id="edited-text"
              onChange={(event) => setEditedText(event.target.value)}
              spellCheck
              value={editedText}
            />
            <p className="mt-1.5 text-xs leading-5 text-stone-500">
              Editing changes only what Notebook displays. The original Kindle text remains available below and is never overwritten by a later import.
            </p>
          </section>

          <section>
            <label className="text-sm font-semibold text-stone-900" htmlFor="commentary">
              Your commentary
            </label>
            <textarea
              className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm leading-6 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
              id="commentary"
              onChange={(event) => setCommentary(event.target.value)}
              placeholder="Why did this matter? What does it connect to?"
              value={commentary}
            />
          </section>

          <section>
            <label className="text-sm font-semibold text-stone-900" htmlFor="tags">
              Tags
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
              id="tags"
              onChange={(event) => setTags(event.target.value)}
              placeholder="psychology, writing, revisit"
              value={tags}
            />
            <p className="mt-1.5 text-xs text-stone-500">
              Separate tags with commas. Up to 12 per clipping.
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <button
              aria-pressed={isFavorite}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                isFavorite
                  ? "border-amber-300 bg-amber-50 text-amber-950"
                  : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
              }`}
              onClick={() => setIsFavorite((value) => !value)}
              type="button"
            >
              <Star className={`h-5 w-5 ${isFavorite ? "fill-amber-400 text-amber-500" : ""}`} />
              <span>
                <span className="block text-sm font-semibold">Favorite</span>
                <span className="block text-xs opacity-70">Keep it easy to find</span>
              </span>
            </button>

            <button
              aria-pressed={isArchived}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                isArchived
                  ? "border-stone-400 bg-stone-100 text-stone-900"
                  : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
              }`}
              onClick={() => setIsArchived((value) => !value)}
              type="button"
            >
              {isArchived ? <ArchiveRestore className="h-5 w-5" /> : <Archive className="h-5 w-5" />}
              <span>
                <span className="block text-sm font-semibold">
                  {isArchived ? "Restore" : "Archive"}
                </span>
                <span className="block text-xs opacity-70">
                  {isArchived ? "Return to the library" : "Hide without deleting"}
                </span>
              </span>
            </button>
          </section>

          <details className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3.5">
            <summary className="cursor-pointer text-sm font-semibold text-stone-700">
              Original Kindle data
            </summary>
            <div className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
              <blockquote className="note-serif whitespace-pre-wrap border-l-2 border-amber-400 pl-4 text-[15px] text-stone-800">
                {clipping.sourceText || "Bookmark"}
              </blockquote>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="font-semibold text-stone-700">Type</dt>
                <dd>{kindLabel(clipping.kind)}</dd>
                <dt className="font-semibold text-stone-700">Position</dt>
                <dd>{locator(clipping)}</dd>
                <dt className="font-semibold text-stone-700">Metadata</dt>
                <dd className="break-words">{clipping.rawMetadata}</dd>
              </dl>
            </div>
          </details>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-stone-200 bg-[#fffdf8] px-5 py-4 sm:px-7">
          <p className="hidden text-xs text-stone-500 sm:block">
            Changes are stored in D1 immediately when you save.
          </p>
          <div className="ml-auto flex gap-2">
            <button
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-40"
              disabled={isSaving}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSaving}
              onClick={() => void save()}
              type="button"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
