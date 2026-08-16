"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  CircleAlert,
  LoaderCircle,
  RotateCcw,
  Save,
  Star,
  X,
} from "lucide-react";
import type { Clipping } from "./types";

interface ClippingEditorProps {
  clipping: Clipping;
  onClose: () => void;
  onUpdated: (clipping: Clipping) => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

function visibleText(clipping: Clipping): string {
  return clipping.editedText ?? clipping.sourceText;
}

function formatPosition(clipping: Clipping): string | null {
  if (clipping.locationStart !== null) {
    return clipping.locationEnd && clipping.locationEnd !== clipping.locationStart
      ? `Locations ${clipping.locationStart}–${clipping.locationEnd}`
      : `Location ${clipping.locationStart}`;
  }

  if (clipping.pageStart !== null) {
    return clipping.pageEnd && clipping.pageEnd !== clipping.pageStart
      ? `Pages ${clipping.pageStart}–${clipping.pageEnd}`
      : `Page ${clipping.pageStart}`;
  }

  return null;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "The clipping could not be saved.";
  } catch {
    return "The clipping could not be saved.";
  }
}

export function ClippingEditor({
  clipping,
  onClose,
  onUpdated,
  onDirtyChange,
}: ClippingEditorProps) {
  const [editedText, setEditedText] = useState(visibleText(clipping));
  const [personalNote, setPersonalNote] = useState(clipping.personalNote ?? "");
  const [tagText, setTagText] = useState(
    clipping.tags.map((tag) => tag.name).join(", "),
  );
  const [isFavorite, setIsFavorite] = useState(clipping.isFavorite);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEditedText(visibleText(clipping));
    setPersonalNote(clipping.personalNote ?? "");
    setTagText(clipping.tags.map((tag) => tag.name).join(", "));
    setIsFavorite(clipping.isFavorite);
    setError(null);
    setSaved(false);
  }, [clipping]);

  const normalizedTags = useMemo(
    () =>
      tagText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [tagText],
  );
  const currentTagNames = clipping.tags.map((tag) => tag.name);
  const hasChanges =
    editedText !== visibleText(clipping) ||
    personalNote !== (clipping.personalNote ?? "") ||
    normalizedTags.join("\u0000") !== currentTagNames.join("\u0000") ||
    isFavorite !== clipping.isFavorite;

  useEffect(() => {
    onDirtyChange?.(hasChanges);

    return () => onDirtyChange?.(false);
  }, [hasChanges, onDirtyChange]);

  useEffect(() => {
    if (!hasChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  const position = formatPosition(clipping);
  const addedAt = formatDate(clipping.sourceAddedAt);

  const closeSafely = () => {
    if (
      hasChanges &&
      !window.confirm("Discard the changes you have not saved?")
    ) {
      return;
    }
    onClose();
  };

  const patchClipping = async (body: Record<string, unknown>) => {
    setIsSaving(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch(`/api/clippings/${clipping.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error(await readError(response));

      const updated = (await response.json()) as Clipping;
      onUpdated(updated);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
      return updated;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The clipping could not be saved.",
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const draftBody = () => ({
    editedText:
      editedText.trim() === clipping.sourceText.trim() ? null : editedText,
    personalNote,
    tags: normalizedTags,
    isFavorite,
  });

  const save = async () => {
    await patchClipping(draftBody());
  };

  const toggleArchived = async () => {
    const updated = await patchClipping({
      ...draftBody(),
      archived: !clipping.isArchived,
    });
    if (updated?.isArchived) onClose();
  };

  const markReviewed = async () => {
    await patchClipping({ ...draftBody(), needsReview: false });
  };

  return (
    <aside className="fixed inset-0 z-40 flex flex-col bg-paper shadow-2xl xl:sticky xl:inset-auto xl:top-[6.25rem] xl:z-auto xl:h-[calc(100vh-7.5rem)] xl:min-h-0 xl:rounded-[1.75rem] xl:border xl:border-ink/10 xl:shadow-sm">
      <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-moss">
            <span>{clipping.kind}</span>
            {clipping.needsReview && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] tracking-normal text-amber-800">
                review
              </span>
            )}
          </div>
          <h2 className="truncate text-lg font-semibold text-ink">
            {clipping.title}
          </h2>
          <p className="truncate text-sm text-ink/50">
            {clipping.author || "Unknown author"}
          </p>
        </div>
        <button
          type="button"
          className="rounded-full p-2 text-ink/45 hover:bg-ink/5 hover:text-ink"
          onClick={closeSafely}
          disabled={isSaving}
          aria-label="Close clipping editor"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        <div className="space-y-6">
          {clipping.needsReview && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Possible changed clipping</p>
                  <p className="mt-1 leading-6 opacity-75">
                    Another clipping was imported at the same Kindle location.
                    Keep or edit this version, then mark it reviewed.
                  </p>
                  <button
                    type="button"
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                    onClick={markReviewed}
                    disabled={isSaving}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark reviewed
                  </button>
                </div>
              </div>
            </div>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label
                htmlFor="edited-clipping"
                className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45"
              >
                Clipping text
              </label>
              {clipping.editedText && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-moss hover:text-moss/75"
                  onClick={() => setEditedText(clipping.sourceText)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore original
                </button>
              )}
            </div>
            <textarea
              id="edited-clipping"
              value={editedText}
              onChange={(event) => setEditedText(event.target.value)}
              rows={9}
              className="w-full resize-y rounded-2xl border border-ink/10 bg-white px-4 py-4 font-serif text-[1.05rem] leading-8 text-ink outline-none transition placeholder:text-ink/30 focus:border-moss/50 focus:ring-4 focus:ring-moss/10"
            />
            {clipping.editedText && editedText !== clipping.sourceText && (
              <details className="mt-3 rounded-2xl bg-ink/[0.035] px-4 py-3 text-sm text-ink/65">
                <summary className="cursor-pointer font-semibold text-ink/60">
                  Show original Kindle text
                </summary>
                <p className="mt-3 whitespace-pre-wrap font-serif leading-7">
                  {clipping.sourceText}
                </p>
              </details>
            )}
          </section>

          <section>
            <label
              htmlFor="personal-note"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-ink/45"
            >
              Your note
            </label>
            <textarea
              id="personal-note"
              value={personalNote}
              onChange={(event) => setPersonalNote(event.target.value)}
              rows={5}
              placeholder="Why did this matter? Add context, a question, or a connection…"
              className="w-full resize-y rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm leading-6 text-ink outline-none transition placeholder:text-ink/30 focus:border-moss/50 focus:ring-4 focus:ring-moss/10"
            />
          </section>

          <section>
            <label
              htmlFor="clipping-tags"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-ink/45"
            >
              Tags
            </label>
            <input
              id="clipping-tags"
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              placeholder="writing, psychology, revisit"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink outline-none transition placeholder:text-ink/30 focus:border-moss/50 focus:ring-4 focus:ring-moss/10"
            />
            <p className="mt-2 text-xs leading-5 text-ink/45">
              Separate tags with commas. A clipping can belong to several topics.
            </p>
          </section>

          <section className="rounded-2xl border border-ink/10 bg-white px-4 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">
              Kindle metadata
            </h3>
            <dl className="mt-3 space-y-2 text-sm">
              {position && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink/45">Position</dt>
                  <dd className="text-right font-medium text-ink/75">{position}</dd>
                </div>
              )}
              {(addedAt || clipping.sourceAddedAtLabel) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink/45">Added</dt>
                  <dd className="text-right font-medium text-ink/75">
                    {addedAt ?? clipping.sourceAddedAtLabel}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-ink/45">Imported</dt>
                <dd className="text-right font-medium text-ink/75">
                  {formatDate(clipping.createdAt)}
                </dd>
              </div>
            </dl>
            <details className="mt-3 border-t border-ink/10 pt-3 text-xs text-ink/50">
              <summary className="cursor-pointer font-semibold">
                Raw Kindle metadata
              </summary>
              <p className="mt-2 break-words leading-5">{clipping.rawMetadata}</p>
            </details>
          </section>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mx-5 mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 sm:mx-6"
        >
          {error}
        </div>
      )}

      <footer className="border-t border-ink/10 bg-paper px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={`grid h-10 w-10 place-items-center rounded-full transition ${
                isFavorite
                  ? "bg-clay/12 text-clay"
                  : "text-ink/45 hover:bg-ink/5 hover:text-ink"
              }`}
              onClick={() => setIsFavorite((current) => !current)}
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <Star className={`h-5 w-5 ${isFavorite ? "fill-current" : ""}`} />
            </button>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full text-ink/45 transition hover:bg-ink/5 hover:text-ink disabled:opacity-40"
              onClick={toggleArchived}
              disabled={isSaving}
              aria-label={clipping.isArchived ? "Restore clipping" : "Archive clipping"}
              title={clipping.isArchived ? "Restore clipping" : "Archive clipping"}
            >
              {clipping.isArchived ? (
                <ArchiveRestore className="h-5 w-5" />
              ) : (
                <Archive className="h-5 w-5" />
              )}
            </button>
          </div>

          <button
            type="button"
            className="inline-flex min-w-28 items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={save}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Saving
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save
              </>
            )}
          </button>
        </div>
      </footer>
    </aside>
  );
}
