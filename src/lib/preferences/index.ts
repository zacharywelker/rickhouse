import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";

export type Preferences = { searchFirstAdd: boolean };

const DEFAULTS: Preferences = { searchFirstAdd: false };

/** The account's preferences, with defaults for anything never changed. */
export async function getPreferences(userId: number): Promise<Preferences> {
  const [row] = await db
    .select({ searchFirstAdd: userPreferences.searchFirstAdd })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return row ?? DEFAULTS;
}

export async function updatePreferences(userId: number, patch: Partial<Preferences>): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: userPreferences.userId, set: patch });
}
