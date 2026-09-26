import "server-only";
import { and, asc, desc, eq, getViewSelectedFields, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bottleList } from "@/db/schema";
import type { BottleFilters, SortKey } from "./filters";

/** Opened and still on the shelf — killed, sold and traded bottles are history, not open. */
export const isOpenNow = sql`(${bottleList.isOpen} AND ${bottleList.status} IN ('owned', 'open'))`;

/**
 * The grid query: filtering, sorting and pagination, all in Postgres.
 *
 * The load-bearing decision is that entity filters match through the join
 * tables rather than against the view's flattened name strings. Filtering by
 * Bardstown has to return every blend it contributed to, not only the bottles
 * where it happens to be the whole story — which a LIKE over
 * "Bardstown, Tennessee Distilling, Finger Lakes" would get right by accident
 * and a LIKE over "Finger Lakes Distilling" would get wrong.
 */

const SORT_COLUMNS: Record<SortKey, SQL | ReturnType<typeof sql>> = {
  acquired: sql`${bottleList.dateAcquired}`,
  brand: sql`${bottleList.brand}`,
  expression: sql`${bottleList.expressionName}`,
  category: sql`${bottleList.category}`,
  proof: sql`${bottleList.proof}`,
  age: sql`${bottleList.ageYears}`,
  price: sql`${bottleList.pricePaid}`,
  msrp: sql`${bottleList.msrp}`,
  fill: sql`${bottleList.fillPct}`,
  rating: sql`${bottleList.avgRating}`,
  status: sql`${bottleList.status}`,
};

/**
 * Categories nest, so filtering by Whiskey has to include Bourbon. Walks down
 * from the chosen ids rather than matching them exactly.
 */
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

/**
 * Always the signed-in account's bottles first; every filter narrows within
 * them, so an id from someone else's catalog just matches nothing.
 */
function buildWhere(filters: BottleFilters, ownerId: number): SQL | undefined {
  const clauses: SQL[] = [eq(bottleList.ownerId, ownerId)];

  if (filters.q) {
    /*
     * Full text OR substring (SPEC M6).
     *
     * websearch_to_tsquery gives quoted phrases, OR and -exclusion for free,
     * and stems — so "barrels" finds "barrel". What it cannot do is prefixes:
     * nobody typing "goose" wants zero results on the way to "gooseberry". So
     * a substring arm runs beside it over search_text, which is the identical
     * corpus as plain text — the two can never disagree about which fields
     * are searchable.
     *
     * Order is untouched on purpose. The grid's sort is the user's, and
     * silently switching to relevance because a search box has text in it is
     * the kind of helpfulness that loses people their place.
     */
    const match = or(
      sql`${bottleList.search} @@ websearch_to_tsquery('english', ${filters.q})`,
      ilike(bottleList.searchText, `%${filters.q}%`),
    );
    if (match) clauses.push(match);
  }

  if (filters.categoryIds.length > 0) clauses.push(categorySubtree(filters.categoryIds));
  if (filters.brandIds.length > 0) clauses.push(inArray(bottleList.brandId, filters.brandIds));
  if (filters.storeIds.length > 0) clauses.push(inArray(bottleList.storeId, filters.storeIds));
  if (filters.statuses.length > 0) clauses.push(inArray(bottleList.status, filters.statuses));

  // Through the join tables, so blends match on every contributor.
  if (filters.distilleryIds.length > 0) {
    clauses.push(sql`EXISTS (
      SELECT 1 FROM expression_distilleries ed
       WHERE ed.expression_id = ${bottleList.expressionId}
         AND ed.distillery_id IN (${sql.join(filters.distilleryIds.map((id) => sql`${id}`), sql`, `)})
    )`);
  }
  if (filters.mashbillIds.length > 0) {
    clauses.push(sql`EXISTS (
      SELECT 1 FROM expression_mashbills em
       WHERE em.expression_id = ${bottleList.expressionId}
         AND em.mashbill_id IN (${sql.join(filters.mashbillIds.map((id) => sql`${id}`), sql`, `)})
    )`);
  }
  if (filters.finishIds.length > 0) {
    clauses.push(sql`EXISTS (
      SELECT 1 FROM expression_finishes ef
       WHERE ef.expression_id = ${bottleList.expressionId}
         AND ef.finish_id IN (${sql.join(filters.finishIds.map((id) => sql`${id}`), sql`, `)})
    )`);
  }
  if (filters.tagIds.length > 0) {
    clauses.push(sql`EXISTS (
      SELECT 1 FROM bottle_tags bt
       WHERE bt.bottle_id = ${bottleList.id}
         AND bt.tag_id IN (${sql.join(filters.tagIds.map((id) => sql`${id}`), sql`, `)})
    )`);
  }

  // Open means opened *and still on the shelf*: a killed bottle keeps its
  // is_open flag as history, but it is not open "right now".
  if (filters.open === "open") clauses.push(isOpenNow);
  if (filters.open === "closed") clauses.push(eq(bottleList.isOpen, false));
  if (filters.favorite) clauses.push(eq(bottleList.isFavorite, true));

  if (filters.proof.min !== null) clauses.push(gte(bottleList.proof, String(filters.proof.min)));
  if (filters.proof.max !== null) clauses.push(lte(bottleList.proof, String(filters.proof.max)));
  if (filters.age.min !== null) clauses.push(gte(bottleList.ageYears, String(filters.age.min)));
  if (filters.age.max !== null) clauses.push(lte(bottleList.ageYears, String(filters.age.max)));
  if (filters.price.min !== null) clauses.push(gte(bottleList.pricePaid, String(filters.price.min)));
  if (filters.price.max !== null) clauses.push(lte(bottleList.pricePaid, String(filters.price.max)));

  return and(...clauses);
}

