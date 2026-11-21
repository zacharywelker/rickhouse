import "server-only";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bottles,
  bottleTags,
  brands,
  companies,
  cooperages,
  distilleries,
  expressionDistilleries,
  expressionFinishes,
  expressionIngredients,
  expressionMashbills,
  expressions,
  finishes,
  ingredients,
  mashbillGrains,
  mashbills,
  stores,
  tags,
} from "@/db/schema";
import { describeMashbill, mashbillTitle, recipeKey } from "@/lib/mashbills";
import { formatPlace, HOME_COUNTRY, normalizeLocation } from "@/lib/places";
import { ADOPTABLE } from "./adoption";
import { duplicateScope, listDismissed, pairKey } from "./dismissals";
import { DUPLICATE_KINDS, type DuplicateKind } from "./duplicate-kinds";
import { findMashbillPairs, findNamePairs, type Pair } from "./pair-detection";

/** One side of a likely pair, as the page shows it. */
export type SideView = {
  id: number;
  name: string;
  /** A short line under the name: a place, a type, a recipe. */
  detail: string;
  /** How many labels (or bottles, for stores and tags) point at it. */
  uses: number;
  /** The optional columns a merge could carry over (see `ADOPTABLE`), by property name. */
  fields: Record<string, unknown>;
};

export type PairView = { key: string; kind: DuplicateKind; score: 0 | 1 | 2; reason: string; a: SideView; b: SideView };

type Loaded = {
  id: number;
  name: string;
  group?: string | null;
  place?: string | null;
  key?: string;
  detail: string;
  uses: number;
  row: Record<string, unknown>;
};

/** A place for display. The default country alone says nothing, so a row with no city or state shows no place. */
const placeText = (row: { city?: string | null; state?: string | null; country?: string | null }) =>
  !row.city && !row.state && (!row.country || row.country === HOME_COUNTRY) ? "" : (formatPlace(row) ?? "");

const usesMap = (rows: Array<{ id: number | null; n: number }>) =>
  new Map(rows.flatMap((row) => (row.id === null ? [] : [[row.id, row.n] as const])));

/**
 * The owner's rows of one kind with how many things use each. Counts come from grouped queries joined in code, not
 * from per-row subqueries, so a kind costs a fixed number of queries however many rows it has.
 */
