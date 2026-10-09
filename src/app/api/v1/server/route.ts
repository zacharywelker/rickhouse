import { NextResponse, type NextRequest } from "next/server";
import { API_VERSION } from "@/lib/api/v1";
import { emailEnabled } from "@/lib/email/settings";
import { turnstileSiteKeyFor } from "@/lib/auth/turnstile";

export const dynamic = "force-dynamic";

/**
 * What the app needs to know before it can sign in, so it is public (the
 * middleware lets it through without a session). `turnstileSiteKey` is the
 * same answer the web login gets: null when the server asks nobody, or
 * doesn't ask this visitor's network. `app` lets the iOS app tell a Rickhouse
 * server from any other HTTPS site that happens to answer with JSON.
 * `emailCodes` is whether two-step sign-in can email a code (SMTP is set up);
 * authenticator and backup codes always work, so they need no flag.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({
    app: "rickhouse",
    apiVersion: API_VERSION,
    turnstileSiteKey: turnstileSiteKeyFor(request.headers),
    emailCodes: await emailEnabled(),
  });
}
