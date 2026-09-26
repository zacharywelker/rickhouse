import { passkeyClient } from "@better-auth/passkey/client";
import { twoFactorClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Browser-side calls to /api/auth. Sign-in and password changes go through
 * here rather than server actions so they pass Better Auth's rate limiter,
 * which only sees HTTP requests. Same origin, so no baseURL.
 */
export const authClient = createAuthClient({
  plugins: [usernameClient(), twoFactorClient(), passkeyClient()],
});

/** Better Auth's error for a request the rate limiter turned away. */
export function isRateLimited(error: { status?: number } | null | undefined): boolean {
  return error?.status === 429;
}
