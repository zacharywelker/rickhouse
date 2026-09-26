import "server-only";
import { and, asc, asc as sqlAsc, desc, desc as sqlDesc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { describeMashbill } from "@/lib/mashbills";
import {
  bottleImages,
  bottles,
  brands,
  categories,
  distilleries,
  expressionDistilleries,
  expressionFinishes,
  expressionMashbills,
  expressions,
  finishes,
  mashbillGrains,
  mashbills,
  stores,
  tastingNotes,
  type FieldGroup,
} from "@/db/schema";
import type { LabelFilters } from "@/lib/expressions/filters";
import type { LinkedRow } from "@/components/expressions/ordered-picker";

export type LinkedEntity = { id: number; name: string; slug: string | null; amount: string | null };

/**
 * A mashbill carries its recipe, and on a blend, whose recipe it is — "78%
 * Corn" means nothing across three distilleries without that. `distilleryId`
 * is the raw link (only ever set when the label has more than one
 * distillery), for the edit form to preselect; `attribution` is it resolved
 * to a name for display, including the automatic case where the label has
 * exactly one distillery.
 */
export type LinkedMashbill = LinkedEntity & {
  recipe: string;
  distilleryId?: number | null;
  attribution?: string;
  attributionSlug?: string | null;
};

export async function expressionLinks(expressionId: number): Promise<{
  distilleries: LinkedEntity[];
  mashbills: LinkedMashbill[];
  finishes: LinkedEntity[];
}> {
  const [d, m, f] = await Promise.all([
    db
      .select({
        id: distilleries.id,
        name: distilleries.name,
        slug: distilleries.slug,
        amount: expressionDistilleries.sharePct,
      })
      .from(expressionDistilleries)
      .innerJoin(distilleries, eq(expressionDistilleries.distilleryId, distilleries.id))
      .where(eq(expressionDistilleries.expressionId, expressionId))
      .orderBy(asc(expressionDistilleries.position)),
    db
      .select({
        id: mashbills.id,
        name: mashbills.name,
        amount: expressionMashbills.sharePct,
        // Which distillery's recipe this is, as picked on this label — a
        // mashbill has no distillery of its own (issue #13). Surfaced on a
        // blend, where "78% corn" means nothing without knowing whose it is
        // (SPEC M7).
        distilleryId: expressionMashbills.distilleryId,
        distillery: distilleries.name,
        distillerySlug: distilleries.slug,
        recipe: sql<string | null>`(
          select string_agg(g.grain || ':' || g.percent, '|' order by g.position)
            from ${mashbillGrains} g where g.mashbill_id = ${mashbills.id}
        )`,
      })
      .from(expressionMashbills)
      .innerJoin(mashbills, eq(expressionMashbills.mashbillId, mashbills.id))
      .leftJoin(distilleries, eq(expressionMashbills.distilleryId, distilleries.id))
      .where(eq(expressionMashbills.expressionId, expressionId))
      .orderBy(asc(expressionMashbills.position)),
    db
      .select({
        id: finishes.id,
        name: finishes.name,
        slug: finishes.slug,
        amount: sql<string | null>`${expressionFinishes.months}::text`,
      })
      .from(expressionFinishes)
      .innerJoin(finishes, eq(expressionFinishes.finishId, finishes.id))
      .where(eq(expressionFinishes.expressionId, expressionId))
      .orderBy(asc(expressionFinishes.position)),
  ]);

  // On a blend, whose recipe it is matters and has to be picked; on a
  // single-distillery label there is only one possible answer, so it is
  // automatic (issue #13) rather than something to record per mashbill.
  const solo = d.length === 1 ? d[0]! : null;
  const blended = d.length > 1;

  return {
    distilleries: d,
    mashbills: m.map((row) => ({
      id: row.id,
      name: row.name ?? describeRecipe(row.recipe),
      slug: null,
      amount: row.amount,
      recipe: describeRecipe(row.recipe),
      distilleryId: solo ? solo.id : blended ? row.distilleryId : null,
      ...(solo
        ? { attribution: solo.name, attributionSlug: solo.slug }
        : blended && row.distillery
          ? { attribution: row.distillery, attributionSlug: row.distillerySlug }
          : {}),
    })),
    finishes: f,
  };
}

/** Unpacks the "Corn:70|Wheat:16" aggregate the queries above build. */
export function describeRecipe(packed: string | null): string {
  const grains = (packed ?? "")
    .split("|")
    .filter(Boolean)
    .map((part) => {
      const [grain = "", percent = "0"] = part.split(":");
      return { grain, percent };
    });
  return describeMashbill(grains) || "No recipe recorded";
}

export async function getExpression(id: number) {
  const [row] = await db
    .select({
      expression: expressions,
      brand: { id: brands.id, name: brands.name, slug: brands.slug },
      category: { id: categories.id, name: categories.name, slug: categories.slug, fieldGroup: categories.fieldGroup },
    })
    .from(expressions)
    .innerJoin(brands, eq(expressions.brandId, brands.id))
    .innerJoin(categories, eq(expressions.categoryId, categories.id))
    .where(eq(expressions.id, id))
    .limit(1);
  return row ?? null;
}

export { LABEL_SORTS, parseLabelSort, type LabelSort } from "@/lib/expressions/filters";

/**
 * The labels list: filtered, sorted and paged in Postgres like the bottle
 * grid is (src/lib/bottles/grid.ts). With hundreds of labels, an unpaged
 * table shipping every row every load stops scaling long before the row
 * count actually gets large.
 *
 * Batch and the single-barrel flags moved to the bottle in M7, so a label no
 * longer knows whether it is a pick — its bottles do. "Picks" counts them,
 * which is the question worth answering here anyway: how many of these did I
 * buy as store picks.
 */
export async function queryExpressions(filters: LabelFilters): Promise<{
  rows: ExpressionRow[];
  total: number;
  pageCount: number;
  page: number;
}> {
  const bottleCount = sql<number>`(select count(*)::int from ${bottles} where ${bottles.expressionId} = ${expressions.id})`;
  const pickCount = sql<number>`(select count(*)::int from ${bottles} where ${bottles.expressionId} = ${expressions.id} and (${bottles.isSingleBarrel} or ${bottles.isSingleBarrelPick}))`;

  const columns = {
    brand: sql`${brands.name}`,
    name: sql`${expressions.name}`,
    category: sql`${categories.name}`,
    proof: sql`${expressions.proof}`,
    age: sql`${expressions.ageYears}`,
    msrp: sql`${expressions.msrp}`,
    bottles: bottleCount,
  } as const;

  const direction = filters.desc ? sqlDesc(columns[filters.sort]) : sqlAsc(columns[filters.sort]);

  const clauses = [];
  if (filters.q) {
    const match = or(ilike(expressions.name, `%${filters.q}%`), ilike(brands.name, `%${filters.q}%`));
    if (match) clauses.push(match);
  }
  if (filters.brandIds.length > 0) clauses.push(inArray(expressions.brandId, filters.brandIds));
  if (filters.categoryIds.length > 0) clauses.push(inArray(expressions.categoryId, filters.categoryIds));
  const where = clauses.length === 0 ? undefined : and(...clauses);

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(expressions)
    .innerJoin(brands, eq(expressions.brandId, brands.id))
    .innerJoin(categories, eq(expressions.categoryId, categories.id))
    .where(where);

  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, pageCount);

  const rows = await db
    .select({
      id: expressions.id,
      name: expressions.name,
      slug: expressions.slug,
      description: expressions.description,
      brand: brands.name,
      brandId: expressions.brandId,
      category: categories.name,
      categoryId: expressions.categoryId,
      fieldGroup: categories.fieldGroup,
      proof: expressions.proof,
      abv: expressions.abv,
      ageStatement: expressions.ageStatement,
      ageYears: expressions.ageYears,
      ageMonths: expressions.ageMonths,
      ageDays: expressions.ageDays,
      isCaskStrength: expressions.isCaskStrength,
      isStraight: expressions.isStraight,
      isNas: expressions.isNas,
      isBottledInBond: expressions.isBottledInBond,
      entryProof: expressions.entryProof,
      isChillFiltered: expressions.isChillFiltered,
      colorAdded: expressions.colorAdded,
      charLevel: expressions.charLevel,
      stillType: expressions.stillType,
      estate: expressions.estate,
      marque: expressions.marque,
      molassesOrCane: expressions.molassesOrCane,
      esterGl: expressions.esterGl,
      sugarGPerL: expressions.sugarGPerL,
      tropicalYears: expressions.tropicalYears,
      continentalYears: expressions.continentalYears,
      isSolera: expressions.isSolera,
      soleraRange: expressions.soleraRange,
      agaveType: expressions.agaveType,
      agaveRegion: expressions.agaveRegion,
      cookingMethod: expressions.cookingMethod,
      extraction: expressions.extraction,
      isAdditiveFree: expressions.isAdditiveFree,
      msrp: expressions.msrp,
      sizeMl: expressions.sizeMl,
      upc: expressions.upc,
      labelNotes: expressions.labelNotes,
      bottleCount,
      pickCount,
    })
    .from(expressions)
    .innerJoin(brands, eq(expressions.brandId, brands.id))
    .innerJoin(categories, eq(expressions.categoryId, categories.id))
    .where(where)
    // NULLS LAST both ways, and a stable tiebreak so paging never reshuffles.
    .orderBy(sql`${direction} NULLS LAST`, asc(brands.name), asc(expressions.name))
    .limit(filters.pageSize)
    .offset((page - 1) * filters.pageSize);

  const links = await linksFor(rows.map((row) => row.id));
  return { rows: rows.map((row) => ({ ...row, links: links.get(row.id)! })), total, pageCount, page };
}

