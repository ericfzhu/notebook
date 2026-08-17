"use client";

import { Loader2, PencilLine, RotateCcw, Save, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { BookSummary, UpdateBookPayload } from "@/lib/notebook";

interface BookEditorProps {
  book: BookSummary | null;
  open: boolean;
  onClose: () => void;
  onSaved: (book: BookSummary) => void;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; details?: string };
    return [body.error, body.details].filter(Boolean).join(" ") || "The book could not be saved.";
  } catch {
    return "The book could not be saved.";
  }
}

export function BookEditor({ book, open, onClose, onSaved }: BookEditorProps) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!book) {
      return;
    }

    setTitle(book.title);
    setAuthor(book.author);
    setError(null);
    setIsSaving(false);
  }, [book]);

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

  if (!open || !book) {
    return null;
  }

  const save = async () => {
    if (!title.trim()) {
      setError("A book needs a display title.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const payload: UpdateBookPayload = {
      displayTitle: title.trim() === book.sourceTitle.trim() ? null : title.trim(),
      displayAuthor: author.trim() === book.sourceAuthor.trim() ? null : author.trim() || null,
    };

    try {
      const response = await fetch(`/api/books/${encodeURIComponent(book.id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const saved = (await response.json()) as BookSummary;
      onSaved(saved);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The book could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 py-6 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="book-editor-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-3xl border border-stone-200 bg-[#fffdf8] shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-stone-200 px-6 py-5">
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
              <PencilLine className="h-4 w-4" />
              Display metadata
            </div>
            <h2 id="book-editor-title" className="text-xl font-semibold text-stone-950">
              Edit book
            </h2>
          </div>
          <button
            aria-label="Close book editor"
            className="rounded-full p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 px-6 py-6">
          <div>
            <label className="text-sm font-semibold text-stone-900" htmlFor="book-title">
              Title
            </label>
            <input
              autoFocus
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
              id="book-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-stone-900" htmlFor="book-author">
              Author
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
              id="book-author"
              onChange={(event) => setAuthor(event.target.value)}
              value={author}
            />
          </div>

          <button
            className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            onClick={() => {
              setTitle(book.sourceTitle);
              setAuthor(book.sourceAuthor);
            }}
            type="button"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore Kindle metadata
          </button>

          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs leading-5 text-stone-600">
            <p className="font-semibold text-stone-800">Original Kindle data</p>
            <p className="mt-1">{book.sourceTitle}</p>
            {book.sourceAuthor && <p>{book.sourceAuthor}</p>}
            <p className="mt-2 text-stone-500">
              Display changes do not alter the source identity used to recognize future imports.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-stone-200 px-6 py-4">
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
        </footer>
      </section>
    </div>
  );
}
