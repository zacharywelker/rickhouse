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