export type LabelLinks = { distilleries: LinkedRow[]; mashbills: LinkedRow[]; finishes: LinkedRow[] };

/**
 * The ordered links for a page of labels, in three queries rather than three
 * per row — shaped exactly as the form's pickers take them, so the unlocked
 * grid can edit them in place.
 */
async function linksFor(ids: number[]): Promise<Map<number, LabelLinks>> {
  const byId = new Map<number, LabelLinks>(ids.map((id) => [id, { distilleries: [], mashbills: [], finishes: [] }]));
  if (ids.length === 0) return byId;

  const amount = (value: string | null) => (value === null ? "" : String(Number(value)));
  const [d, m, f] = await Promise.all([
    db
      .select({
        expressionId: expressionDistilleries.expressionId,
        id: distilleries.id,
        name: distilleries.name,
        amount: expressionDistilleries.sharePct,
      })
      .from(expressionDistilleries)
      .innerJoin(distilleries, eq(expressionDistilleries.distilleryId, distilleries.id))
      .where(inArray(expressionDistilleries.expressionId, ids))
      .orderBy(asc(expressionDistilleries.position)),
    db
      .select({
        expressionId: expressionMashbills.expressionId,
        id: mashbills.id,
        name: mashbills.name,
        amount: expressionMashbills.sharePct,
        distilleryId: expressionMashbills.distilleryId,
        recipe: sql<string | null>`(
          select string_agg(g.grain || ':' || g.percent, '|' order by g.position)
            from ${mashbillGrains} g where g.mashbill_id = ${mashbills.id}
        )`,
      })
      .from(expressionMashbills)
      .innerJoin(mashbills, eq(expressionMashbills.mashbillId, mashbills.id))
      .where(inArray(expressionMashbills.expressionId, ids))
      .orderBy(asc(expressionMashbills.position)),
    db
      .select({
        expressionId: expressionFinishes.expressionId,
        id: finishes.id,
        name: finishes.name,
        months: expressionFinishes.months,
      })
      .from(expressionFinishes)
      .innerJoin(finishes, eq(expressionFinishes.finishId, finishes.id))
      .where(inArray(expressionFinishes.expressionId, ids))
      .orderBy(asc(expressionFinishes.position)),
  ]);

  for (const row of d) {
    byId.get(row.expressionId)?.distilleries.push({ id: row.id, label: row.name, amount: amount(row.amount) });
  }
  for (const row of m) {
    byId.get(row.expressionId)?.mashbills.push({
      id: row.id,
      label: row.name ?? describeRecipe(row.recipe),
      amount: amount(row.amount),
      distilleryId: row.distilleryId,
    });
  }
  for (const row of f) {
    byId.get(row.expressionId)?.finishes.push({
      id: row.id,
      label: row.name,
      amount: row.months === null ? "" : String(row.months),
    });
  }
  return byId;
}

