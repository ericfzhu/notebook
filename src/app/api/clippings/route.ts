import { errorResponse, jsonResponse } from "@/lib/http";
import { listClippings, type ClippingFilters } from "@/lib/notebook-db";
import type { ClippingKind } from "@/lib/kindle/parser";

export const dynamic = "force-dynamic";

const KINDS = new Set<ClippingKind | "all">([
  "all",
  "highlight",
  "note",
  "bookmark",
  "unknown",
]);
const VIEWS = new Set<NonNullable<ClippingFilters["view"]>>([
  "all",
  "favorites",
  "review",
  "archived",
]);
const SORTS = new Set<NonNullable<ClippingFilters["sort"]>>([
  "recent",
  "oldest",
  "location",
]);

function parseInteger(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const kindValue = url.searchParams.get("kind") ?? "all";
    const viewValue = url.searchParams.get("view") ?? "all";
    const sortValue = url.searchParams.get("sort") ?? "recent";

    const filters: ClippingFilters = {
      bookId: url.searchParams.get("bookId") || undefined,
      tagId: url.searchParams.get("tagId") || undefined,
      query: url.searchParams.get("q") || undefined,
      kind: KINDS.has(kindValue as ClippingKind | "all")
        ? (kindValue as ClippingKind | "all")
        : "all",
      view: VIEWS.has(viewValue as NonNullable<ClippingFilters["view"]>)
        ? (viewValue as NonNullable<ClippingFilters["view"]>)
        : "all",
      sort: SORTS.has(sortValue as NonNullable<ClippingFilters["sort"]>)
        ? (sortValue as NonNullable<ClippingFilters["sort"]>)
        : "recent",
      limit: parseInteger(url.searchParams.get("limit"), 40),
      offset: parseInteger(url.searchParams.get("offset"), 0),
    };

    const result = await listClippings(filters);
    return jsonResponse(result);
  } catch (error) {
    console.error("Failed to load clippings", error);
    return errorResponse("Unable to load clippings.", 500);
  }
}
