export function jsonResponse<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init?.headers,
    },
  });
}

export function errorResponse(
  message: string,
  status = 400,
  details?: unknown,
): Response {
  return jsonResponse(
    {
      error: message,
      ...(details === undefined ? {} : { details }),
    },
    { status },
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