export type ExpressionRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  brand: string;
  brandId: number;
  category: string;
  categoryId: number;
  fieldGroup: FieldGroup;
  proof: string | null;
  abv: string | null;
  ageStatement: string | null;
  ageYears: string | null;
  ageMonths: number | null;
  ageDays: number | null;
  isCaskStrength: boolean;
  isStraight: boolean;
  isNas: boolean;
  isBottledInBond: boolean;
  entryProof: string | null;
  isChillFiltered: boolean | null;
  colorAdded: boolean | null;
  charLevel: string | null;
  stillType: string | null;
  estate: string | null;
  marque: string | null;
  molassesOrCane: string | null;
  esterGl: string | null;
  sugarGPerL: string | null;
  tropicalYears: string | null;
  continentalYears: string | null;
  isSolera: boolean | null;
  soleraRange: string | null;
  agaveType: string | null;
  agaveRegion: string | null;
  cookingMethod: string | null;
  extraction: string | null;
  isAdditiveFree: boolean | null;
  msrp: string | null;
  sizeMl: number;
  upc: string | null;
  labelNotes: string | null;
  bottleCount: number;
  pickCount: number;
  links: LabelLinks;
};

/** Options for the bottle form's expression picker. */
export async function expressionOptions() {
  const rows = await db
    .select({
      value: expressions.id,
      name: expressions.name,
      brand: brands.name,
      proof: expressions.proof,
    })
    .from(expressions)
    .innerJoin(brands, eq(expressions.brandId, brands.id))
    .orderBy(asc(brands.name), asc(expressions.name));
  return rows.map((r) => ({
    value: r.value,
    label: `${r.brand} ${r.name}`,
    ...(r.proof ? { hint: `${Number(r.proof)} proof` } : {}),
  }));
}

