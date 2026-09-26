import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { UserRole } from "@/db/schema";
import { getAuth } from "./server";

/** The signed-in user, with Better Auth's string id turned back into ours. */
export type CurrentUser = {
  id: number;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  /** Identifies this browser's session, e.g. to keep it when revoking others. */
  sessionToken: string;
};

/** One session lookup per request, however many components ask. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // headers() first: it is what marks the page dynamic, so nothing below
  // (getAuth reads the database) runs while Next prerenders at build time.
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { user } = session;
  return {
    id: Number(user.id),
    name: user.name,
    username: user.username ?? "",
    email: user.email,
    role: user.role === "admin" ? "admin" : "member",
    mustChangePassword: user.mustChangePassword === true,
    twoFactorEnabled: user.twoFactorEnabled === true,
    sessionToken: session.session.token,
  };
});

/**
 * Belt and braces: middleware already gates every route, but server
 * components, actions and API routes that touch data call this so a routing
 * mistake cannot expose it.
 *
 * Someone still holding a generated password is sent to choose their own
 * first; only the page that does that passes `allowPendingSetup`.
 */
export async function requireSession(options?: { allowPendingSetup?: boolean }): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options?.allowPendingSetup) redirect("/account/setup");
  return user;
}

/** 404 rather than 403, so members cannot map out the admin area. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireSession();
  if (user.role !== "admin") notFound();
  return user;
}
