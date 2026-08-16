"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import {
  IMPORT_CHUNK_SIZE,
  IMPORT_CHUNK_TARGET_BYTES,
} from "@/lib/import-config";
import {
  hashFile,
  parseKindleClippings,
  type ParsedClipping,
} from "@/lib/kindle/parser";
import type { ImportResult } from "./types";

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

interface ImportStartResponse {
  phase: "started";
  importId: string;
  alreadyImported: boolean;
  result: Omit<ImportResult, "issues"> | null;
}

interface ImportCompleteResponse {
  phase: "complete";
  result: Omit<ImportResult, "issues">;
}

type ImportPhase = "idle" | "parsing" | "starting" | "uploading" | "finishing";

const MAX_FILE_BYTES = 32 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || "The import could not be completed.";
  } catch {
    return "The import could not be completed.";
  }
}

async function postImport<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(await getErrorMessage(response));
  return (await response.json()) as T;
}

function chunkClippings(clippings: ParsedClipping[]): ParsedClipping[][] {
  const encoder = new TextEncoder();
  const chunks: ParsedClipping[][] = [];
  let current: ParsedClipping[] = [];
  let currentBytes = 2;

  for (const clipping of clippings) {
    const clippingBytes = encoder.encode(JSON.stringify(clipping)).byteLength + 1;
    const wouldOverflow =
      current.length >= IMPORT_CHUNK_SIZE ||
      (current.length > 0 &&
        currentBytes + clippingBytes > IMPORT_CHUNK_TARGET_BYTES);

    if (wouldOverflow) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }

    current.push(clipping);
    currentBytes += clippingBytes;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function phaseLabel(
  phase: ImportPhase,
  processedChunks: number,
  totalChunks: number,
): string {
  if (phase === "parsing") return "Reading clippings on this device…";
  if (phase === "starting") return "Preparing the import…";
  if (phase === "uploading") {
    return `Saving batch ${Math.min(processedChunks + 1, totalChunks)} of ${totalChunks}…`;
  }
  if (phase === "finishing") return "Finishing the import…";
  return "Import file";
}

export function ImportDialog({
  open,
  onClose,
  onImported,
}: ImportDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [processedChunks, setProcessedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const isUploading = phase !== "idle";

  useEffect(() => {
    if (!open) {
      setFile(null);
      setError(null);
      setResult(null);
      setIsDragging(false);
      setPhase("idle");
      setProcessedChunks(0);
      setTotalChunks(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isUploading) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isUploading, onClose, open]);

  if (!open) return null;

  const clearFile = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const selectFile = (nextFile: File | undefined) => {
    setError(null);
    setResult(null);
    if (!nextFile) return;

    if (nextFile.size > MAX_FILE_BYTES) {
      clearFile();
      setError("Choose a clipping file smaller than 32 MB.");
      return;
    }

    if (!nextFile.name.toLocaleLowerCase("en").endsWith(".txt")) {
      clearFile();
      setError("Choose your Kindle My Clippings.txt file.");
      return;
    }

    setFile(nextFile);
  };

  const runImport = async () => {
    if (!file || isUploading) return;

    setError(null);
    setProcessedChunks(0);
    setTotalChunks(0);
    setPhase("parsing");

    try {
      const content = await file.text();
      const [fileHash, parsed] = await Promise.all([
        hashFile(content),
        parseKindleClippings(content),
      ]);

      if (parsed.clippings.length === 0) {
        const detail = parsed.issues[0]?.message;
        throw new Error(
          detail
            ? `No Kindle clippings were found. ${detail}`
            : "No Kindle clippings were found in this file.",
        );
      }

      const chunks = chunkClippings(parsed.clippings);
      setTotalChunks(chunks.length);
      setPhase("starting");

      const start = await postImport<ImportStartResponse>({
        action: "start",
        fileName: file.name,
        fileHash,
        parsedCount: parsed.clippings.length,
        invalidCount: parsed.issues.length,
        totalChunks: chunks.length,
      });

      if (start.alreadyImported && start.result) {
        const completed: ImportResult = {
          ...start.result,
          issues: parsed.issues.slice(0, 20),
        };
        setResult(completed);
        onImported(completed);
        return;
      }

      setPhase("uploading");
      for (let index = 0; index < chunks.length; index += 1) {
        setProcessedChunks(index);
        await postImport({
          action: "chunk",
          importId: start.importId,
          chunkIndex: index,
          clippings: chunks[index],
        });
        setProcessedChunks(index + 1);
      }

      setPhase("finishing");
      const completedResponse = await postImport<ImportCompleteResponse>({
        action: "complete",
        importId: start.importId,
      });
      const completed: ImportResult = {
        ...completedResponse.result,
        issues: parsed.issues.slice(0, 20),
      };

      setResult(completed);
      onImported(completed);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The import could not be completed.",
      );
    } finally {
      setPhase("idle");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isUploading) onClose();
      }}
    >
      <section
        aria-labelledby="import-title"
        aria-modal="true"
        role="dialog"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] border border-ink/10 bg-paper shadow-2xl sm:max-w-xl sm:rounded-[2rem]"
      >
        <header className="flex items-start justify-between gap-6 border-b border-ink/10 px-6 py-5 sm:px-8">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-moss">
              Kindle import
            </p>
            <h2 id="import-title" className="text-2xl font-semibold text-ink">
              Add the latest clippings
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-ink/60">
              Upload the cumulative file again at any time. Existing clippings are
              skipped and your edits are preserved.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-ink/50 transition hover:bg-ink/5 hover:text-ink disabled:opacity-40"
            onClick={onClose}
            disabled={isUploading}
            aria-label="Close import"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 px-6 py-6 sm:px-8 sm:py-8">
          {!result && (
            <>
              <button
                type="button"
                disabled={isUploading}
                className={`group flex min-h-56 w-full flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed px-6 text-center transition disabled:cursor-wait ${
                  isDragging
                    ? "border-moss bg-moss/8"
                    : "border-ink/15 bg-white/50 hover:border-moss/60 hover:bg-white"
                }`}
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (!isUploading) setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                    setIsDragging(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  if (!isUploading) selectFile(event.dataTransfer.files[0]);
                }}
              >
                <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-moss/10 text-moss transition group-hover:scale-105">
                  <Upload className="h-6 w-6" />
                </span>
                <span className="text-base font-semibold text-ink">
                  Drop My Clippings.txt here
                </span>
                <span className="mt-2 text-sm text-ink/55">
                  or click to choose it from your Kindle
                </span>
                <span className="mt-3 max-w-sm text-xs leading-5 text-ink/38">
                  The file is parsed in your browser. Only structured clippings are
                  sent to your private D1 database.
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={(event) => selectFile(event.target.files?.[0])}
              />

              {file && (
                <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-clay/10 text-clay">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {file.name}
                      </p>
                      <p className="text-xs text-ink/50">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full p-2 text-ink/45 hover:bg-ink/5 hover:text-ink disabled:opacity-30"
                      onClick={clearFile}
                      disabled={isUploading}
                      aria-label="Remove selected file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {isUploading && (
                    <div className="mt-3 border-t border-ink/10 pt-3">
                      <div className="flex items-center justify-between gap-3 text-xs font-medium text-ink/55">
                        <span>{phaseLabel(phase, processedChunks, totalChunks)}</span>
                        {totalChunks > 0 && (
                          <span className="tabular-nums">
                            {Math.round((processedChunks / totalChunks) * 100)}%
                          </span>
                        )}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/8">
                        <div
                          className={`h-full rounded-full bg-moss transition-all ${
                            totalChunks === 0 ? "w-1/4 animate-pulse" : ""
                          }`}
                          style={
                            totalChunks > 0
                              ? {
                                  width: `${Math.max(
                                    4,
                                    (processedChunks / totalChunks) * 100,
                                  )}%`,
                                }
                              : undefined
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <div
              role="alert"
              className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p>{error}</p>
                <p className="mt-1 text-xs opacity-70">
                  Retrying the same file safely resumes any completed batches.
                </p>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-5">
              <div className="flex items-start gap-4 rounded-[1.5rem] bg-moss px-5 py-5 text-white">
                <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold">
                    {result.alreadyImported
                      ? "This exact file was already imported"
                      : "Import complete"}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-white/75">
                    {result.alreadyImported
                      ? "Nothing changed. Your library is already up to date with this file."
                      : `${result.insertedCount} new clipping${
                          result.insertedCount === 1 ? "" : "s"
                        } added without replacing existing notes.`}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Added", result.insertedCount],
                  ["Already there", result.duplicateCount],
                  ["Review", result.conflictCount],
                  ["Couldn’t parse", result.invalidCount],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-ink/10 bg-white px-4 py-4"
                  >
                    <dt className="text-xs font-medium text-ink/50">{label}</dt>
                    <dd className="mt-1 text-2xl font-semibold text-ink">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              {result.issues.length > 0 && (
                <details className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <summary className="cursor-pointer font-semibold">
                    See entries that could not be parsed
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {result.issues.map((issue) => (
                      <li key={`${issue.section}-${issue.preview}`}>
                        <p className="font-medium">
                          Section {issue.section}: {issue.message}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs opacity-70">
                          {issue.preview}
                        </p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-ink/10 px-6 py-4 sm:px-8">
          {!result ? (
            <>
              <button
                type="button"
                className="rounded-full px-5 py-2.5 text-sm font-semibold text-ink/65 hover:bg-ink/5 hover:text-ink disabled:opacity-40"
                onClick={onClose}
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex min-w-32 items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={runImport}
                disabled={!file || isUploading}
              >
                {isUploading && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {isUploading
                  ? phaseLabel(phase, processedChunks, totalChunks).replace("…", "")
                  : "Import file"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
              onClick={onClose}
            >
              Back to library
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
