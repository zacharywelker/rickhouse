import "server-only";
import { and, asc, desc, eq, getViewSelectedFields, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bottleList } from "@/db/schema";
import type { BottleFilters, SortKey } from "./filters";

/** An open state is recorded three ways by older imports and newer actions. */
export const isOpenFlag = sql`(${bottleList.isOpen} OR ${bottleList.status} = 'open' OR ${bottleList.fillPct} < 100)`;

/** Opened and still on the shelf — killed, sold and traded bottles are history, not open. */
export const isOpenNow = sql`(${isOpenFlag} AND ${bottleList.status} IN ('owned', 'open'))`;
/** Sealed and still on the shelf, using the same reconciled state as open counts. */
export const isSealedNow = sql`(NOT ${isOpenFlag} AND ${bottleList.status} IN ('owned', 'open'))`;

/** On the shelf right now — what "Bottles" counts. Labels are knowledge; Collection is ownership. */
export const isOwnedNow = sql`(${bottleList.status} IN ('owned', 'open'))`;

/** Money actually spent: a wishlist price is a hope, not a purchase. Killed and sold bottles were still paid for. */
export const wasBought = sql`(${bottleList.status} <> 'wishlist')`;

/** Numeric grouping age: entered value, youngest age in a clear statement, then a category minimum. */
export const groupingAge = sql<number | null>`coalesce(
  CASE WHEN ${bottleList.ageYears} IS NOT NULL OR ${bottleList.ageMonths} IS NOT NULL OR ${bottleList.ageDays} IS NOT NULL
    THEN coalesce(${bottleList.ageYears}, 0)::numeric + coalesce(${bottleList.ageMonths}, 0)::numeric / 12 + coalesce(${bottleList.ageDays}, 0)::numeric / 365 END,
  nullif(substring(${bottleList.ageStatement} from '([0-9]{1,3}(\\.[0-9])?)[[:space:]]*(to|[-–—])[[:space:]]*[0-9]{1,3}(\\.[0-9])?[[:space:]]*(years?|yrs?)'), '')::numeric,
  nullif(substring(${bottleList.ageStatement} from '([0-9]{1,3}(\\.[0-9])?)[[:space:]]*(years?|yrs?)'), '')::numeric,
  CASE WHEN nullif(trim(${bottleList.ageStatement}), '') IS NULL OR upper(trim(${bottleList.ageStatement})) = 'NAS' THEN (SELECT CASE
    WHEN (c.slug = 'american-whiskey' OR p.slug = 'american-whiskey') AND e.is_bottled_in_bond THEN 4
    WHEN (c.slug = 'american-whiskey' OR p.slug = 'american-whiskey') AND e.is_straight AND e.is_nas THEN 4
    WHEN (c.slug = 'american-whiskey' OR p.slug = 'american-whiskey') AND e.is_straight THEN 2
    WHEN c.slug IN ('canadian-whisky', 'irish-whiskey', 'scotch') OR p.slug IN ('irish-whiskey', 'scotch') THEN 3
    ELSE NULL END
   FROM expressions e JOIN categories c ON c.id = e.category_id
   LEFT JOIN categories p ON p.id = c.parent_id WHERE e.id = ${bottleList.expressionId}) ELSE NULL END
)`;

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
  age: groupingAge,
  price: sql`${bottleList.pricePaid}`,
  msrp: sql`${bottleList.msrp}`,
  // By percentage, so a $20 premium on a $40 bottle outranks one on a $200 bottle.
  markup: sql`(${bottleList.pricePaid} - ${bottleList.msrp}) / nullif(${bottleList.msrp}, 0)`,
  fill: sql`${bottleList.fillPct}`,
  rating: sql`${bottleList.avgRating}`,
  status: sql`(CASE WHEN ${isOpenNow} THEN 'open' ELSE ${bottleList.status} END)`,
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
  if (filters.statuses.length > 0) {
    clauses.push(
      or(
        ...filters.statuses.map((status) => {
          if (status === "open") return isOpenNow;
          if (status === "owned") return and(eq(bottleList.status, "owned"), isSealedNow)!;
          return eq(bottleList.status, status);
        }),
      )!,
    );
  }

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
  if (filters.ingredientIds.length > 0) {
    clauses.push(sql`EXISTS (
      SELECT 1 FROM expression_ingredients ei
       WHERE ei.expression_id = ${bottleList.expressionId}
         AND ei.ingredient_id IN (${sql.join(filters.ingredientIds.map((id) => sql`${id}`), sql`, `)})
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
  if (filters.open === "closed") clauses.push(isSealedNow);
  if (filters.favorite) clauses.push(eq(bottleList.isFavorite, true));

  if (filters.proof.min !== null) clauses.push(gte(bottleList.proof, String(filters.proof.min)));
  if (filters.proof.max !== null) clauses.push(lte(bottleList.proof, String(filters.proof.max)));
  if (filters.age.min !== null) clauses.push(gte(groupingAge, filters.age.min));
  if (filters.age.max !== null) clauses.push(lte(groupingAge, filters.age.max));
  if (filters.price.min !== null) clauses.push(gte(bottleList.pricePaid, String(filters.price.min)));
  if (filters.price.max !== null) clauses.push(lte(bottleList.pricePaid, String(filters.price.max)));

  if (filters.fill.min !== null) clauses.push(gte(bottleList.fillPct, filters.fill.min));
  if (filters.fill.max !== null) clauses.push(lte(bottleList.fillPct, filters.fill.max));
  if (filters.acquired.from) clauses.push(gte(bottleList.dateAcquired, filters.acquired.from));
  if (filters.acquired.to) clauses.push(lte(bottleList.dateAcquired, filters.acquired.to));
  if (filters.pick) clauses.push(eq(bottleList.isSingleBarrelPick, true));
  if (filters.overMsrp) clauses.push(sql`${bottleList.pricePaid} > ${bottleList.msrp}`);

  // Not in the view, so matched against the base tables like the entity filters above.
  if (filters.acquisitions.length > 0) {
    clauses.push(sql`EXISTS (
      SELECT 1 FROM bottles ab WHERE ab.id = ${bottleList.id}
         AND ab.acquisition IN (${sql.join(filters.acquisitions.map((a) => sql`${a}`), sql`, `)})
    )`);
  }
  if (filters.caskStrength || filters.bottledInBond) {
    clauses.push(sql`EXISTS (
      SELECT 1 FROM expressions fe WHERE fe.id = ${bottleList.expressionId}
         ${filters.caskStrength ? sql`AND fe.is_cask_strength` : sql``}
         ${filters.bottledInBond ? sql`AND fe.is_bottled_in_bond` : sql``}
    )`);
  }

  return and(...clauses);
}

/*
 * Every column except the two search ones. They are only ever matched
 * against, and a `select *` would ship the whole corpus — lexemes and the
 * plain text of every tasting note — to the browser for each of 25 rows.
 */
const { search: _search, searchText: _searchText, ...GRID_COLUMNS } = getViewSelectedFields(bottleList);
const GIN_COLUMNS = {
  ginStyle: sql<string | null>`(SELECT e.gin_style FROM expressions e JOIN categories c ON c.id = e.category_id WHERE e.id = bottle_list.expression_id AND c.field_group = 'gin')`,
  ginAged: sql<boolean | null>`(SELECT e.is_aged_gin FROM expressions e JOIN categories c ON c.id = e.category_id WHERE e.id = bottle_list.expression_id AND c.field_group = 'gin')`,
  ginIsNas: sql<boolean | null>`(SELECT coalesce(b.gin_is_nas, e.is_nas) FROM bottles b JOIN expressions e ON e.id = b.expression_id JOIN categories c ON c.id = e.category_id WHERE b.id = bottle_list.id AND c.field_group = 'gin')`,
};
const WHISKEY_COLUMNS = {
  whiskeyKind: sql<"american" | "canadian" | "irish" | "scotch" | null>`(SELECT CASE
    WHEN c.slug = 'american-whiskey' OR p.slug = 'american-whiskey' THEN 'american'
    WHEN c.slug = 'canadian-whisky' THEN 'canadian'
    WHEN c.slug = 'irish-whiskey' OR p.slug = 'irish-whiskey' THEN 'irish'
    WHEN c.slug = 'scotch' OR p.slug = 'scotch' THEN 'scotch'
    ELSE NULL END FROM categories c LEFT JOIN categories p ON p.id = c.parent_id WHERE c.id = ${bottleList.categoryId})`,
  isStraight: sql<boolean>`(SELECT is_straight FROM expressions WHERE id = ${bottleList.expressionId})`,
  isNas: sql<boolean>`(SELECT is_nas FROM expressions WHERE id = ${bottleList.expressionId})`,
  isBottledInBond: sql<boolean>`(SELECT is_bottled_in_bond FROM expressions WHERE id = ${bottleList.expressionId})`,
};

const SPIRIT_COLUMNS = {
  spiritFact: sql<string | null>`(SELECT CASE
    WHEN c.field_group = 'amaro' THEN e.amaro_style
    WHEN c.field_group = 'liqueur' OR c.slug = 'flavored-vodka' THEN
      (SELECT string_agg(i.name::text, ', ' ORDER BY ei.position) FROM expression_ingredients ei
        JOIN ingredients i ON i.id = ei.ingredient_id WHERE ei.expression_id = e.id AND i.kind = 'flavor')
    WHEN c.field_group = 'vodka' THEN
      (SELECT string_agg(i.name::text, ', ' ORDER BY ei.position) FROM expression_ingredients ei
        JOIN ingredients i ON i.id = ei.ingredient_id WHERE ei.expression_id = e.id AND i.kind = 'vodka_base')
    ELSE NULL END
    FROM expressions e JOIN categories c ON c.id = e.category_id WHERE e.id = ${bottleList.expressionId})`,
};

export type GridRow = Omit<typeof bottleList.$inferSelect, "search" | "searchText"> & { ginStyle?: string | null; ginAged?: boolean | null; ginIsNas?: boolean | null; whiskeyKind?: "american" | "canadian" | "irish" | "scotch" | null; isStraight?: boolean; isNas?: boolean; isBottledInBond?: boolean; spiritFact?: string | null };

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
    .select({ ...GRID_COLUMNS, ...GIN_COLUMNS, ...WHISKEY_COLUMNS, ...SPIRIT_COLUMNS })
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
      count: sql<number>`count(*) filter (where ${isOwnedNow})::int`,
      spend: sql<string>`coalesce(sum(${bottleList.pricePaid}) filter (where ${wasBought}), 0)::text`,
      // Only where a price was actually recorded, so the comparison is like
      // for like rather than counting gifts as a saving.
      msrp: sql<string>`coalesce(sum(${bottleList.msrp}) filter (where ${bottleList.pricePaid} is not null and ${wasBought}), 0)::text`,
      open: sql<number>`count(*) filter (where ${isOpenNow})::int`,
      avgProof: sql<string | null>`round(avg(${bottleList.proof}), 1)::text`,
      avgRating: sql<string | null>`round(avg(${bottleList.avgRating}), 1)::text`,
    })
    .from(bottleList)
    .where(where);
  return row ?? { count: 0, spend: "0", msrp: "0", open: 0, avgProof: null, avgRating: null };
}
