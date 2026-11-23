import "server-only";
import { and, asc, count, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { bottles, brands, categories, expressionColas, expressions } from "@/db/schema";
import { listDismissed } from "./dismissals";

/** What "Not on TTB" is filed under in the decisions table; the key is the label's id. */
export const TTB_SCOPE = "ttb";

export type TtbRow = { expressionId: number; name: string; brandName: string; meta: string };

/** The ids the owner marked "Not on TTB". */
async function dismissedIds(ownerId: number): Promise<number[]> {
  return [...(await listDismissed(ownerId, TTB_SCOPE))].map(Number).filter((id) => Number.isSafeInteger(id));
}

/**
 * The owner's labels with no approval attached and not marked "Not on TTB". An approval whose lookup failed is still
 * attached (its row exists), so it is not listed. A left join to the approvals, keeping the rows with no match.
 */
function queue(ownerId: number, skip: number[]) {
  return and(eq(expressions.ownerId, ownerId), isNull(expressionColas.id), skip.length > 0 ? notInArray(expressions.id, skip) : undefined);
}

export async function countLabelsWithoutTtb(ownerId: number): Promise<number> {
  const skip = await dismissedIds(ownerId);
  const [row] = await db
    .select({ n: count() })
    .from(expressions)
    .leftJoin(expressionColas, eq(expressionColas.expressionId, expressions.id))
    .where(queue(ownerId, skip));
  return row?.n ?? 0;
}

export async function listLabelsWithoutTtb(ownerId: number, offset: number, limit: number): Promise<TtbRow[]> {
  const skip = await dismissedIds(ownerId);
  const rows = await db
    .select({ id: expressions.id, brand: brands.name, name: expressions.name, category: categories.name })
    .from(expressions)
    .innerJoin(brands, eq(expressions.brandId, brands.id))
    .innerJoin(categories, eq(expressions.categoryId, categories.id))
    .leftJoin(expressionColas, eq(expressionColas.expressionId, expressions.id))
    .where(queue(ownerId, skip))
    .orderBy(asc(brands.name), asc(expressions.name), asc(expressions.id))
    .offset(offset)
    .limit(limit);
  if (rows.length === 0) return [];
  // Bottle counts by one grouped query for just this page, not a subquery per row.
  const counts = new Map(
    (
      await db
        .select({ id: bottles.expressionId, n: count() })
        .from(bottles)
        .where(and(eq(bottles.ownerId, ownerId), inArray(bottles.expressionId, rows.map((row) => row.id))))
        .groupBy(bottles.expressionId)
    ).map((row) => [row.id, row.n]),
  );
  return rows.map((row) => {
    const bottleCount = counts.get(row.id) ?? 0;
    return {
      expressionId: row.id,
      name: `${row.brand} ${row.name}`,
      brandName: row.brand,
      meta: `${row.category} · ${bottleCount} ${bottleCount === 1 ? "bottle" : "bottles"}`,
    };
  });
}

export async function labelBelongsTo(ownerId: number, expressionId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: expressions.id })
    .from(expressions)
    .where(and(eq(expressions.id, expressionId), eq(expressions.ownerId, ownerId)))
    .limit(1);
  return row !== undefined;
}
