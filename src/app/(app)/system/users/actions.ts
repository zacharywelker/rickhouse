"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { USER_ROLES, type UserRole } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { createPasswordUser, normalizeUsername, replacePassword, usernameProblem } from "@/lib/auth/accounts";
import { generatePassword, isPlaceholderEmail } from "@/lib/auth/passwords";
import { mapDbError } from "@/lib/db-errors";
import { getAuth, INVITE_MARKER } from "@/lib/auth/server";
import { emailEnabled } from "@/lib/email/settings";
import { deleteStoredImage } from "@/lib/images";

/**
 * Account management for admins. These write the database directly instead
 * of calling Better Auth's admin endpoints (which /api/auth refuses), so the
 * rules below can't be sidestepped:
 *
 *   - an admin never changes, deactivates or deletes their own account
 *     here, which is what guarantees there is always an active admin (only
 *     an admin can demote or deactivate another admin);
 *   - generated passwords are shown once and must be replaced at first
 *     sign-in.
 */
export type UserActionResult =
  | { ok: true; message: string; password?: string }
  | { ok: false; error: string };

const PATH = "/system/users";

const newUserSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  username: z
    .string()
    .transform(normalizeUsername)
    .superRefine((value, ctx) => {
      const problem = usernameProblem(value);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a real email address.")
    .refine((value) => !isPlaceholderEmail(value), "Enter a real email address."),
  role: z.enum(USER_ROLES),
});

export async function createUserAction(_prev: UserActionResult | null, formData: FormData): Promise<UserActionResult> {
  await requireAdmin();
  const parsed = newUserSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username") ?? "",
    email: formData.get("email") ?? "",
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };

  // An invitation sets a password nobody sees; the person picks their own
  // from the emailed link instead of being handed a temporary one.
  const invite = formData.get("invite") === "on" && (await emailEnabled());
  const password = generatePassword();
  try {
    await createPasswordUser(db, { ...parsed.data, password, mustChangePassword: !invite });
  } catch (error) {
    const mapped = mapDbError(error, { singular: "account" });
    return { ok: false, error: mapped.ok ? "Could not create the account." : mapped.error };
  }
  revalidatePath(PATH);
  if (invite) {
    const sent = await emailLink(parsed.data.email, `/reset-password?${INVITE_MARKER}`);
    return sent
      ? { ok: true, message: `Created ${parsed.data.username} and emailed an invitation to ${parsed.data.email}.` }
      : { ok: true, message: `Created ${parsed.data.username}, but the invitation email failed. Use Reset password to hand over a temporary one.` };
  }
  return { ok: true, message: `Created ${parsed.data.username}.`, password };
}

/** The target, provided it isn't the admin acting. */
async function otherUser(userId: number, verb: string): Promise<{ username: string } | string> {
  const me = await requireAdmin();
  if (userId === me.id) return `You can't ${verb} your own account here.`;
  const [target] = await db
    .select({ username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return target ?? "That account no longer exists.";
}

export async function setRoleAction(userId: number, role: UserRole): Promise<UserActionResult> {
  if (!USER_ROLES.includes(role)) return { ok: false, error: "Unknown role." };
  const target = await otherUser(userId, "change the role of");
  if (typeof target === "string") return { ok: false, error: target };

  await db.update(schema.users).set({ role }).where(eq(schema.users.id, userId));
  revalidatePath(PATH);
  return { ok: true, message: `${target.username} is now ${role === "admin" ? "an admin" : "a member"}.` };
}

/** Deactivating signs the person out everywhere; their data is untouched. */
export async function setActiveAction(userId: number, active: boolean): Promise<UserActionResult> {
  const target = await otherUser(userId, "deactivate");
  if (typeof target === "string") return { ok: false, error: target };

  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ banned: !active, banReason: null, banExpires: null })
      .where(eq(schema.users.id, userId));
    if (!active) await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  });
  revalidatePath(PATH);
  return { ok: true, message: `${target.username} is ${active ? "active again" : "deactivated"}.` };
}

export async function resetPasswordAction(userId: number): Promise<UserActionResult> {
  const target = await otherUser(userId, "reset the password of");
  if (typeof target === "string") return { ok: false, error: `${target} Use the Account page instead.` };

  const password = generatePassword();
  await replacePassword(db, userId, password, { mustChangePassword: true });
  revalidatePath(PATH);
  return { ok: true, message: `New temporary password for ${target.username}.`, password };
}

/** Sends Better Auth's reset link (or an invitation, by the redirect's marker). */
async function emailLink(email: string, redirectTo: string): Promise<boolean> {
  try {
    const auth = await getAuth();
    await auth.api.requestPasswordReset({ body: { email, redirectTo } });
    return true;
  } catch (error: unknown) {
    console.error("[rickhouse] could not email a reset link", error);
    return false;
  }
}

/** Only offered while email works. The person picks the new password themselves. */
export async function emailResetLinkAction(userId: number): Promise<UserActionResult> {
  const target = await otherUser(userId, "reset the password of");
  if (typeof target === "string") return { ok: false, error: `${target} Use the Account page instead.` };
  if (!(await emailEnabled())) return { ok: false, error: "Email isn't set up." };
  const [row] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId));
  if (!row) return { ok: false, error: "That account no longer exists." };
  return (await emailLink(row.email, "/reset-password"))
    ? { ok: true, message: `Emailed a reset link to ${row.email}.` }
    : { ok: false, error: "The email didn't send. Check the settings under Email." };
}

export async function deleteUserAction(userId: number): Promise<UserActionResult> {
  const target = await otherUser(userId, "delete");
  if (typeof target === "string") return { ok: false, error: target };

  // Their whole collection cascades away in the database; the photo files on
  // disk do not, so note them first and remove them once the rows are gone.
  const photos = await db
    .select({ filePath: schema.bottleImages.filePath, thumbPath: schema.bottleImages.thumbPath })
    .from(schema.bottleImages)
    .innerJoin(schema.bottles, eq(schema.bottles.id, schema.bottleImages.bottleId))
    .where(eq(schema.bottles.ownerId, userId));
  const covers = await db
    .select({ path: schema.groups.coverImagePath })
    .from(schema.groups)
    .where(and(eq(schema.groups.ownerId, userId), isNotNull(schema.groups.coverImagePath)));

  await db.delete(schema.users).where(eq(schema.users.id, userId));
  await Promise.allSettled([
    ...photos.map((photo) => deleteStoredImage(photo.filePath, photo.thumbPath)),
    ...covers.map((cover) => deleteStoredImage(cover.path as string, null)),
  ]);
  revalidatePath(PATH);
  return { ok: true, message: `Deleted ${target.username} and their collection.` };
}
