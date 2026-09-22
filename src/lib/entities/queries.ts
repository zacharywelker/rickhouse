import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  brands,
  companies,
  distilleries,
  expressionMashbills,
  finishes,
  mashbillGrains,
  mashbills,
  stores,
} from "@/db/schema";
import { describeRecipe } from "@/lib/expressions/queries";

/**
 * Lookups for the entity pages. Each one resolves the record itself; the
 * bottles beneath it come from the same grid query the collection uses, with
 * a preset filter, so entity pages inherit sorting and paging for free.
 */

export async function getDistillery(slug: string) {
  const [row] = await db
    .select({
      id: distilleries.id,
      name: distilleries.name,
      slug: distilleries.slug,
      city: distilleries.city,
      state: distilleries.state,
      country: distilleries.country,
      dspNumber: distilleries.dspNumber,
      founded: distilleries.founded,
      notes: distilleries.notes,
      company: companies.name,
    })
    .from(distilleries)
    .leftJoin(companies, eq(distilleries.companyId, companies.id))
    .where(eq(distilleries.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function getBrand(slug: string) {
  const [row] = await db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      isNdp: brands.isNdp,
      notes: brands.notes,
      company: companies.name,
      companyCountry: companies.country,
    })
    .from(brands)
    .leftJoin(companies, eq(brands.companyId, companies.id))
    .where(eq(brands.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function getFinish(slug: string) {
  const [row] = await db.select().from(finishes).where(eq(finishes.slug, slug)).limit(1);
  return row ?? null;
}

export async function getStore(slug: string) {
  const [row] = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1);
  return row ?? null;
}

export async function getMashbill(id: number) {
  const [row] = await db
    .select({
      id: mashbills.id,
      name: mashbills.name,
      recipe: sql<string | null>`(
        select string_agg(g.grain || ':' || g.percent, '|' order by g.position)
          from ${mashbillGrains} g where g.mashbill_id = ${mashbills.id}
      )`,
      notes: mashbills.notes,
    })
    .from(mashbills)
    .where(eq(mashbills.id, id))
    .limit(1);
  if (!row) return null;
  return { ...row, recipe: describeRecipe(row.recipe) };
}

/** Every grain split this mashbill is used in, for its own page. */
export async function mashbillUse(id: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expressionMashbills)
    .where(eq(expressionMashbills.mashbillId, id));
  return row?.count ?? 0;
}

export async function allDistilleries() {
  return db
    .select({
      id: distilleries.id,
      name: distilleries.name,
      slug: distilleries.slug,
      state: distilleries.state,
      country: distilleries.country,
    })
    .from(distilleries)
    .orderBy(asc(distilleries.name));
}