/*
 * Every column except the two search ones. They are only ever matched
 * against, and a `select *` would ship the whole corpus — lexemes and the
 * plain text of every tasting note — to the browser for each of 25 rows.
 */
const { search: _search, searchText: _searchText, ...GRID_COLUMNS } = getViewSelectedFields(bottleList);

export type GridRow = Omit<typeof bottleList.$inferSelect, "search" | "searchText">;

export async function queryBottles(filters: BottleFilters, ownerId: number): Promise<{
  rows: GridRow[];
  total: number;
  pageCount: number;
  page: number;
}> {
  const where = buildWhere(filters, ownerId);
  const column = SORT_COLUMNS[filters.sort];
  // NULLS LAST both ways: a bottle with no price should not head the list.
  const direction = filters.desc ? desc(column) : asc(column);

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(bottleList)
    .where(where);

  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, pageCount);

  const rows = await db
    .select(GRID_COLUMNS)
    .from(bottleList)
    .where(where)
    .orderBy(sql`${direction} NULLS LAST`, desc(bottleList.id))
    .limit(filters.pageSize)
    .offset((page - 1) * filters.pageSize);

  return { rows, total, pageCount, page };
}

export type BottleSummary = {
  count: number;
  spend: string;
  msrp: string;
  open: number;
  avgProof: string | null;
  avgRating: string | null;
};

/** Totals for the summary strip, over the filtered set rather than the page. */
export async function summariseBottles(filters: BottleFilters, ownerId: number): Promise<BottleSummary> {
  const where = buildWhere(filters, ownerId);
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      spend: sql<string>`coalesce(sum(${bottleList.pricePaid}), 0)::text`,
      // Only where a price was actually recorded, so the comparison is like
      // for like rather than counting gifts as a saving.
      msrp: sql<string>`coalesce(sum(${bottleList.msrp}) filter (where ${bottleList.pricePaid} is not null), 0)::text`,
      open: sql<number>`count(*) filter (where ${isOpenNow})::int`,
      avgProof: sql<string | null>`round(avg(${bottleList.proof}), 1)::text`,
      avgRating: sql<string | null>`round(avg(${bottleList.avgRating}), 1)::text`,
    })
    .from(bottleList)
    .where(where);
  return row ?? { count: 0, spend: "0", msrp: "0", open: 0, avgProof: null, avgRating: null };
}
