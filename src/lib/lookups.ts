import "server-only";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db";
import { brands, distilleries, finishes, mashbills, stores } from "@/db/schema";
import { findOrCreateBrand } from "@/lib/expressions/brand";
import { describeRecipe } from "@/lib/expressions/queries";
import { mashbillTitle } from "@/lib/mashbills";
import { resolveSlug } from "@/lib/slug";

/**
 * The names behind the phone's pickers (spec 2026-10-08-edit-facts-design.md, section 5): the caller's own
 * brands, distilleries, mashbills, finishes and stores, to tick from or search, and create-by-name for the
 * three a name is enough for. A mashbill is a recipe and a store has a place, so those are made on the web.
 */
export const LOOKUP_KINDS = ["brands", "distilleries", "mashbills", "finishes", "stores"] as const;
export const CREATABLE_KINDS = ["brands", "distilleries", "finishes"] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];
export type CreatableKind = (typeof CREATABLE_KINDS)[number];
export type LookupItem = { id: number; name: string; detail: string | null };

const LIMIT = 200;

/** `%` and `_` in a search are the person's characters, not wildcards. */
const contains = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listLookup(kind: LookupKind, ownerId: number, q: string | null): Promise<LookupItem[]> {
  const term = q?.trim() || null;
  switch (kind) {
    case "brands": {
      const rows = await db.select({ id: brands.id, name: brands.name }).from(brands)
        .where(and(eq(brands.ownerId, ownerId), term ? ilike(brands.name, contains(term)) : undefined))
        .orderBy(asc(brands.name)).limit(LIMIT);
      return rows.map((r) => ({ ...r, detail: null }));
    }
    case "distilleries": {
      const rows = await db.select({ id: distilleries.id, name: distilleries.name, state: distilleries.state, country: distilleries.country }).from(distilleries)
        .where(and(eq(distilleries.ownerId, ownerId), term ? ilike(distilleries.name, contains(term)) : undefined))
        .orderBy(asc(distilleries.name)).limit(LIMIT);
      return rows.map((r) => ({ id: r.id, name: r.name, detail: [r.state, r.country].filter(Boolean).join(", ") || null }));
    }
    case "finishes": {
      const rows = await db.select({ id: finishes.id, name: finishes.name }).from(finishes)
        .where(and(eq(finishes.ownerId, ownerId), term ? ilike(finishes.name, contains(term)) : undefined))
        .orderBy(asc(finishes.name)).limit(LIMIT);
      return rows.map((r) => ({ ...r, detail: null }));
    }
    case "stores": {
      const rows = await db.select({ id: stores.id, name: stores.name, city: stores.city, state: stores.state }).from(stores)
        .where(and(eq(stores.ownerId, ownerId), term ? ilike(stores.name, contains(term)) : undefined))
        .orderBy(asc(stores.name)).limit(LIMIT);
      return rows.map((r) => ({ id: r.id, name: r.name, detail: [r.city, r.state].filter(Boolean).join(", ") || null }));
    }
    case "mashbills": {
      // Shown the way the label page shows them: the recipe, or the name of a secret or generic one.
      const rows = await db.select({
          id: mashbills.id,
          name: mashbills.name,
          isSecret: mashbills.isSecret,
          isGeneric: mashbills.isGeneric,
          recipe: sql<string | null>`(select string_agg(g.grain || ':' || g.percent, '|' order by g.position) from mashbill_grains g where g.mashbill_id = mashbills.id)`, // written out: drizzle drops the table name from a column in a one-table select,
        }).from(mashbills).where(eq(mashbills.ownerId, ownerId)).orderBy(asc(mashbills.id));
      const items = rows.map((r) => ({ id: r.id, name: mashbillTitle(r, describeRecipe(r.recipe)), detail: null }));
      return (term ? items.filter((i) => i.name.toLowerCase().includes(term.toLowerCase())) : items).slice(0, LIMIT);
    }
  }
}

/**
 * Makes one by name, or hands back the one the caller already has under that name (any case), so a double tap
 * or a name typed in another case never makes a second. Defaults are the web's inline "create new".
 */
export async function createLookup(kind: CreatableKind, ownerId: number, name: string): Promise<{ id: number; name: string; created: boolean }> {
  return db.transaction(async (tx) => {
    if (kind === "brands") {
      const [had] = await tx.select({ id: brands.id, name: brands.name }).from(brands).where(and(eq(brands.ownerId, ownerId), eq(brands.name, name))).limit(1);
      if (had) return { ...had, created: false };
      return { id: await findOrCreateBrand(tx, ownerId, name), name, created: true };
    }
    const table = kind === "distilleries" ? distilleries : finishes;
    const [had] = await tx.select({ id: table.id, name: table.name }).from(table).where(and(eq(table.ownerId, ownerId), eq(table.name, name))).limit(1);
    if (had) return { ...had, created: false };
    const slug = await resolveSlug({ table, column: table.slug, idColumn: table.id, scope: { column: table.ownerId, value: ownerId }, requested: null, fallbackFrom: name });
    const [row] = await tx.insert(table).values({ ownerId, name, slug }).returning({ id: table.id, name: table.name });
    return { ...row!, created: true };
  });
}
