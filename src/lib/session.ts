/**
 * Single shared password, signed httpOnly cookie. No user table, no OAuth —
 * this is a LAN app for one household (see SPEC.md Non-Goals).
 *
 * Signing uses Web Crypto so the same code runs in middleware and in server
 * actions. The token is `base64url(payload).base64url(hmac)`; the payload
 * carries nothing secret, only issue and expiry timestamps.
 */
export const SESSION_COOKIE = "rickhouse_session";

type SessionPayload = {
  /** Issued at, epoch seconds. */
  iat: number;
  /** Expires at, epoch seconds. */
  exp: number;
};

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Length-independent comparison, so a mismatch leaks no timing signal. */
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  // Compare fixed-size digests rather than the raw strings so differing
  // lengths do not short-circuit the loop.
  let diff = aBytes.length ^ bBytes.length;
  const len = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < len; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

export async function createSessionToken(secret: string, ttlDays: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { iat: now, exp: now + ttlDays * 24 * 60 * 60 };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = base64UrlEncode(
    new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body))),
  );
  if (!timingSafeEqual(signature, expected)) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as unknown;
    if (typeof payload !== "object" || payload === null) return false;
    const exp = (payload as Partial<SessionPayload>).exp;
    return typeof exp === "number" && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/** Constant-time check of a submitted password against the configured one. */
export function passwordMatches(submitted: string, configured: string): boolean {
  return timingSafeEqual(submitted, configured);
}

export function sessionCookieOptions(ttlDays: number, secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax",
    // Unraid boxes are usually reached over plain http on the LAN, so this
    // follows the deployment rather than hardcoding `secure: true`.
    secure,
    path: "/",
    maxAge: ttlDays * 24 * 60 * 60,
  } as const;
}
