import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bottles, stores } from "@/db/schema";
import { DEFAULT_STATUSES } from "@/lib/bottles/filters";
import { parseLabelFilters } from "@/lib/expressions/filters";
import { categoryKindsById, queryExpressions } from "@/lib/expressions/queries";
import type { SheetBottle, SheetLabel } from "./sheet";

/** More rows than anyone owns: the editor is one scroll, not pages. */
const EVERYTHING = 100_000;

/**
 * What the bulk editor shows, for one account: every label (the same rows, with the same links, as the Labels table),
 * and the bottles the Collection lists by default (on the shelf: owned and open). The bottles come raw, from the
 * bottles table rather than the Collection's view, because that view blends a label's value with a bottle's own and
 * the sheet has to keep them apart. Ordering is the sheet's business (`sheetRows`).
 */
export async function loadSheet(ownerId: number): Promise<{
  labels: SheetLabel[];
  bottles: SheetBottle[];
  kinds: Awaited<ReturnType<typeof categoryKindsById>>;
}> {
  const [{ rows: labels }, bottleRows, kinds] = await Promise.all([
    queryExpressions({ ...parseLabelFilters({}), pageSize: EVERYTHING }, ownerId),
    db
      .select({
        id: bottles.id,
        expressionId: bottles.expressionId,
        status: bottles.status,
        pricePaid: bottles.pricePaid,
        storeName: stores.name,
        dateAcquired: bottles.dateAcquired,
        isSingleBarrel: bottles.isSingleBarrel,
        isSingleBarrelPick: bottles.isSingleBarrelPick,
        pickName: bottles.pickName,
        releaseYear: bottles.releaseYear,
        location: bottles.location,
        notes: bottles.notes,
        sizeMl: bottles.sizeMl,
        proof: bottles.proof,
        ageYears: bottles.ageYears,
        ageMonths: bottles.ageMonths,
        ageDays: bottles.ageDays,
        ageStatement: bottles.ageStatement,
      })
      .from(bottles)
      .leftJoin(stores, eq(stores.id, bottles.storeId))
      .where(and(eq(bottles.ownerId, ownerId), inArray(bottles.status, DEFAULT_STATUSES)))
      .orderBy(asc(bottles.id)),
    categoryKindsById(),
  ]);
  return { labels, bottles: bottleRows, kinds };
}
