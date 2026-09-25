"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { replacePassword } from "@/lib/auth/accounts";
import { isPlaceholderEmail, passwordProblem } from "@/lib/auth/passwords";
import { mapDbError } from "@/lib/db-errors";

export type SetupState = { error: string | null };

const setupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a real email address.").optional(),
  password: z.string(),
  confirm: z.string(),
});

/**
 * Swaps a generated password (first run, CLI reset, admin-created account)
 * for one the person chose. No current-password prompt: they just signed in
 * with it, and the session plus the must-change flag already prove that.
 */
export async function completeSetup(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const user = await requireSession({ allowPendingSetup: true });
  if (!user.mustChangePassword) redirect("/");

  const needsEmail = isPlaceholderEmail(user.email);
  const parsed = setupSchema.safeParse({
    email: needsEmail ? formData.get("email") : undefined,
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const { email, password, confirm } = parsed.data;
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "The two passwords don't match." };

  if (needsEmail && email) {
    if (isPlaceholderEmail(email)) return { error: "Enter a real email address." };
    const [taken] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`${schema.users.email} = ${email} AND ${schema.users.id} <> ${user.id}`)
      .limit(1);
    if (taken) return { error: "Another account already uses that email." };
    try {
      await db.update(schema.users).set({ email, emailVerified: false }).where(eq(schema.users.id, user.id));
    } catch (error) {
      // Lost a race with someone else claiming the same address.
      const mapped = mapDbError(error, { singular: "account" });
      return { error: mapped.ok ? "Could not save that email." : mapped.error };
    }
  }

  // Keeps this browser signed in; any other session made with the generated
  // password is dropped.
  await replacePassword(db, user.id, password, { mustChangePassword: false, keepSessionToken: user.sessionToken });
  redirect("/");
}
