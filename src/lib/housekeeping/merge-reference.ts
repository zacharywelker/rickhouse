import "server-only";
import { and, asc, count, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { alias, type PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  bottles,
  bottleTags,
  brands,
  companies,
  cooperages,
  distilleries,
  distilleryNames,
  expressionDistilleries,
  expressionFinishes,
  expressionFinishMashbills,
  expressionIngredients,
  expressionMashbills,
  expressions,
  finishes,
  groups,
  housekeepingMerges,
  ingredients,
  mashbillGrains,
  mashbills,
  stores,
  tags,
} from "@/db/schema";
import { allowedAdoptions, planAdoption, type Adoptable } from "./adoption";
import { clearDismissalsFor } from "./dismissals";
import type { DuplicateKind } from "./duplicate-kinds";
import { describeMashbill, mashbillTitle, recipeKey } from "@/lib/mashbills";
import { swapIdInFilterQuery } from "./group-filter";

/**
 * Merging one reference row into another: everything that pointed at the removed row points at the survivor, the
 * survivor keeps its own facts (it may adopt ones it lacks), the removed row is deleted, and the merge is logged.
 * One transaction, rows locked in id order, and not undoable. Each kind is one entry in `HANDLERS`.
 */

/** `same`: a row cannot merge into itself. `gone`: not the caller's, or already merged. `blocked`: it cannot succeed. */
export class HousekeepingMergeError extends Error {
  constructor(
    readonly code: "same" | "gone" | "blocked",
    message: string,
  ) {
    super(message);
  }
}

export type Move = { label: string; count: number };
export type MergePreview = { moves: Move[]; adoptable: Adoptable[]; blocked: string | null };
export type MergeSummary = { survivorName: string; removedName: string; moves: Move[]; adopted: string[] };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;
type Row = Record<string, unknown> & { id: number };

type Handler = {
  /** Why the merge cannot happen, or null. Read-only. */
  blocked?: (ex: Executor, ownerId: number, survivor: Row, removed: Row) => Promise<string | null>;
  /** What points at the removed row. Read-only. */
  count: (ex: Executor, ownerId: number, removedId: number) => Promise<Move[]>;
  /** Points everything at the survivor. */
  relink: (tx: Tx, ownerId: number, survivorId: number, removedId: number) => Promise<void>;
  /** How the row is named in the log and the summary, when it is not just `name`. */
  name?: (ex: Executor, row: Row) => Promise<string>;
};

const MESSAGES = {
  same: "Choose two different rows to merge.",
  gone: "That pair has already been merged or removed.",
};

const nonZero = (entries: Array<[string, number]>): Move[] => entries.filter(([, n]) => n > 0).map(([label, n]) => ({ label, count: n }));

async function countOf(ex: Executor, table: PgTable, where: SQL | undefined): Promise<number> {
  const [row] = await ex.select({ n: count() }).from(table).where(where);
  return row?.n ?? 0;
}

async function grainsOf(ex: Executor, mashbillId: number) {
  return ex
    .select({ grain: mashbillGrains.grain, percent: mashbillGrains.percent, position: mashbillGrains.position })
    .from(mashbillGrains)
    .where(eq(mashbillGrains.mashbillId, mashbillId));
}

const HANDLERS: Record<DuplicateKind, Handler> = {
  companies: {
    count: async (ex, ownerId, removedId) =>
      nonZero([
        ["brands", await countOf(ex, brands, and(eq(brands.companyId, removedId), eq(brands.ownerId, ownerId)))],
        ["distilleries", await countOf(ex, distilleries, and(eq(distilleries.companyId, removedId), eq(distilleries.ownerId, ownerId)))],
        ["child companies", await countOf(ex, companies, and(eq(companies.parentId, removedId), eq(companies.ownerId, ownerId)))],
      ]),
    relink: async (tx, ownerId, survivorId, removedId) => {
      await tx.update(brands).set({ companyId: survivorId }).where(and(eq(brands.companyId, removedId), eq(brands.ownerId, ownerId)));
      await tx.update(distilleries).set({ companyId: survivorId }).where(and(eq(distilleries.companyId, removedId), eq(distilleries.ownerId, ownerId)));
      // A child of the removed company follows the survivor, unless the survivor is that child.
      await tx
        .update(companies)
        .set({ parentId: survivorId })
        .where(and(eq(companies.parentId, removedId), eq(companies.ownerId, ownerId), ne(companies.id, survivorId)));
    },
  },
  brands: {
    blocked: async (ex, _ownerId, survivor, removed) => {
      // Labels are unique by brand and name, so two brands with a label of the same name cannot be joined yet.
      const kept = alias(expressions, "kept");
      const moving = alias(expressions, "moving");
      const [clash] = await ex
        .select({ name: kept.name })
        .from(kept)
        .innerJoin(moving, eq(kept.name, moving.name))
        .where(and(eq(kept.brandId, survivor.id), eq(moving.brandId, removed.id)))
        .limit(1);
      return clash ? `Both brands have a label called “${clash.name}”. Merge those labels first.` : null;
    },
    count: async (ex, ownerId, removedId) =>
      nonZero([["labels", await countOf(ex, expressions, and(eq(expressions.brandId, removedId), eq(expressions.ownerId, ownerId)))]]),
    relink: async (tx, ownerId, survivorId, removedId) => {
      await tx.update(expressions).set({ brandId: survivorId }).where(and(eq(expressions.brandId, removedId), eq(expressions.ownerId, ownerId)));
    },
  },
  cooperages: {
    count: async (ex, ownerId, removedId) =>
      nonZero([["labels", await countOf(ex, expressions, and(eq(expressions.cooperageId, removedId), eq(expressions.ownerId, ownerId)))]]),
    relink: async (tx, ownerId, survivorId, removedId) => {
      await tx.update(expressions).set({ cooperageId: survivorId }).where(and(eq(expressions.cooperageId, removedId), eq(expressions.ownerId, ownerId)));
    },
  },
  stores: {
    count: async (ex, ownerId, removedId) =>
      nonZero([["bottles", await countOf(ex, bottles, and(eq(bottles.storeId, removedId), eq(bottles.ownerId, ownerId)))]]),
    relink: async (tx, ownerId, survivorId, removedId) => {
      await tx.update(bottles).set({ storeId: survivorId }).where(and(eq(bottles.storeId, removedId), eq(bottles.ownerId, ownerId)));
    },
  },
  tags: {
    count: async (ex, _ownerId, removedId) => nonZero([["bottles", await countOf(ex, bottleTags, eq(bottleTags.tagId, removedId))]]),
    relink: async (tx, _ownerId, survivorId, removedId) => {
      // A bottle that already has the survivor's tag keeps that one; the rest move.
      await tx.execute(
        sql`insert into bottle_tags (bottle_id, tag_id) select bottle_id, ${survivorId} from bottle_tags where tag_id = ${removedId} on conflict do nothing`,
      );
      await tx.delete(bottleTags).where(eq(bottleTags.tagId, removedId));
    },
  },
  ingredients: {
    blocked: async (_ex, _ownerId, survivor, removed) =>
      survivor.kind === removed.kind ? null : "Those ingredients are different kinds, so they are not the same thing.",
    count: async (ex, _ownerId, removedId) =>
      nonZero([["labels", await countOf(ex, expressionIngredients, eq(expressionIngredients.ingredientId, removedId))]]),
    relink: async (tx, _ownerId, survivorId, removedId) => {
      // A label that already has the survivor keeps that row; the rest move.
      await tx.execute(
        sql`insert into expression_ingredients (expression_id, ingredient_id, position, is_manual)
            select expression_id, ${survivorId}, position, is_manual from expression_ingredients where ingredient_id = ${removedId}
            on conflict do nothing`,
      );
      await tx.delete(expressionIngredients).where(eq(expressionIngredients.ingredientId, removedId));
    },
  },
  distilleries: {
    count: async (ex, ownerId, removedId) =>
      nonZero([
        ["labels", await countOf(ex, expressionDistilleries, eq(expressionDistilleries.distilleryId, removedId))],
        ["mashbill links", await countOf(ex, expressionMashbills, eq(expressionMashbills.distilleryId, removedId))],
        ["other names", await countOf(ex, distilleryNames, eq(distilleryNames.distilleryId, removedId))],
      ]),
    relink: async (tx, _ownerId, survivorId, removedId) => {
      // A label that already has the survivor keeps that row; the rest move, keeping their "inferred" flag.
      await tx.execute(
        sql`insert into expression_distilleries (expression_id, distillery_id, position, share_pct, is_inferred)
            select expression_id, ${survivorId}, position, share_pct, is_inferred from expression_distilleries where distillery_id = ${removedId}
            on conflict do nothing`,
      );
      await tx.delete(expressionDistilleries).where(eq(expressionDistilleries.distilleryId, removedId));
      await tx.update(expressionMashbills).set({ distilleryId: survivorId }).where(eq(expressionMashbills.distilleryId, removedId));
      // The removed distillery's other names, minus any the survivor already has or answers to as its own name,
      // then the removed distillery's own name, so an import or a search still finds it.
      await tx.execute(
        sql`insert into distillery_names (distillery_id, name, year_from, year_to, position)
            select ${survivorId}, name, year_from, year_to, position from distillery_names
            where distillery_id = ${removedId} and name <> (select name from distilleries where id = ${survivorId})
            on conflict do nothing`,
      );
      await tx.execute(
        sql`insert into distillery_names (distillery_id, name, position)
            select ${survivorId}, name, (select coalesce(max(position), -1) + 1 from distillery_names where distillery_id = ${survivorId})
            from distilleries where id = ${removedId}
            on conflict do nothing`,
      );
    },
  },
  finishes: {
    count: async (ex, _ownerId, removedId) =>
      nonZero([["labels", await countOf(ex, expressionFinishes, eq(expressionFinishes.finishId, removedId))]]),
    relink: async (tx, _ownerId, survivorId, removedId) => {
      // Pairings (which finish went on which mashbill) point at a label's finish through a composite key, so the
      // survivor's row must exist first, colliding pairings go, the rest are re-pointed, and only then the old rows go.
      await tx.execute(
        sql`insert into expression_finishes (expression_id, finish_id, position, months, share_pct)
            select expression_id, ${survivorId}, position, months, share_pct from expression_finishes where finish_id = ${removedId}
            on conflict do nothing`,
      );
      await tx.execute(
        sql`delete from expression_finish_mashbills f where f.finish_id = ${removedId} and exists (
              select 1 from expression_finish_mashbills g
              where g.expression_id = f.expression_id and g.mashbill_id = f.mashbill_id and g.finish_id = ${survivorId})`,
      );
      await tx.update(expressionFinishMashbills).set({ finishId: survivorId }).where(eq(expressionFinishMashbills.finishId, removedId));
      await tx.delete(expressionFinishes).where(eq(expressionFinishes.finishId, removedId));
    },
  },
  mashbills: {
    blocked: async (ex, _ownerId, survivor, removed) => {
      if (survivor.isPartial || removed.isPartial) return "A partial mashbill is not a full recipe, so it cannot be merged.";
      const same = recipeKey(await grainsOf(ex, survivor.id)) === recipeKey(await grainsOf(ex, removed.id));
      return same ? null : "Those mashbills have different recipes, so they are not the same thing.";
    },
    count: async (ex, _ownerId, removedId) =>
      nonZero([["labels", await countOf(ex, expressionMashbills, eq(expressionMashbills.mashbillId, removedId))]]),
    relink: async (tx, _ownerId, survivorId, removedId) => {
      // Same order as finishes: the survivor's row first, colliding pairings out, the rest re-pointed, old rows last.
      await tx.execute(
        sql`insert into expression_mashbills (expression_id, mashbill_id, position, share_pct, distillery_id)
            select expression_id, ${survivorId}, position, share_pct, distillery_id from expression_mashbills where mashbill_id = ${removedId}
            on conflict do nothing`,
      );
      await tx.execute(
        sql`delete from expression_finish_mashbills f where f.mashbill_id = ${removedId} and exists (
              select 1 from expression_finish_mashbills g
              where g.expression_id = f.expression_id and g.mashbill_id = ${survivorId} and coalesce(g.finish_id, 0) = coalesce(f.finish_id, 0))`,
      );
      await tx.update(expressionFinishMashbills).set({ mashbillId: survivorId }).where(eq(expressionFinishMashbills.mashbillId, removedId));
      await tx.delete(expressionMashbills).where(eq(expressionMashbills.mashbillId, removedId));
    },
    // A mashbill with no name is known by its recipe.
    name: async (ex, row) =>
      mashbillTitle(
        { isSecret: Boolean(row.isSecret), isGeneric: Boolean(row.isGeneric), name: typeof row.name === "string" ? row.name : null },
        describeMashbill(await grainsOf(ex, row.id)),
      ),
  },
};

/** The Collection filter each kind appears under, so smart groups can follow a merge. */
const GROUP_PARAM: Partial<Record<DuplicateKind, string>> = {
  brands: "brand",
  distilleries: "distillery",
  mashbills: "mashbill",
  finishes: "finish",
  ingredients: "ingredient",
  stores: "store",
  tags: "tag",
};

async function groupsToFollow(ex: Executor, ownerId: number, kind: DuplicateKind, survivorId: number, removedId: number) {
  const param = GROUP_PARAM[kind];
  if (!param) return [];
  const rows = await ex.select({ id: groups.id, query: groups.filterQuery }).from(groups).where(eq(groups.ownerId, ownerId));
  return rows.flatMap((row) => {
    const next = row.query ? swapIdInFilterQuery(row.query, param, removedId, survivorId) : null;
    return next === null ? [] : [{ id: row.id, next }];
  });
}

const TABLES = { brands, distilleries, companies, finishes, ingredients, mashbills, cooperages, stores, tags };
// Every kind's table has an `id` and an `ownerId`; the generic steps below rely on nothing else.
const tableOf = (kind: DuplicateKind) => TABLES[kind] as unknown as typeof brands;

async function nameOf(ex: Executor, kind: DuplicateKind, row: Row): Promise<string> {
  return HANDLERS[kind].name ? HANDLERS[kind].name!(ex, row) : String(row.name ?? "");
}

/** What a merge would move, whether it can happen, and what the survivor could adopt. Changes nothing. */
export async function previewMerge(ownerId: number, kind: DuplicateKind, survivorId: number, removedId: number): Promise<MergePreview> {
  const refused = (blocked: string): MergePreview => ({ moves: [], adoptable: [], blocked });
  if (survivorId === removedId) return refused(MESSAGES.same);
  const table = tableOf(kind);
  const rows = (await db
    .select()
    .from(table)
    .where(and(inArray(table.id, [survivorId, removedId]), eq(table.ownerId, ownerId)))) as unknown as Row[];
  const survivor = rows.find((row) => row.id === survivorId);
  const removed = rows.find((row) => row.id === removedId);
  if (!survivor || !removed) return refused(MESSAGES.gone);
  const handler = HANDLERS[kind];
  const blocked = (await handler.blocked?.(db, ownerId, survivor, removed)) ?? null;
  if (blocked) return refused(blocked);
  const followers = await groupsToFollow(db, ownerId, kind, survivorId, removedId);
  return {
    moves: [...(await handler.count(db, ownerId, removedId)), ...nonZero([["smart groups", followers.length]])],
    adoptable: planAdoption(kind, survivor, removed),
    blocked: null,
  };
}

export async function mergeReference(
  ownerId: number,
  kind: DuplicateKind,
  survivorId: number,
  removedId: number,
  adopt: readonly string[],
): Promise<MergeSummary> {
  if (survivorId === removedId) throw new HousekeepingMergeError("same", MESSAGES.same);
  const table = tableOf(kind);
  const handler = HANDLERS[kind];

  return db.transaction(async (tx) => {
    // Locked in id order, so two merges touching the same pair cannot wait on each other.
    const locked = (await tx
      .select()
      .from(table)
      .where(and(inArray(table.id, [survivorId, removedId]), eq(table.ownerId, ownerId)))
      .orderBy(asc(table.id))
      .for("update")) as unknown as Row[];
    const survivor = locked.find((row) => row.id === survivorId);
    const removed = locked.find((row) => row.id === removedId);
    if (!survivor || !removed) throw new HousekeepingMergeError("gone", MESSAGES.gone);
    const blocked = await handler.blocked?.(tx, ownerId, survivor, removed);
    if (blocked) throw new HousekeepingMergeError("blocked", blocked);

    const followers = await groupsToFollow(tx, ownerId, kind, survivorId, removedId);
    const moves = [...(await handler.count(tx, ownerId, removedId)), ...nonZero([["smart groups", followers.length]])];
    await handler.relink(tx, ownerId, survivorId, removedId);
    for (const group of followers) await tx.update(groups).set({ filterQuery: group.next }).where(eq(groups.id, group.id));

    // Facts only the removed row had: the survivor takes the ones it lacks and was offered, never anything else.
    const wanted = new Set(allowedAdoptions(kind, adopt));
    const taking = planAdoption(kind, survivor, removed).filter((offer) => wanted.has(offer.field));
    if (taking.length > 0) {
      await tx
        .update(table)
        .set(Object.fromEntries(taking.map((offer) => [offer.field, offer.value])) as never)
        .where(and(eq(table.id, survivorId), eq(table.ownerId, ownerId)));
    }

    const survivorName = await nameOf(tx, kind, survivor);
    const removedName = await nameOf(tx, kind, removed);
    await tx.delete(table).where(and(eq(table.id, removedId), eq(table.ownerId, ownerId)));
    await clearDismissalsFor(tx, ownerId, kind, removedId);
    const adopted = taking.map((offer) => offer.field);
    await tx.insert(housekeepingMerges).values({ ownerId, kind, survivorId, survivorName, removedId, removedName, moved: moves, adopted });
    return { survivorName, removedName, moves, adopted };
  });
}
