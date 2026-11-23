import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { housekeepingDismissals } from "@/db/schema";
import { duplicateScope } from "./pair-key";
import type { DuplicateKind } from "./duplicate-kinds";

export { duplicateScope, pairKey } from "./pair-key";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Remembers that the owner answered a Housekeeping question for `key`. Saying it twice is the same as once. */
export async function dismiss(ownerId: number, scope: string, key: string): Promise<void> {
  await db.insert(housekeepingDismissals).values({ ownerId, scope, key }).onConflictDoNothing();
}

/** The keys this owner has dismissed for a scope. */
export async function listDismissed(ownerId: number, scope: string): Promise<Set<string>> {
  const rows = await db
    .select({ key: housekeepingDismissals.key })
    .from(housekeepingDismissals)
    .where(and(eq(housekeepingDismissals.ownerId, ownerId), eq(housekeepingDismissals.scope, scope)));
  return new Set(rows.map((row) => row.key));
}

/** Forgets every dismissed pair of this kind that mentions a row, for use inside the merge that removes the row. */
export async function clearDismissalsFor(executor: Executor, ownerId: number, kind: DuplicateKind, id: number): Promise<void> {
  const text = String(id);
  await executor
    .delete(housekeepingDismissals)
    .where(
      and(
        eq(housekeepingDismissals.ownerId, ownerId),
        eq(housekeepingDismissals.scope, duplicateScope(kind)),
        sql`(split_part(${housekeepingDismissals.key}, ':', 1) = ${text} or split_part(${housekeepingDismissals.key}, ':', 2) = ${text})`,
      ),
    );
}
