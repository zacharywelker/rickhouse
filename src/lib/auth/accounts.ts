import { hashPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import type { UserRole } from "@/db/schema";

/**
 * Account writes that bypass Better Auth's HTTP API: the first-run admin,
 * the command-line reset, and the admin Users page. They write the same rows
 * Better Auth would (a `users` row plus a `credential` account holding a
 * scrypt hash from Better Auth's own hasher), so sign-in cannot tell the
 * difference.
 *
 * Takes the database as a parameter because the container scripts build
 * their own connection; nothing here may import Next or `env()`.
 */
type Db = PostgresJsDatabase<typeof schema>;

/** Better Auth's provider id for email/username + password sign-in. */
export const CREDENTIAL_PROVIDER = "credential";

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/** Better Auth's username plugin stores usernames lowercased. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Mirrors the username plugin's default validator and length limits. */
export function usernameProblem(username: string): string | null {
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return `Usernames are ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!/^[a-z0-9_.]+$/.test(username)) {
    return "Usernames use letters, numbers, dots and underscores only.";
  }
  return null;
}

export type NewPasswordUser = {
  name: string;
  username: string;
  email: string;
  role: UserRole;
  password: string;
  mustChangePassword: boolean;
};

export async function createPasswordUser(db: Db, input: NewPasswordUser): Promise<number> {
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(schema.users)
      .values({
        name: input.name,
        username: normalizeUsername(input.username),
        displayUsername: input.username.trim(),
        email: input.email.trim().toLowerCase(),
        role: input.role,
        mustChangePassword: input.mustChangePassword,
      })
      .returning({ id: schema.users.id });
    if (!user) throw new Error("Creating the user returned no row");
    await tx.insert(schema.accounts).values({
      userId: user.id,
      // Better Auth keys credential accounts by the user's own id.
      accountId: String(user.id),
      providerId: CREDENTIAL_PROVIDER,
      password: passwordHash,
    });
    return user.id;
  });
}

/**
 * Replaces (or adds, for an SSO-only user) the password, and signs the user
 * out everywhere: whoever had the old password, or a session from before the
 * reset, should not keep one.
 */
export async function replacePassword(
  db: Db,
  userId: number,
  password: string,
  options: { mustChangePassword: boolean; keepSessionToken?: string },
): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(schema.accounts)
      .set({ password: passwordHash })
      .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, CREDENTIAL_PROVIDER)))
      .returning({ id: schema.accounts.id });
    if (updated.length === 0) {
      await tx.insert(schema.accounts).values({
        userId,
        accountId: String(userId),
        providerId: CREDENTIAL_PROVIDER,
        password: passwordHash,
      });
    }
    await tx
      .update(schema.users)
      .set({ mustChangePassword: options.mustChangePassword })
      .where(eq(schema.users.id, userId));
    await tx
      .delete(schema.sessions)
      .where(
        options.keepSessionToken
          ? and(eq(schema.sessions.userId, userId), sql`${schema.sessions.token} <> ${options.keepSessionToken}`)
          : eq(schema.sessions.userId, userId),
      );
  });
}

/** Username or email, case-insensitively (both columns are citext). */
export async function findUserByLogin(db: Db, login: string) {
  const value = login.trim();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(value.includes("@") ? eq(schema.users.email, value) : eq(schema.users.username, value))
    .limit(1);
  return user ?? null;
}
