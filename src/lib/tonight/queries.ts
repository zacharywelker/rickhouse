import "server-only";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottleList, bottles, expressions, tastingNotes } from "@/db/schema";
import { findDescriptor } from "@/lib/tasting-wheels";
import { categoryWheels } from "@/lib/tasting-wheel-for";
import type { ShelfBottle, TastingRow, TonightData } from "./build";

/** Today in the database's calendar, so a mute's end date and a tasting's date are judged by the same clock. */
export async function today(): Promise<string> {
  const rows = await db.execute<{ today: string }>(sql`select to_char(current_date, 'YYYY-MM-DD') as today`);
  return rows[0]!.today;
}

const num = (value: string | null): number | null => (value === null ? null : Number(value));

/** The last word of a flavor key, for a key no wheel knows any more. */
function fallbackLabel(key: string): string {
  const word = key.split("/").pop() ?? key;
  return word.charAt(0).toUpperCase() + word.slice(1).replace(/-/g, " ");
}

/** The shelf (owned or open, not empty), the tastings, and the wheels, as `build.ts` takes them. */
export async function loadTonight(ownerId: number): Promise<TonightData> {
  const [now, shelfRows, tastingRows, wheels] = await Promise.all([
    today(),
    db
      .select({
        id: bottleList.id,
        expressionId: bottleList.expressionId,
        brand: bottleList.brand,
        name: bottleList.expressionName,
        categoryId: bottleList.categoryId,
        category: bottleList.category,
        isOpen: bottleList.isOpen,
        fillPct: bottleList.fillPct,
        proof: bottleList.proof,
        dateAcquired: bottleList.dateAcquired,
        thumbPath: bottleList.thumbPath,
        mutedUntil: bottles.mutedUntil,
      })
      .from(bottleList)
      .innerJoin(bottles, eq(bottles.id, bottleList.id))
      // The same shelf as the web roulette: still owned, and not drunk to empty.
      .where(and(eq(bottleList.ownerId, ownerId), inArray(bottleList.status, ["owned", "open"]), gt(bottleList.fillPct, 0)))
      .orderBy(asc(bottleList.id)),
    db
      .select({
        expressionId: tastingNotes.expressionId,
        categoryId: expressions.categoryId,
        tags: tastingNotes.tags,
        tastedOn: tastingNotes.tastedOn,
        rating: tastingNotes.rating,
      })
      .from(tastingNotes)
      .innerJoin(expressions, eq(expressions.id, tastingNotes.expressionId))
      .where(eq(tastingNotes.ownerId, ownerId)),
    categoryWheels(),
  ]);

  const shelf: ShelfBottle[] = shelfRows.map((r) => ({
    id: r.id,
    expressionId: r.expressionId,
    brand: r.brand,
    name: r.name,
    categoryId: r.categoryId,
    category: r.category,
    sealed: !r.isOpen,
    fillPct: r.fillPct,
    proof: num(r.proof),
    dateAcquired: r.dateAcquired,
    thumbPath: r.thumbPath,
    mutedUntil: r.mutedUntil,
  }));
  const tastings: TastingRow[] = tastingRows.map((r) => ({
    expressionId: r.expressionId,
    categoryId: r.categoryId,
    tags: r.tags,
    tastedOn: r.tastedOn,
    rating: num(r.rating),
  }));

  return {
    today: now,
    bottles: shelf,
    tastings,
    hasWheel: (categoryId) => (wheels.get(categoryId) ?? null) !== null,
    flavorLabel: (key) => findDescriptor(key)?.label ?? fallbackLabel(key),
  };
}

export type MutedBottle = { bottleId: number; brand: string; name: string; category: string; mutedUntil: string };

/** The owner's muted bottles that are still muted, soonest to return first. */
export async function listMutes(ownerId: number): Promise<MutedBottle[]> {
  const rows = await db
    .select({
      bottleId: bottleList.id,
      brand: bottleList.brand,
      name: bottleList.expressionName,
      category: bottleList.category,
      mutedUntil: bottles.mutedUntil,
    })
    .from(bottleList)
    .innerJoin(bottles, eq(bottles.id, bottleList.id))
    .where(and(eq(bottleList.ownerId, ownerId), gt(bottles.mutedUntil, sql`current_date`)))
    .orderBy(asc(bottles.mutedUntil), asc(bottleList.id));
  return rows.map((r) => ({ ...r, mutedUntil: r.mutedUntil! }));
}

/** Sets or clears a bottle's mute. False when the bottle is not the owner's. */
export async function setMute(ownerId: number, bottleId: number, until: string | null): Promise<boolean> {
  const rows = await db
    .update(bottles)
    .set({ mutedUntil: until })
    .where(and(eq(bottles.id, bottleId), eq(bottles.ownerId, ownerId)))
    .returning({ id: bottles.id });
  return rows.length > 0;
}
