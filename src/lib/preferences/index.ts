import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { requireSession } from "@/lib/auth";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { userPreferences } from "@/db/schema";

export type Preferences = { searchFirstAdd: boolean; currency: string };

const DEFAULTS: Preferences = {
  searchFirstAdd: false,
  currency: DEFAULT_CURRENCY,
};

/** The account's preferences, with defaults for anything never changed. */
export async function getPreferences(userId: number): Promise<Preferences> {
  const [row] = await db
    .select({
      searchFirstAdd: userPreferences.searchFirstAdd,
      currency: userPreferences.currency,
    })
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

/** The current account's currency, for server components. Cached per request. */
export const getCurrency = cache(async (): Promise<string> => {
  const user = await requireSession();
  return (await getPreferences(user.id)).currency;
});
