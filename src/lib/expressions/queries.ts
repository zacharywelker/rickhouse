import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
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
  mashbills,
  stores,
  tastingNotes,
  type FieldGroup,
} from "@/db/schema";

export type LinkedEntity = { id: number; name: string; slug: string | null; amount: string | null };

export async function expressionLinks(expressionId: number): Promise<{
  distilleries: LinkedEntity[];
  mashbills: LinkedEntity[];
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
        corn: mashbills.corn,
        rye: mashbills.rye,
        wheat: mashbills.wheat,
        maltedBarley: mashbills.maltedBarley,
        maltedRye: mashbills.maltedRye,
        otherGrain: mashbills.otherGrain,
        otherGrainName: mashbills.otherGrainName,
        amount: expressionMashbills.sharePct,
      })
      .from(expressionMashbills)
      .innerJoin(mashbills, eq(expressionMashbills.mashbillId, mashbills.id))
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

  return {
    distilleries: d,
    mashbills: m.map((row) => ({
      id: row.id,
      name: row.name ?? describeRecipe(row),
      slug: null,
      amount: row.amount,
    })),
    finishes: f,
  };
}

export function describeRecipe(row: {
  corn: string;
  rye: string;
  wheat: string;
  maltedBarley: string;
  maltedRye: string;
  otherGrain: string;
  otherGrainName: string | null;
}): string {
  const parts: string[] = [];
  const push = (value: string, label: string) => {
    const n = Number(value);
    if (n > 0) parts.push(`${Number(n.toFixed(2))}% ${label}`);
  };
  push(row.corn, "corn");
  push(row.rye, "rye");
  push(row.wheat, "wheat");
  push(row.maltedBarley, "malted barley");
  push(row.maltedRye, "malted rye");
  push(row.otherGrain, row.otherGrainName ?? "other");
  return parts.join(" · ") || "No recipe recorded";
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

export async function listExpressions() {
  return db
    .select({
      id: expressions.id,
      name: expressions.name,
      batch: expressions.batch,
      brand: brands.name,
      category: categories.name,
      proof: expressions.proof,
      ageStatement: expressions.ageStatement,
      msrp: expressions.msrp,
      upc: expressions.upc,
      isSingleBarrel: expressions.isSingleBarrel,
      isSingleBarrelPick: expressions.isSingleBarrelPick,
      bottleCount: sql<number>`(select count(*)::int from ${bottles} where ${bottles.expressionId} = ${expressions.id})`,
    })
    .from(expressions)
    .innerJoin(brands, eq(expressions.brandId, brands.id))
    .innerJoin(categories, eq(expressions.categoryId, categories.id))
    .orderBy(asc(brands.name), asc(expressions.name), asc(expressions.batch));
}

/** Options for the bottle form's expression picker. */
export async function expressionOptions() {
  const rows = await db
    .select({
      value: expressions.id,
      name: expressions.name,
      batch: expressions.batch,
      brand: brands.name,
      proof: expressions.proof,
    })
    .from(expressions)
    .innerJoin(brands, eq(expressions.brandId, brands.id))
    .orderBy(asc(brands.name), asc(expressions.name));
  return rows.map((r) => ({
    value: r.value,
    label: `${r.brand} ${r.name}${r.batch ? ` — ${r.batch}` : ""}`,
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
