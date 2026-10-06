import { NextResponse } from "next/server";

/**
 * The JSON API the iOS app speaks (`/api/v1`). Every error has the same
 * shape, so the app can show `message` and branch on `code`.
 */
/**
 * Sent as `x-rickhouse-api` on every `/api/v1` response. Within a version,
 * changes are additive only; a breaking change is a new version. The app
 * compares this to the range it supports, so a mismatch reads as "update the
 * app" or "update your server" rather than a decoding error.
 */
export const API_VERSION = "1";
export const API_VERSION_HEADER = "x-rickhouse-api";

export type ApiErrorBody = { error: { code: string; message: string; fields?: Record<string, string> } };

export function apiError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}

/** A route's query string as the plain record the web grid's parsers take. */
export function paramsRecord(searchParams: URLSearchParams): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of searchParams) out[key] ??= value;
  return out;
}

/** An id path segment, or null when it is not a positive integer. */
export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * A request's JSON object body, or the error to answer with. It insists on
 * `application/json`, which a cross-site form can't send, so a cookie-carrying
 * browser can't be made to write through the API by a page on another site.
 */
export async function readJsonObject(request: Request): Promise<{ body: Record<string, unknown> } | { error: NextResponse<ApiErrorBody> }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { error: apiError(415, "unsupported_media_type", "Send application/json.") };
  }
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: apiError(400, "bad_request", "Send a JSON object.") };
  }
  return { body: body as Record<string, unknown> };
}

/** Zod issues as the `{ field: message }` map the error body carries (first message per field). */
export function issueFields(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fields)) fields[key] = issue.message;
  }
  return fields;
}
