import { errorResponse, isRecord, jsonResponse } from "@/lib/http";
import { IMPORT_CHUNK_SIZE } from "@/lib/import-config";
import type { ClippingKind, ParsedClipping } from "@/lib/kindle/parser";
import {
  completeImport,
  ImportStateError,
  processImportChunk,
  startImport,
} from "@/lib/notebook-db";

export const dynamic = "force-dynamic";

const MAX_CLIPPINGS = 500_000;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const IMPORT_ID_PATTERN = /^import_[a-f0-9]{24}$/;
const CLIPPING_ID_PATTERN = /^clip_[a-f0-9]{32}$/;
const BOOK_ID_PATTERN = /^book_[a-f0-9]{24}$/;
const KINDS = new Set<ClippingKind>([
  "highlight",
  "note",
  "bookmark",
  "unknown",
]);

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

function stringField(
  record: Record<string, unknown>,
  field: string,
  maximumLength: number,
): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new RequestValidationError(`${field} must be text.`);
  }
  if (value.length > maximumLength) {
    throw new RequestValidationError(`${field} is too long.`);
  }
  return value;
}

function nullableStringField(
  record: Record<string, unknown>,
  field: string,
  maximumLength: number,
): string | null {
  const value = record[field];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new RequestValidationError(`${field} must be text or null.`);
  }
  if (value.length > maximumLength) {
    throw new RequestValidationError(`${field} is too long.`);
  }
  return value;
}

function integerField(
  record: Record<string, unknown>,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const value = record[field];
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new RequestValidationError(`${field} is outside the accepted range.`);
  }
  return value;
}

function nullableIntegerField(
  record: Record<string, unknown>,
  field: string,
): number | null {
  const value = record[field];
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 2_147_483_647
  ) {
    throw new RequestValidationError(`${field} must be a positive integer or null.`);
  }
  return value;
}

function parseClipping(value: unknown, index: number): ParsedClipping {
  if (!isRecord(value)) {
    throw new RequestValidationError(`Clipping ${index + 1} is not valid.`);
  }

  const id = stringField(value, "id", 37);
  const bookId = stringField(value, "bookId", 29);
  const bookKey = stringField(value, "bookKey", 64);
  const sourceAnchor = stringField(value, "sourceAnchor", 64);
  const fingerprint = stringField(value, "fingerprint", 64);
  const kind = stringField(value, "kind", 20) as ClippingKind;

  if (!CLIPPING_ID_PATTERN.test(id)) {
    throw new RequestValidationError(`Clipping ${index + 1} has an invalid ID.`);
  }
  if (!BOOK_ID_PATTERN.test(bookId)) {
    throw new RequestValidationError(`Clipping ${index + 1} has an invalid book ID.`);
  }
  if (
    !HASH_PATTERN.test(bookKey) ||
    !HASH_PATTERN.test(sourceAnchor) ||
    !HASH_PATTERN.test(fingerprint)
  ) {
    throw new RequestValidationError(`Clipping ${index + 1} has invalid identity data.`);
  }
  if (id !== `clip_${fingerprint.slice(0, 32)}`) {
    throw new RequestValidationError(`Clipping ${index + 1} has a mismatched ID.`);
  }
  if (bookId !== `book_${bookKey.slice(0, 24)}`) {
    throw new RequestValidationError(`Clipping ${index + 1} has a mismatched book ID.`);
  }
  if (!KINDS.has(kind)) {
    throw new RequestValidationError(`Clipping ${index + 1} has an invalid type.`);
  }

  return {
    id,
    bookId,
    bookKey,
    sourceTitle: stringField(value, "sourceTitle", 2_000),
    sourceAuthor: stringField(value, "sourceAuthor", 2_000),
    kind,
    sourceText: stringField(value, "sourceText", 1_000_000),
    pageStart: nullableIntegerField(value, "pageStart"),
    pageEnd: nullableIntegerField(value, "pageEnd"),
    locationStart: nullableIntegerField(value, "locationStart"),
    locationEnd: nullableIntegerField(value, "locationEnd"),
    sourceAddedAt: nullableStringField(value, "sourceAddedAt", 100),
    sourceAddedAtLabel: nullableStringField(value, "sourceAddedAtLabel", 500),
    rawMetadata: stringField(value, "rawMetadata", 20_000),
    sourceAnchor,
    fingerprint,
  };
}

async function handleStart(body: Record<string, unknown>): Promise<Response> {
  const fileName = stringField(body, "fileName", 255).trim();
  const fileHash = stringField(body, "fileHash", 64);
  const parsedCount = integerField(body, "parsedCount", 1, MAX_CLIPPINGS);
  const invalidCount = integerField(body, "invalidCount", 0, MAX_CLIPPINGS);
  const totalChunks = integerField(body, "totalChunks", 1, 10_000);

  if (!fileName) throw new RequestValidationError("A file name is required.");
  if (!HASH_PATTERN.test(fileHash)) {
    throw new RequestValidationError("The file hash is not valid.");
  }
  if (totalChunks > parsedCount) {
    throw new RequestValidationError("The import chunk count is not valid.");
  }

  const result = await startImport({
    fileName,
    fileHash,
    parsedCount,
    invalidCount,
    totalChunks,
  });

  return jsonResponse({ phase: "started", ...result });
}

async function handleChunk(body: Record<string, unknown>): Promise<Response> {
  const importId = stringField(body, "importId", 31);
  const chunkIndex = integerField(body, "chunkIndex", 0, 9_999);
  const values = body.clippings;

  if (!IMPORT_ID_PATTERN.test(importId)) {
    throw new RequestValidationError("The import ID is not valid.");
  }
  if (!Array.isArray(values) || values.length < 1) {
    throw new RequestValidationError("The clipping batch is empty.");
  }
  if (values.length > IMPORT_CHUNK_SIZE) {
    throw new RequestValidationError(
      `Send at most ${IMPORT_CHUNK_SIZE} clippings in one batch.`,
    );
  }

  const clippings = values.map(parseClipping);
  const result = await processImportChunk({ importId, chunkIndex, clippings });
  return jsonResponse({ phase: "chunk", ...result });
}

async function handleComplete(body: Record<string, unknown>): Promise<Response> {
  const importId = stringField(body, "importId", 31);
  if (!IMPORT_ID_PATTERN.test(importId)) {
    throw new RequestValidationError("The import ID is not valid.");
  }

  const result = await completeImport(importId);
  return jsonResponse({ phase: "complete", result });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return errorResponse("Invalid request body.");

    if (body.action === "start") return handleStart(body);
    if (body.action === "chunk") return handleChunk(body);
    if (body.action === "complete") return handleComplete(body);

    return errorResponse("The import action is not valid.");
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorResponse("The request body is not valid JSON.");
    }
    if (error instanceof RequestValidationError) {
      return errorResponse(error.message);
    }
    if (error instanceof ImportStateError) {
      return errorResponse(error.message, 409);
    }

    console.error("Failed to import Kindle clippings", error);
    return errorResponse("Unable to import this clipping file.", 500);
  }
}
