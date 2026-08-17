export function normalizeIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function normalizeClippingText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * A deterministic 64-bit-style identifier made from two independent 32-bit
 * hashes. It is fast enough to run over a large Kindle file in the browser and
 * stable across browsers, Workers, and Node.js.
 */
export function stableHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);

    first ^= codePoint;
    first = Math.imul(first, 0x01000193);

    second ^= codePoint + Math.imul(index + 1, 97);
    second = Math.imul(second, 0x85ebca6b);
    second ^= second >>> 13;
  }

  first ^= first >>> 16;
  second ^= second >>> 16;

  return `${(first >>> 0).toString(16).padStart(8, "0")}${(
    second >>> 0
  )
    .toString(16)
    .padStart(8, "0")}`;
}

export function createBookIdentity(title: string, author: string): {
  sourceKey: string;
  id: string;
} {
  const sourceKey = stableHash(
    `${normalizeIdentity(title)}\u0000${normalizeIdentity(author)}`,
  );

  return {
    sourceKey,
    id: `book_${sourceKey}`,
  };
}

export function createClippingIdentity(input: {
  bookSourceKey: string;
  kind: string;
  sourceText: string;
  pageStart: number | null;
  pageEnd: number | null;
  locationStart: number | null;
  locationEnd: number | null;
}): { fingerprint: string; id: string } {
  const locator = input.locationStart !== null
    ? `location:${input.locationStart}-${input.locationEnd ?? input.locationStart}`
    : input.pageStart !== null
      ? `page:${input.pageStart}-${input.pageEnd ?? input.pageStart}`
      : "no-location";

  const fingerprint = stableHash(
    [
      input.bookSourceKey,
      input.kind,
      locator,
      normalizeClippingText(input.sourceText),
    ].join("\u0000"),
  );

  return {
    fingerprint,
    id: `clip_${fingerprint}`,
  };
}