/** categoryId -> field group, so a grid can tell which sections apply to a row without a round trip. */
export async function categoryFieldGroups(): Promise<Record<number, FieldGroup>> {
  const rows = await db.select({ id: categories.id, fieldGroup: categories.fieldGroup }).from(categories);
  return Object.fromEntries(rows.map((row) => [row.id, row.fieldGroup]));
}

export async function fieldGroupForCategory(categoryId: number): Promise<FieldGroup> {
  const [row] = await db
    .select({ fieldGroup: categories.fieldGroup })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  return row?.fieldGroup ?? "other";
}

export async function getBottle(id: number) {
  const [row] = await db
    .select({
      bottle: bottles,
      expression: expressions,
      brand: { id: brands.id, name: brands.name, slug: brands.slug },
      category: { id: categories.id, name: categories.name, slug: categories.slug, fieldGroup: categories.fieldGroup },
      store: { id: stores.id, name: stores.name, slug: stores.slug, location: stores.location },
    })
    .from(bottles)
    .innerJoin(expressions, eq(bottles.expressionId, expressions.id))
    .innerJoin(brands, eq(expressions.brandId, brands.id))
    .innerJoin(categories, eq(expressions.categoryId, categories.id))
    .leftJoin(stores, eq(bottles.storeId, stores.id))
    .where(eq(bottles.id, id))
    .limit(1);
  return row ?? null;
}

export async function bottleImagesFor(bottleId: number) {
  return db
    .select()
    .from(bottleImages)
    .where(eq(bottleImages.bottleId, bottleId))
    .orderBy(desc(bottleImages.isPrimary), asc(bottleImages.sortOrder), asc(bottleImages.id));
}

export async function tastingNotesFor(bottleId: number) {
  return db
    .select()
    .from(tastingNotes)
    .where(eq(tastingNotes.bottleId, bottleId))
    .orderBy(desc(tastingNotes.tastedOn), desc(tastingNotes.id));
}
