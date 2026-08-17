"use client";

import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { stableHash } from "@/lib/kindle/identity";
import { parseKindleClippings } from "@/lib/kindle/parser";
import type {
  ImportPayload,
  ImportResult,
  KindleParseResult,
} from "@/lib/notebook";

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; details?: string };
    return [body.error, body.details].filter(Boolean).join(" ") || "The import failed.";
  } catch {
    return "The import failed.";
  }
}

export function ImportDialog({
  open,
  onClose,
  onImported,
}: ImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState("");
  const [parseResult, setParseResult] = useState<KindleParseResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isImporting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isImporting, onClose, open]);

  const reset = () => {
    setFile(null);
    setFileHash("");
    setParseResult(null);
    setError(null);
    setImportResult(null);
    setIsDragging(false);
    setIsParsing(false);
    setIsImporting(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const close = () => {
    if (isImporting) {
      return;
    }

    reset();
    onClose();
  };

  const inspectFile = async (nextFile: File) => {
    reset();
    setIsParsing(true);

    try {
      if (nextFile.size > MAX_FILE_BYTES) {
        throw new Error("Choose a Kindle clipping file smaller than 15 MB.");
      }

      if (!nextFile.name.toLocaleLowerCase("en-US").endsWith(".txt")) {
        throw new Error("Choose the My Clippings.txt file from your Kindle.");
      }

      const content = await nextFile.text();
      const parsed = parseKindleClippings(content);

      if (parsed.clippings.length === 0) {
        throw new Error(
          parsed.errors[0]?.reason ?? "No Kindle highlights, notes, or bookmarks were found.",
        );
      }

      setFile(nextFile);
      setFileHash(stableHash(content));
      setParseResult(parsed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The file could not be read.");
    } finally {
      setIsParsing(false);
    }
  };

  const importFile = async () => {
    if (!file || !parseResult || isImporting) {
      return;
    }

    setIsImporting(true);
    setError(null);

    const payload: ImportPayload = {
      fileName: file.name,
      fileSize: file.size,
      fileHash,
      clippings: parseResult.clippings,
      parseSummary: {
        sectionCount: parseResult.sectionCount,
        errorCount: parseResult.errors.length,
        duplicateCount: parseResult.duplicateCount,
      },
    };

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const result = (await response.json()) as ImportResult;
      setImportResult(result);
      onImported(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The import failed.");
    } finally {
      setIsImporting(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-6 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <section
        aria-labelledby="import-title"
        aria-modal="true"
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-3xl border border-stone-200 bg-[#fffdf8] shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-stone-200 px-6 py-5 sm:px-8">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Cumulative and safe
            </p>
            <h2 id="import-title" className="text-xl font-semibold tracking-tight text-stone-950">
              Import Kindle clippings
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-stone-600">
              Re-upload the same file whenever you like. Existing clippings and your edits are left untouched.
            </p>
          </div>
          <button
            aria-label="Close import dialog"
            className="rounded-full p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40"
            disabled={isImporting}
            onClick={close}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 p-6 sm:p-8">
          {!importResult && (
            <>
              <button
                className={`group flex min-h-56 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                  isDragging
                    ? "border-amber-500 bg-amber-50"
                    : "border-stone-300 bg-white hover:border-amber-400 hover:bg-amber-50/40"
                }`}
                disabled={isParsing || isImporting}
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsDragging(false);
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  const droppedFile = event.dataTransfer.files[0];
                  if (droppedFile) {
                    void inspectFile(droppedFile);
                  }
                }}
                type="button"
              >
                {isParsing ? (
                  <Loader2 className="mb-4 h-10 w-10 animate-spin text-amber-700" />
                ) : (
                  <UploadCloud className="mb-4 h-10 w-10 text-amber-700 transition group-hover:-translate-y-0.5" />
                )}
                <span className="text-base font-semibold text-stone-900">
                  {isParsing ? "Reading your clippings…" : "Drop My Clippings.txt here"}
                </span>
                <span className="mt-1 text-sm text-stone-500">
                  or click to choose it from your Kindle
                </span>
              </button>

              <input
                ref={inputRef}
                accept=".txt,text/plain"
                className="sr-only"
                onChange={(event) => {
                  const selectedFile = event.target.files?.[0];
                  if (selectedFile) {
                    void inspectFile(selectedFile);
                  }
                }}
                type="file"
              />

              {error && (
                <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {file && parseResult && (
                <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                  <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-4 sm:px-5">
                    <div className="rounded-xl bg-stone-100 p-2.5 text-stone-700">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-900">{file.name}</p>
                      <p className="text-xs text-stone-500">{formatFileSize(file.size)}</p>
                    </div>
                    <button
                      className="rounded-lg px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100"
                      onClick={reset}
                      type="button"
                    >
                      Change
                    </button>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-y divide-stone-200 sm:grid-cols-4 sm:divide-y-0">
                    {[
                      [parseResult.clippings.length, "Ready"],
                      [parseResult.bookCount, "Books"],
                      [parseResult.duplicateCount, "Repeated in file"],
                      [parseResult.errors.length, "Couldn’t parse"],
                    ].map(([value, label]) => (
                      <div className="px-4 py-4 text-center" key={label}>
                        <p className="text-xl font-semibold tabular-nums text-stone-950">{value}</p>
                        <p className="mt-0.5 text-xs text-stone-500">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 rounded-2xl bg-stone-100 px-4 py-3.5 text-sm leading-6 text-stone-600">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-stone-700" />
                <p>
                  The text file is parsed in your browser. Notebook sends only the structured clipping text and metadata to your private D1 database; the source file itself is not retained.
                </p>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-100"
                  disabled={isImporting}
                  onClick={close}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!file || !parseResult || isImporting}
                  onClick={() => void importFile()}
                  type="button"
                >
                  {isImporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="h-4 w-4" />
                  )}
                  {isImporting ? "Importing…" : "Import clippings"}
                </button>
              </div>
            </>
          )}

          {importResult && (
            <div className="py-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-xl font-semibold text-stone-950">Import complete</h3>
              <p className="mt-1 text-sm text-stone-600">
                Your library is up to date. Re-importing this file later will remain safe.
              </p>

              <div className="mx-auto mt-6 grid max-w-lg grid-cols-2 overflow-hidden rounded-2xl border border-stone-200 bg-white sm:grid-cols-4">
                {[
                  [importResult.added, "Added"],
                  [importResult.duplicates, "Skipped"],
                  [importResult.books, "Books seen"],
                  [importResult.invalid, "Unparsed"],
                ].map(([value, label]) => (
                  <div className="border-b border-r border-stone-200 px-3 py-4 last:border-r-0 sm:border-b-0" key={label}>
                    <p className="text-xl font-semibold tabular-nums text-stone-950">{value}</p>
                    <p className="mt-0.5 text-xs text-stone-500">{label}</p>
                  </div>
                ))}
              </div>

              <button
                className="mt-7 rounded-xl bg-stone-950 px-6 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
                onClick={close}
                type="button"
              >
                View library
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
