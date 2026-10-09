import { NextResponse, type NextRequest } from "next/server";
import { APIError } from "better-auth/api";
import { apiError } from "@/lib/api/v1";
import { attemptKey, clearAttempts, ipLimited, reserveAttempt } from "@/lib/auth/app-sign-in";
import { CLIENT_IP_HEADER } from "@/lib/auth/client-ip";
import { PASSWORD_MAX_LENGTH } from "@/lib/auth/passwords";
import { clientIpOf } from "@/lib/auth/request-ip";
import { getAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const WRONG = "Wrong username or password.";

/**
 * Password sign-in for the iOS app. The web form proves it's a person with a
 * Turnstile check; an app has nothing to prove that with (and a check anyone
 * can skip by claiming to be the app is no check), so this route has none.
 * It slows the guessing instead: attempts per address, and a back-off per
 * account that holds however many addresses are guessing (see app-sign-in.ts).
 *
 * It calls Better Auth directly, so its own rate limiter and captcha plugin,
 * which only see HTTP requests, don't run: the limits here replace them. The
 * web route (/api/auth/sign-in/username) keeps both.
 *
 * Answers are the same for a wrong password, an unknown name and a malformed
 * one, and the back-off counts names that don't exist, so none of this tells a
 * stranger which accounts there are. A success is Better Auth's own answer:
 * the `set-auth-token` header, or `twoFactorRedirect` plus the cookie for the
 * second step, which the app finishes at /api/auth/two-factor/* as before.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Better Auth's Origin check doesn't run on a direct call, and the answer sets a
  // session cookie. A page on another site can send text/plain without a preflight
  // and sign a browser in as someone else; application/json can't cross sites.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return apiError(415, "unsupported_media_type", "Send JSON.");
  }
  const body: unknown = await request.json().catch(() => null);
  const username = (body as { username?: unknown } | null)?.username;
  const password = (body as { password?: unknown } | null)?.password;
  if (typeof username !== "string" || typeof password !== "string") {
    return apiError(400, "invalid_request", "Send a username and password.");
  }
  // Too long to be anyone's: refuse before hashing a megabyte.
  if (username.length > 64 || password.length > PASSWORD_MAX_LENGTH) return apiError(401, "invalid_credentials", WRONG);

  const ip = clientIpOf(request.headers);
  if (ipLimited(ip)) return tooMany(60);

  const key = attemptKey(username);
  const verdict = await reserveAttempt(key);
  if (!verdict.allowed) return tooMany(verdict.retryAfterSeconds);

  // Better Auth reads the address from CLIENT_IP_HEADER, which only we set.
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_IP_HEADER);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);

  const auth = await getAuth(headers);
  let answer: Response;
  try {
    answer = await auth.api.signInUsername({ body: { username, password }, headers, asResponse: true });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    answer = Response.json({ message: error.message, code: error.body?.code }, { status: error.statusCode });
  }

  if (answer.ok) {
    await clearAttempts(key);
    return new NextResponse(answer.body, { status: answer.status, headers: answer.headers });
  }
  // The right password for an account that can't sign in (deactivated): say so, as the web does.
  if (answer.status === 403) {
    await clearAttempts(key);
    const text = (await answer.json().catch(() => null))?.message;
    return apiError(403, "account_unavailable", typeof text === "string" ? text : "This account can't sign in.");
  }
  return apiError(401, "invalid_credentials", WRONG);
}

function tooMany(seconds: number): NextResponse {
  const minutes = Math.ceil(seconds / 60);
  const response = apiError(429, "too_many_attempts", `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  response.headers.set("retry-after", String(seconds));
  return response;
}
