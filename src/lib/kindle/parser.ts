export type ClippingKind = "highlight" | "note" | "bookmark" | "unknown";

export interface ParsedClipping {
  id: string;
  bookId: string;
  bookKey: string;
  sourceTitle: string;
  sourceAuthor: string;
  kind: ClippingKind;
  sourceText: string;
  pageStart: number | null;
  pageEnd: number | null;
  locationStart: number | null;
  locationEnd: number | null;
  sourceAddedAt: string | null;
  sourceAddedAtLabel: string | null;
  rawMetadata: string;
  sourceAnchor: string;
  fingerprint: string;
}

export interface ParseIssue {
  section: number;
  message: string;
  preview: string;
}

export interface ParseResult {
  clippings: ParsedClipping[];
  issues: ParseIssue[];
}

interface RawClipping {
  sourceTitle: string;
  sourceAuthor: string;
  kind: ClippingKind;
  sourceText: string;
  pageStart: number | null;
  pageEnd: number | null;
  locationStart: number | null;
  locationEnd: number | null;
  sourceAddedAt: string | null;
  sourceAddedAtLabel: string | null;
  rawMetadata: string;
}

const SECTION_SEPARATOR = /^\s*={10}\s*$/m;

function normalizeLineEndings(value: string): string {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

export function normalizeForIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function parseTitleAndAuthor(line: string): {
  title: string;
  author: string;
} {
  const trimmed = line.trim();
  const authorStart = trimmed.lastIndexOf(" (");

  if (authorStart > 0 && trimmed.endsWith(")")) {
    const title = trimmed.slice(0, authorStart).trim();
    const author = trimmed.slice(authorStart + 2, -1).trim();

    if (title) {
      return { title, author };
    }
  }

  return { title: trimmed, author: "" };
}

function parseKind(metadata: string): ClippingKind {
  const normalized = metadata.toLocaleLowerCase("en");

  if (normalized.includes("highlight")) return "highlight";
  if (normalized.includes("bookmark")) return "bookmark";
  if (normalized.includes("note")) return "note";

  return "unknown";
}

function parseRange(
  metadata: string,
  pattern: RegExp,
): { start: number | null; end: number | null } {
  const match = metadata.match(pattern);
  if (!match) return { start: null, end: null };

  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : start;

  return {
    start: Number.isFinite(start) ? start : null,
    end: Number.isFinite(end) ? end : null,
  };
}

function parseAddedAt(metadata: string): {
  iso: string | null;
  label: string | null;
} {
  const segment = metadata
    .split("|")
    .map((part) => part.trim())
    .find((part) => /^added on\s+/i.test(part));

  if (!segment) return { iso: null, label: null };

  const label = segment.replace(/^added on\s+/i, "").trim();
  if (!label) return { iso: null, label: null };

  const parsed = Date.parse(label);
  return {
    iso: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(),
    label,
  };
}

function stripOuterBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;

  return lines.slice(start, end);
}

function parseSection(section: string): RawClipping | null {
  const lines = normalizeLineEndings(section).split("\n");
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0);

  if (firstContentLine === -1) return null;

  const metadataIndex = lines.findIndex(
    (line, index) => index > firstContentLine && /^\s*-/.test(line),
  );

  if (metadataIndex === -1) {
    throw new Error("The clipping metadata line is missing.");
  }

  const { title, author } = parseTitleAndAuthor(lines[firstContentLine]);
  if (!title) {
    throw new Error("The book title is missing.");
  }

  const rawMetadata = lines[metadataIndex].replace(/^\s*-\s*/, "").trim();
  const kind = parseKind(rawMetadata);
  const page = parseRange(rawMetadata, /\bpages?\s+(\d+)(?:\s*[-–]\s*(\d+))?/i);
  const location = parseRange(
    rawMetadata,
    /\blocation\s+(\d+)(?:\s*[-–]\s*(\d+))?/i,
  );
  const addedAt = parseAddedAt(rawMetadata);
  const sourceText = stripOuterBlankLines(lines.slice(metadataIndex + 1))
    .join("\n")
    .trim();

  if ((kind === "highlight" || kind === "note") && !sourceText) {
    throw new Error("The clipping text is empty.");
  }

  return {
    sourceTitle: title,
    sourceAuthor: author,
    kind,
    sourceText,
    pageStart: page.start,
    pageEnd: page.end,
    locationStart: location.start,
    locationEnd: location.end,
    sourceAddedAt: addedAt.iso,
    sourceAddedAtLabel: addedAt.label,
    rawMetadata,
  };
}

async function addIdentity(
  raw: RawClipping,
  bookKeyCache: Map<string, Promise<string>>,
): Promise<ParsedClipping> {
  const normalizedTitle = normalizeForIdentity(raw.sourceTitle);
  const normalizedAuthor = normalizeForIdentity(raw.sourceAuthor);
  const normalizedText = normalizeForIdentity(raw.sourceText);
  const bookIdentity = `${normalizedTitle}\u0000${normalizedAuthor}`;
  const cachedBookKey = bookKeyCache.get(bookIdentity);
  const bookKeyPromise = cachedBookKey ?? sha256(bookIdentity);
  if (!cachedBookKey) bookKeyCache.set(bookIdentity, bookKeyPromise);
  const bookKey = await bookKeyPromise;

  const sourcePosition = raw.locationStart !== null
    ? `location:${raw.locationStart}-${raw.locationEnd ?? raw.locationStart}`
    : raw.pageStart !== null
      ? `page:${raw.pageStart}-${raw.pageEnd ?? raw.pageStart}`
      : `text:${normalizedText}`;

  const sourceAnchor = await sha256(
    `${bookKey}\u0000${raw.kind}\u0000${sourcePosition}`,
  );
  const fingerprint = await sha256(
    [
      sourceAnchor,
      normalizedText,
      normalizeForIdentity(raw.sourceAddedAtLabel ?? ""),
    ].join("\u0000"),
  );

  return {
    ...raw,
    id: `clip_${fingerprint.slice(0, 32)}`,
    bookId: `book_${bookKey.slice(0, 24)}`,
    bookKey,
    sourceAnchor,
    fingerprint,
  };
}

export async function parseKindleClippings(content: string): Promise<ParseResult> {
  const normalized = normalizeLineEndings(content);
  const sections = normalized.split(SECTION_SEPARATOR);
  const rawClippings: RawClipping[] = [];
  const issues: ParseIssue[] = [];

  sections.forEach((section, index) => {
    if (!section.trim()) return;

    try {
      const parsed = parseSection(section);
      if (parsed) rawClippings.push(parsed);
    } catch (error) {
      issues.push({
        section: index + 1,
        message: error instanceof Error ? error.message : "Unable to parse clipping.",
        preview: section.trim().slice(0, 160),
      });
    }
  });

  const bookKeyCache = new Map<string, Promise<string>>();
  const clippings = await Promise.all(
    rawClippings.map((raw) => addIdentity(raw, bookKeyCache)),
  );

  return { clippings, issues };
}

export async function hashFile(content: string): Promise<string> {
  return sha256(normalizeLineEndings(content));
}
