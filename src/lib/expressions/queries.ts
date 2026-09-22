import "server-only";
import { asc, asc as sqlAsc, desc, desc as sqlDesc, eq, sql } from "drizzle-orm";
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

export type LinkedEntity = { id: number; name: string; slug: string | null; amount: string | null };

/**
 * A mashbill carries its recipe, and on a blend, whose recipe it is — "78%
 * Corn" means nothing across three distilleries without that.
 */
export type LinkedMashbill = LinkedEntity & {
  recipe: string;
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
        // Which distillery's recipe this is. Surfaced on a blend, where "78%
        // corn" means nothing without knowing whose 78% corn (SPEC M7).
        distillery: distilleries.name,
        distillerySlug: distilleries.slug,
        recipe: sql<string | null>`(
          select string_agg(g.grain || ':' || g.percent, '|' order by g.position)
            from ${mashbillGrains} g where g.mashbill_id = ${mashbills.id}
        )`,
      })
      .from(expressionMashbills)
      .innerJoin(mashbills, eq(expressionMashbills.mashbillId, mashbills.id))
      .leftJoin(distilleries, eq(mashbills.distilleryId, distilleries.id))
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

  // On a blend, whose recipe it is matters; on a single-distillery label it is
  // noise, because there is only one answer.
  const blended = d.length > 1;

  return {
    distilleries: d,
    mashbills: m.map((row) => ({
      id: row.id,
      name: row.name ?? describeRecipe(row.recipe),
      slug: null,
      amount: row.amount,
      recipe: describeRecipe(row.recipe),
      ...(blended && row.distillery
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

/** Sortable columns on the labels list (SPEC M8). */
export const LABEL_SORTS = ["brand", "name", "category", "proof", "age", "msrp", "bottles"] as const;
export type LabelSort = (typeof LABEL_SORTS)[number];

export function parseLabelSort(raw: string | null | undefined): LabelSort {
  return (LABEL_SORTS as readonly string[]).includes(raw ?? "") ? (raw as LabelSort) : "brand";
}

/**
 * The labels list, sorted in Postgres like the bottle grid is.
 *
 * Batch and the single-barrel flags moved to the bottle in M7, so a label no
 * longer knows whether it is a pick — its bottles do. "Picks" counts them,
 * which is the question worth answering here anyway: how many of these did I
 * buy as store picks.
 */
export async function listExpressions(sort: LabelSort = "brand", desc = false) {
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

  const direction = desc ? sqlDesc(columns[sort]) : sqlAsc(columns[sort]);

  return db
    .select({
      id: expressions.id,
      name: expressions.name,
      brand: brands.name,
      category: categories.name,
      proof: expressions.proof,
      ageStatement: expressions.ageStatement,
      msrp: expressions.msrp,
      upc: expressions.upc,
      bottleCount,
      pickCount,
    })
    .from(expressions)
    .innerJoin(brands, eq(expressions.brandId, brands.id))
    .innerJoin(categories, eq(expressions.categoryId, categories.id))
    // NULLS LAST both ways, and a stable tiebreak so paging never reshuffles.
    .orderBy(sql`${direction} NULLS LAST`, asc(brands.name), asc(expressions.name));
}

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
