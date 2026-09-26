import { toNextJsHandler } from "better-auth/next-js";
import { CLIENT_IP_HEADER, buildBlockList, clientIpFromForwardedFor } from "@/lib/auth/client-ip";
import { getAuth } from "@/lib/auth/server";
import { env } from "@/lib/env";

/**
 * Better Auth's HTTP endpoints: sign-in, sign-out, session, change-password.
 * Its rate limiter only sees requests that come through here, so anything
 * that checks a password must be called over HTTP, not through `auth.api`.
 * The instance is fetched per request because SSO providers and email can
 * change at run time (see getAuth).
 */
const trustedProxies = buildBlockList(env().TRUSTED_PROXIES);

/**
 * The admin plugin's endpoints are closed to the browser. Account management
 * goes through the admin Users page's server actions, which enforce the
 * rules Better Auth doesn't know about (never act on yourself, so there is
 * always an active admin).
 */
function blocked(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return pathname.startsWith("/api/auth/admin/");
}

/** Replaces whatever the browser sent in CLIENT_IP_HEADER with our own reading. */
function withClientIp(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = clientIpFromForwardedFor(request.headers.get("x-forwarded-for"), trustedProxies);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  return new Request(request, { headers });
}

export async function GET(request: Request): Promise<Response> {
  if (blocked(request)) return new Response("Not found", { status: 404 });
  return toNextJsHandler(await getAuth()).GET(withClientIp(request));
}

export async function POST(request: Request): Promise<Response> {
  if (blocked(request)) return new Response("Not found", { status: 404 });
  return toNextJsHandler(await getAuth()).POST(withClientIp(request));
}
