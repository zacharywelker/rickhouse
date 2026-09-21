"use server";

import type { Route } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { SESSION_COOKIE, createSessionToken, passwordMatches, sessionCookieOptions } from "@/lib/session";

export type LoginState = { error: string | null };

const loginSchema = z.object({
  password: z.string().min(1, "Enter the password."),
  // Only same-origin paths, so a crafted link cannot bounce you off-site.
  next: z
    .string()
    .optional()
    .transform((value) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/")),
});

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter the password." };
  }

  const config = env();
  if (!passwordMatches(parsed.data.password, config.APP_PASSWORD)) {
    return { error: "That password is not right." };
  }

  const token = await createSessionToken(config.SESSION_SECRET, config.SESSION_TTL_DAYS);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(config.SESSION_TTL_DAYS, config.COOKIE_SECURE));

  // Validated above to be a same-origin path; `typedRoutes` cannot prove that.
  redirect(parsed.data.next as Route);
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
