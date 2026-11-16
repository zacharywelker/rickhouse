import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { bottles, cooperages, expressionReleases, expressions, stores } from "@/db/schema";
import { parseReleaseRow } from "@/lib/releases";
import type { Tx } from "@/lib/expressions/save";
import { slugify } from "@/lib/utils";

/**
 * Stores and cooperages named in a cell that do not exist yet, made in the caller's transaction so a row that then
 * fails to save leaves nothing behind.
 *
 * A store is unique by name *and place*, and Postgres treats two null places as different, so the unique key cannot
 * stop two saves of the same new store from both inserting. An advisory lock on the name, held until the transaction
 * ends, makes the second wait for the first and then find it.
 */

type Named = { id: PgColumn; ownerId: PgColumn; name: PgColumn; slug: PgColumn };

/** A free slug for this owner: the name's, or the name's with a number after it. Reads inside the transaction. */
async function freeSlug(tx: Tx, table: typeof stores | typeof cooperages, ownerId: number, name: string): Promise<string> {
  const t = table as unknown as Named;
  const base = slugify(name) || "item";
  for (let suffix = 1; suffix < 200; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    if ((await tx.$count(table, and(eq(t.ownerId, ownerId), eq(t.slug, candidate)))) === 0) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function lock(tx: Tx, kind: string, ownerId: number, name: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${kind}:${ownerId}:${name.toLowerCase()}`}, 0))`);
}

/** The caller's store of this name with no place given (any case), made if it is new. A store of the name in a place is a different store, picked from the list. */
export async function ensureStore(tx: Tx, ownerId: number, name: string): Promise<{ id: number; created: boolean }> {
  await lock(tx, "store", ownerId, name);
  const [found] = await tx
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.ownerId, ownerId), eq(stores.name, name), isNull(stores.city), isNull(stores.state), isNull(stores.country)))
    .limit(1);
  if (found) return { id: found.id, created: false };
  const slug = await freeSlug(tx, stores, ownerId, name);
  const [row] = await tx.insert(stores).values({ ownerId, name, slug }).returning({ id: stores.id });
  return { id: row!.id, created: true };
}

/** The caller's cooperage of this name (any case), made if it is new. */
export async function ensureCooperage(tx: Tx, ownerId: number, name: string): Promise<{ id: number; created: boolean }> {
  await lock(tx, "cooperage", ownerId, name);
  const [found] = await tx.select({ id: cooperages.id }).from(cooperages).where(and(eq(cooperages.ownerId, ownerId), eq(cooperages.name, name))).limit(1);
  if (found) return { id: found.id, created: false };
  const slug = await freeSlug(tx, cooperages, ownerId, name);
  const [row] = await tx.insert(cooperages).values({ ownerId, name, slug }).returning({ id: cooperages.id });
  return { id: row!.id, created: true };
}

/**
 * Takes back a store or cooperage that a save made and then failed to use, unless something has used it since.
 * Needed for the patches, which change a bottle or a label in a transaction of their own.
 */
export async function takeBack(tx: Tx, made: { store?: number; cooperage?: number; vintage?: number }): Promise<void> {
  if (made.vintage !== undefined) {
    await tx.delete(expressionReleases).where(and(eq(expressionReleases.id, made.vintage), sql`not exists (select 1 from ${bottles} where ${bottles.releaseId} = ${expressionReleases.id})`));
  }
  if (made.store !== undefined) {
    await tx.delete(stores).where(and(eq(stores.id, made.store), sql`not exists (select 1 from ${bottles} where ${bottles.storeId} = ${stores.id})`));
  }
  if (made.cooperage !== undefined) {
    await tx.delete(cooperages).where(and(eq(cooperages.id, made.cooperage), sql`not exists (select 1 from ${expressions} where ${expressions.cooperageId} = ${cooperages.id})`));
  }
}

/**
 * The vintage (a label's known release) of this name on this label, made if it is new, with the proof and age typed
 * into the row that makes it. Safe when two saves of the same new vintage run at once (the advisory lock on its name).
 * A vintage that exists already keeps what it has: the values typed are not written over it.
 */
export async function ensureVintage(tx: Tx, ownerId: number, labelId: number, name: string, facts: Readonly<Record<string, string>> = {}): Promise<{ id: number; created: boolean }> {
  await lock(tx, "vintage", ownerId, `${labelId}:${name}`);
  const [found] = await tx.select({ id: expressionReleases.id }).from(expressionReleases).where(and(eq(expressionReleases.expressionId, labelId), eq(expressionReleases.name, name))).limit(1);
  if (found) return { id: found.id, created: false };
  const parsed = parseReleaseRow({ name, ...facts });
  if (parsed.error !== null) throw new Error(parsed.error);
  const { id: _ignored, ...values } = parsed.value;
  const [last] = await tx.select({ position: sql<number>`coalesce(max(${expressionReleases.position}), -1)` }).from(expressionReleases).where(eq(expressionReleases.expressionId, labelId));
  const [row] = await tx.insert(expressionReleases).values({ ...values, expressionId: labelId, position: (last?.position ?? -1) + 1 }).returning({ id: expressionReleases.id });
  return { id: row!.id, created: true };
}
