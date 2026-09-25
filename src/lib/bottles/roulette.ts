import "server-only";
import { and, eq, getViewSelectedFields, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bottleList } from "@/db/schema";
import type { GridRow } from "./grid";

/**
 * Spin the Bottle (issue #18): pick one random bottle you actually still
 * have, optionally narrowed by proof, style, or finish. Deliberately a
 * trimmed-down cousin of `queryBottles` rather than a reuse of it — the
 * roulette only ever needs three of the grid's dozen filters and returns a
 * single row, so it picks that row in Postgres with `ORDER BY random()`
 * instead of paging through a filtered list in Node.
 */

export type RouletteFilters = {
  categoryIds: number[];
  finishIds: number[];
  proof: { min: number | null; max: number | null };
};

export const EMPTY_ROULETTE_FILTERS: RouletteFilters = {
  categoryIds: [],
  finishIds: [],
  proof: { min: null, max: null },
};

/** Same recursive walk as the grid's category filter: a style includes its children. */
function categorySubtree(ids: number[]): SQL {
  return sql`${bottleList.categoryId} IN (
    WITH RECURSIVE subtree AS (
      SELECT id FROM categories WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      UNION ALL
      SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
    )
    SELECT id FROM subtree
  )`;
}

function buildWhere(filters: RouletteFilters, ownerId: number): SQL {
  const clauses: SQL[] = [
    eq(bottleList.ownerId, ownerId),
    // Only bottles still on the shelf — a wishlist entry or a bottle you
    // killed, sold, or traded away isn't something you can pour tonight.
    inArray(bottleList.status, ["owned", "open"]),
  ];

  if (filters.categoryIds.length > 0) clauses.push(categorySubtree(filters.categoryIds));
  if (filters.finishIds.length > 0) {
    clauses.push(sql`EXISTS (
      SELECT 1 FROM expression_finishes ef
       WHERE ef.expression_id = ${bottleList.expressionId}
         AND ef.finish_id IN (${sql.join(filters.finishIds.map((id) => sql`${id}`), sql`, `)})
    )`);
  }
  if (filters.proof.min !== null) clauses.push(gte(bottleList.proof, String(filters.proof.min)));
  if (filters.proof.max !== null) clauses.push(lte(bottleList.proof, String(filters.proof.max)));

  return and(...clauses)!;
}

const { search: _search, searchText: _searchText, ...ROULETTE_COLUMNS } = getViewSelectedFields(bottleList);

export async function spinBottle(filters: RouletteFilters, ownerId: number): Promise<GridRow | null> {
  const [row] = await db
    .select(ROULETTE_COLUMNS)
    .from(bottleList)
    .where(buildWhere(filters, ownerId))
    .orderBy(sql`random()`)
    .limit(1);
  return row ?? null;
}