async function load(ownerId: number, kind: DuplicateKind): Promise<Loaded[]> {
  switch (kind) {
    case "brands": {
      const rows = await db.select().from(brands).where(eq(brands.ownerId, ownerId));
      const uses = usesMap(
        await db.select({ id: expressions.brandId, n: count() }).from(expressions).where(eq(expressions.ownerId, ownerId)).groupBy(expressions.brandId),
      );
      return rows.map((row) => ({ id: row.id, name: row.name, detail: "", uses: uses.get(row.id) ?? 0, row: { ...row } }));
    }
    case "distilleries": {
      // A placeholder for a place a label admits to ("Undisclosed (Kentucky)") is not a real distillery to merge.
      const rows = await db.select().from(distilleries).where(and(eq(distilleries.ownerId, ownerId), eq(distilleries.disclosure, "named")));
      const uses = usesMap(
        await db
          .select({ id: expressionDistilleries.distilleryId, n: count() })
          .from(expressionDistilleries)
          .innerJoin(distilleries, eq(expressionDistilleries.distilleryId, distilleries.id))
          .where(eq(distilleries.ownerId, ownerId))
          .groupBy(expressionDistilleries.distilleryId),
      );
      return rows.map((row) => ({ id: row.id, name: row.name, detail: placeText(row), uses: uses.get(row.id) ?? 0, row: { ...row } }));
    }
    case "companies": {
      const rows = await db.select().from(companies).where(eq(companies.ownerId, ownerId));
      const byBrand = usesMap(await db.select({ id: brands.companyId, n: count() }).from(brands).where(eq(brands.ownerId, ownerId)).groupBy(brands.companyId));
      const byDistillery = usesMap(
        await db.select({ id: distilleries.companyId, n: count() }).from(distilleries).where(eq(distilleries.ownerId, ownerId)).groupBy(distilleries.companyId),
      );
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        detail: placeText(row),
        uses: (byBrand.get(row.id) ?? 0) + (byDistillery.get(row.id) ?? 0),
        row: { ...row },
      }));
    }
    case "finishes": {
      const rows = await db.select().from(finishes).where(eq(finishes.ownerId, ownerId));
      const uses = usesMap(
        await db
          .select({ id: expressionFinishes.finishId, n: count() })
          .from(expressionFinishes)
          .innerJoin(finishes, eq(expressionFinishes.finishId, finishes.id))
          .where(eq(finishes.ownerId, ownerId))
          .groupBy(expressionFinishes.finishId),
      );
      return rows.map((row) => ({ id: row.id, name: row.name, detail: row.finishType, uses: uses.get(row.id) ?? 0, row: { ...row } }));
    }
    case "ingredients": {
      const rows = await db.select().from(ingredients).where(eq(ingredients.ownerId, ownerId));
      const uses = usesMap(
        await db
          .select({ id: expressionIngredients.ingredientId, n: count() })
          .from(expressionIngredients)
          .innerJoin(ingredients, eq(expressionIngredients.ingredientId, ingredients.id))
          .where(eq(ingredients.ownerId, ownerId))
          .groupBy(expressionIngredients.ingredientId),
      );
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        group: row.kind,
        detail: [row.kind, row.family].filter(Boolean).join(" · "),
        uses: uses.get(row.id) ?? 0,
        row: { ...row },
      }));
    }
    case "mashbills": {
      // Only complete recipes: a partial mashbill is not a recipe to compare.
      const rows = await db.select().from(mashbills).where(and(eq(mashbills.ownerId, ownerId), eq(mashbills.isPartial, false)));
      const grainRows = await db
        .select({ mashbillId: mashbillGrains.mashbillId, grain: mashbillGrains.grain, percent: mashbillGrains.percent, position: mashbillGrains.position })
        .from(mashbillGrains)
        .innerJoin(mashbills, eq(mashbillGrains.mashbillId, mashbills.id))
        .where(and(eq(mashbills.ownerId, ownerId), eq(mashbills.isPartial, false)));
      const grainsBy = new Map<number, typeof grainRows>();
      for (const grain of grainRows) grainsBy.set(grain.mashbillId, [...(grainsBy.get(grain.mashbillId) ?? []), grain]);
      const uses = usesMap(
        await db
          .select({ id: expressionMashbills.mashbillId, n: count() })
          .from(expressionMashbills)
          .innerJoin(mashbills, eq(expressionMashbills.mashbillId, mashbills.id))
          .where(eq(mashbills.ownerId, ownerId))
          .groupBy(expressionMashbills.mashbillId),
      );
      return rows.flatMap((row) => {
        const grains = grainsBy.get(row.id);
        if (!grains || grains.length === 0) return [];
        const recipe = describeMashbill(grains);
        const title = mashbillTitle(row, recipe);
        return [{ id: row.id, name: title, key: recipeKey(grains), detail: title === recipe ? (row.style ?? "") : recipe, uses: uses.get(row.id) ?? 0, row: { ...row } }];
      });
    }
    case "cooperages": {
      const rows = await db.select().from(cooperages).where(eq(cooperages.ownerId, ownerId));
      const uses = usesMap(
        await db.select({ id: expressions.cooperageId, n: count() }).from(expressions).where(eq(expressions.ownerId, ownerId)).groupBy(expressions.cooperageId),
      );
      return rows.map((row) => ({ id: row.id, name: row.name, detail: "", uses: uses.get(row.id) ?? 0, row: { ...row } }));
    }
    case "stores": {
      const rows = await db.select().from(stores).where(eq(stores.ownerId, ownerId));
      const uses = usesMap(await db.select({ id: bottles.storeId, n: count() }).from(bottles).where(eq(bottles.ownerId, ownerId)).groupBy(bottles.storeId));
      return rows.map((row) => {
        // Unknown when there is no city or state; the same name in two known places is two stores.
        const location = normalizeLocation(row);
        const place = location.city || location.state ? [location.city, location.state, location.country].map((part) => (part ?? "").toLowerCase()).join("|") : null;
        return { id: row.id, name: row.name, place, detail: row.isOnline ? "Online" : placeText(row), uses: uses.get(row.id) ?? 0, row: { ...row } };
      });
    }
    case "tags": {
      const rows = await db.select().from(tags).where(eq(tags.ownerId, ownerId));
      const uses = usesMap(
        await db
          .select({ id: bottleTags.tagId, n: count() })
          .from(bottleTags)
          .innerJoin(tags, eq(bottleTags.tagId, tags.id))
          .where(eq(tags.ownerId, ownerId))
          .groupBy(bottleTags.tagId),
      );
      return rows.map((row) => ({ id: row.id, name: row.name, detail: "", uses: uses.get(row.id) ?? 0, row: { ...row } }));
    }
  }
}

/** A kind's likely pairs, best first, with the ones the owner dismissed left out. */
async function pairsFor(ownerId: number, kind: DuplicateKind): Promise<{ pairs: Pair[]; byId: Map<number, Loaded> }> {
  const loaded = await load(ownerId, kind);
  const found =
    kind === "mashbills"
      ? findMashbillPairs(loaded.map((item) => ({ id: item.id, key: item.key! })))
      : findNamePairs(kind, loaded.map((item) => ({ id: item.id, name: item.name, group: item.group ?? null, place: item.place ?? null })));
  const dismissed = await listDismissed(ownerId, duplicateScope(kind));
  return {
    pairs: found.filter((pair) => !dismissed.has(pairKey(pair.aId, pair.bId))),
    byId: new Map(loaded.map((item) => [item.id, item])),
  };
}

export async function countDuplicatePairs(ownerId: number): Promise<Record<DuplicateKind, number>> {
  const entries = await Promise.all(DUPLICATE_KINDS.map(async (kind) => [kind, (await pairsFor(ownerId, kind)).pairs.length] as const));
  return Object.fromEntries(entries) as Record<DuplicateKind, number>;
}

const side = (kind: DuplicateKind, item: Loaded): SideView => ({
  id: item.id,
  name: item.name,
  detail: item.detail,
  uses: item.uses,
  fields: Object.fromEntries(ADOPTABLE[kind].map(({ field }) => [field, item.row[field] ?? null])),
});

export async function listDuplicatePairs(ownerId: number, kind: DuplicateKind, limit: number): Promise<PairView[]> {
  const { pairs, byId } = await pairsFor(ownerId, kind);
  return pairs.slice(0, limit).map((pair) => ({
    key: pairKey(pair.aId, pair.bId),
    kind,
    score: pair.score,
    reason: pair.reason,
    a: side(kind, byId.get(pair.aId)!),
    b: side(kind, byId.get(pair.bId)!),
  }));
}
