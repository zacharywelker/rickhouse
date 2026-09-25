"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { normalizeUsername, usernameProblem } from "@/lib/auth/accounts";
import { mapDbError } from "@/lib/db-errors";

export type ProfileState = { ok: boolean; message: string | null };

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Keep your name under 100 characters."),
  username: z
    .string()
    .transform(normalizeUsername)
    .superRefine((value, ctx) => {
      const problem = usernameProblem(value);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    }),
});

/**
 * Your own name and username. Email waits for the SMTP step, where a change
 * can be confirmed by mail; passwords go through Better Auth so guesses at
 * the current one are rate limited.
 */
export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireSession();
  const parsed = profileSchema.safeParse({ name: formData.get("name"), username: formData.get("username") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };

  const { name, username } = parsed.data;
  try {
    await db
      .update(schema.users)
      .set({ name, username, displayUsername: username })
      .where(eq(schema.users.id, user.id));
  } catch (error) {
    const mapped = mapDbError(error, { singular: "account" });
    return { ok: false, message: mapped.ok ? "Could not save your profile." : mapped.error };
  }
  // The header shows the first name on every page.
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}
