import type {
  ClippingKind,
  KindleParseError,
  KindleParseResult,
  ParsedClipping,
} from "../notebook";
import {
  createBookIdentity,
  createClippingIdentity,
  normalizeClippingText,
} from "./identity";

const CLIPPING_SEPARATOR = /^={10}\s*$/m;

function parseHeading(heading: string): { title: string; author: string } {
  const match = heading.match(/^(.*)\s+\(([^()]*)\)\s*$/);

  if (!match) {
    return {
      title: heading.trim(),
      author: "",
    };
  }

  return {
    title: match[1].trim(),
    author: match[2].trim(),
  };
}

function parseKind(metadata: string): ClippingKind {
  if (/\byour\s+highlight\b/i.test(metadata)) {
    return "highlight";
  }

  if (/\byour\s+note\b/i.test(metadata)) {
    return "note";
  }

  if (/\byour\s+bookmark\b/i.test(metadata)) {
    return "bookmark";
  }

  return "unknown";
}

function parseRange(
  metadata: string,
  pattern: RegExp,
): { start: number | null; end: number | null } {
  const match = metadata.match(pattern);

  if (!match) {
    return { start: null, end: null };
  }

  const start = Number.parseInt(match[1], 10);
  const parsedEnd = match[2] ? Number.parseInt(match[2], 10) : start;

  return {
    start: Number.isFinite(start) ? start : null,
    end: Number.isFinite(parsedEnd) ? parsedEnd : null,
  };
}

function parseAddedAt(metadata: string): string | null {
  const match = metadata.match(/\bAdded on\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const timestamp = Date.parse(match[1].trim());
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === "") {
    start += 1;
  }

  while (end > start && lines[end - 1].trim() === "") {
    end -= 1;
  }

  return lines.slice(start, end);
}

function parseSection(
  section: string,
  sectionNumber: number,
): { clipping: ParsedClipping | null; error: KindleParseError | null } {
  const normalizedSection = section.replace(/\r\n?/g, "\n").trim();

  if (!normalizedSection) {
    return { clipping: null, error: null };
  }

  const lines = normalizedSection.split("\n");
  const heading = lines[0]?.trim() ?? "";

  if (!heading) {
    return {
      clipping: null,
      error: {
        section: sectionNumber,
        heading: null,
        reason: "The clipping has no book title.",
      },
    };
  }

  const metadataIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim().startsWith("-"),
  );

  if (metadataIndex === -1) {
    return {
      clipping: null,
      error: {
        section: sectionNumber,
        heading,
        reason: "The clipping metadata line could not be found.",
      },
    };
  }

  const metadata = lines[metadataIndex].trim();
  const { title, author } = parseHeading(heading);
  const kind = parseKind(metadata);
  const page = parseRange(
    metadata,
    /\bpage\s+(\d+)(?:\s*[-–]\s*(\d+))?/i,
  );
  const location = parseRange(
    metadata,
    /\bLocation\s+(\d+)(?:\s*[-–]\s*(\d+))?/i,
  );
  const sourceText = normalizeClippingText(
    trimBlankLines(lines.slice(metadataIndex + 1)).join("\n"),
  );

  if (!sourceText && kind !== "bookmark") {
    return {
      clipping: null,
      error: {
        section: sectionNumber,
        heading,
        reason: "The clipping has no text.",
      },
    };
  }

  const bookIdentity = createBookIdentity(title, author);
  const clippingIdentity = createClippingIdentity({
    bookSourceKey: bookIdentity.sourceKey,
    kind,
    sourceText,
    pageStart: page.start,
    pageEnd: page.end,
    locationStart: location.start,
    locationEnd: location.end,
  });

  return {
    clipping: {
      id: clippingIdentity.id,
      bookId: bookIdentity.id,
      bookSourceKey: bookIdentity.sourceKey,
      fingerprint: clippingIdentity.fingerprint,
      sourceTitle: title,
      sourceAuthor: author,
      kind,
      sourceText,
      pageStart: page.start,
      pageEnd: page.end,
      locationStart: location.start,
      locationEnd: location.end,
      sourceAddedAt: parseAddedAt(metadata),
      rawMetadata: metadata,
    },
    error: null,
  };
}

export function parseKindleClippings(content: string): KindleParseResult {
  const sections = content.replace(/^\uFEFF/, "").split(CLIPPING_SEPARATOR);
  const errors: KindleParseError[] = [];
  const uniqueClippings = new Map<string, ParsedClipping>();
  let duplicateCount = 0;
  let nonEmptySectionCount = 0;

  sections.forEach((section, index) => {
    if (!section.trim()) {
      return;
    }

    nonEmptySectionCount += 1;
    const result = parseSection(section, index + 1);

    if (result.error) {
      errors.push(result.error);
      return;
    }

    if (!result.clipping) {
      return;
    }

    if (uniqueClippings.has(result.clipping.fingerprint)) {
      duplicateCount += 1;
      return;
    }

    uniqueClippings.set(result.clipping.fingerprint, result.clipping);
  });

  const clippings = Array.from(uniqueClippings.values());

  return {
    clippings,
    errors,
    sectionCount: nonEmptySectionCount,
    duplicateCount,
    bookCount: new Set(clippings.map((clipping) => clipping.bookId)).size,
  };
}
