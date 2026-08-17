import { errorResponse, isRecord, jsonResponse } from "@/lib/http";
import { updateClipping, type UpdateClippingInput } from "@/lib/notebook-db";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

function optionalString(
  value: unknown,
  field: string,
  maximumLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new RequestValidationError(`${field} must be text or null.`);
  }
  if (value.length > maximumLength) {
    throw new RequestValidationError(`${field} is too long.`);
  }
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new RequestValidationError(`${field} must be true or false.`);
  }
  return value;
}

function optionalTags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new RequestValidationError("tags must be a list of text values.");
  }
  if (value.length > 20 || value.some((tag) => tag.length > 40)) {
    throw new RequestValidationError(
      "Use at most 20 tags, with 40 characters per tag.",
    );
  }
  return value;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return errorResponse("Invalid request body.");

    const input: UpdateClippingInput = {
      editedText: optionalString(body.editedText, "editedText", 100_000),
      personalNote: optionalString(body.personalNote, "personalNote", 20_000),
      isFavorite: optionalBoolean(body.isFavorite, "isFavorite"),
      archived: optionalBoolean(body.archived, "archived"),
      needsReview: optionalBoolean(body.needsReview, "needsReview"),
      tags: optionalTags(body.tags),
    };
    const { id } = await context.params;
    const clipping = await updateClipping(id, input);

    if (!clipping) return errorResponse("Clipping not found.", 404);
    return jsonResponse(clipping);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorResponse("The request body is not valid JSON.");
    }
    if (error instanceof RequestValidationError) {
      return errorResponse(error.message);
    }

    console.error("Failed to update clipping", error);
    return errorResponse("Unable to update this clipping.", 500);
  }
}
