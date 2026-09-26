"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";

/**
 * Sign-in itself happens in the browser (see login-form.tsx) so it passes
 * Better Auth's rate limiter. Signing out has nothing to guess, so it stays
 * a plain form post; nextCookies() clears the cookie on the way out.
 */
export async function logout(): Promise<void> {
  const requestHeaders = await headers();
  await (await getAuth()).api.signOut({ headers: requestHeaders });
  redirect("/login");
}
