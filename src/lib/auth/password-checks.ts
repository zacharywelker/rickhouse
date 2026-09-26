import { verifyPassword } from "better-auth/crypto";
import { isPasswordCompromised } from "better-auth/plugins";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { CREDENTIAL_PROVIDER } from "./accounts";

/** The current password plus this many before it can't be chosen again. */
export const PASSWORD_HISTORY_DEPTH = 5;

export const PASSWORD_REUSED_CODE = "PASSWORD_REUSED";
export const PASSWORD_REUSED_MESSAGE = `Pick a password you haven't used here before (your last ${PASSWORD_HISTORY_DEPTH} don't count).`;
export const PASSWORD_COMPROMISED_MESSAGE =
  "That password has shown up in a data breach, so it's on attackers' lists. Pick a different one.";

/**
 * True when `password` matches the current password or one of the recent
 * ones kept in password_history (written by a trigger on accounts).
 */
export async function reusesRecentPassword(userId: number, password: string): Promise<boolean> {
  const [current] = await db
    .select({ hash: schema.accounts.password })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, CREDENTIAL_PROVIDER)))
    .limit(1);
  const earlier = await db
    .select({ hash: schema.passwordHistory.passwordHash })
    .from(schema.passwordHistory)
    .where(eq(schema.passwordHistory.userId, userId))
    .orderBy(desc(schema.passwordHistory.id))
    .limit(PASSWORD_HISTORY_DEPTH - 1);

  const hashes = [current?.hash, ...earlier.map((row) => row.hash)].filter((hash): hash is string => Boolean(hash));
  for (const hash of hashes) {
    if (await verifyPassword({ hash, password })) return true;
  }
  return false;
}

/**
 * Asks Have I Been Pwned about the password. Only the first five characters
 * of its SHA-1 hash leave the server (k-anonymity), never the password.
 * Throws when the service can't be reached, so a change fails closed.
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  if (!env().PASSWORD_BREACH_CHECK) return false;
  return isPasswordCompromised(password);
}
