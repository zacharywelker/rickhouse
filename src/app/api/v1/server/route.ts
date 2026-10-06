import { NextResponse, type NextRequest } from "next/server";
import { API_VERSION } from "@/lib/api/v1";
import { turnstileSiteKeyFor } from "@/lib/auth/turnstile";

export const dynamic = "force-dynamic";

/**
 * What the app needs to know before it can sign in, so it is public (the
 * middleware lets it through without a session). `turnstileSiteKey` is the
 * same answer the web login gets: null when the server asks nobody, or
 * doesn't ask this visitor's network.
 */
export function GET(request: NextRequest): NextResponse {
  return NextResponse.json({ apiVersion: API_VERSION, turnstileSiteKey: turnstileSiteKeyFor(request.headers) });
}
