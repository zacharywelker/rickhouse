"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottles, expressions, groupBottles, groups } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { bottleSchema, expressionSchema } from "@/lib/expressions/schema";
import { searchLabels, type CategoryFacet, type HitGroup, type TypedCode } from "@/lib/expressions/label-search";
import { loadLabelDocs } from "@/lib/expressions/label-search-docs";
import { loadCatalogLabel, type CatalogLabel } from "@/lib/expressions/catalog";
import { NotOwned, attachPendingColas, fieldErrorsOf, labelValues, linksFrom, writeLabel } from "@/lib/expressions/save";
import { pendingTtbIds } from "@/lib/cola/ids";
import { groupSchema } from "@/lib/groups/schemas";
import { resolveSlug } from "@/lib/slug";
import type { FieldValue } from "@/lib/forms/values";

export type CatalogHit = {
  id: number;
  brand: string;
  name: string;
  category: string;
  proof: string | null;
  bottles: number;
  distilleries: string[];
  group: HitGroup;
  via: string | null;
  exact: boolean;
};

export type CatalogSearch = { hits: CatalogHit[]; facets: CategoryFacet[]; total: number; code: TypedCode };

/** The search box on the search-first Add bottle page. */
export async function searchCatalogLabelsAction(query: string, categoryId: number | null): Promise<CatalogSearch> {
  const user = await requireSession();
  const result = searchLabels(await loadLabelDocs(user.id), String(query).slice(0, 200), {
    categoryId: Number.isInteger(categoryId) ? categoryId : null,
    limit: 25,
  });
  return {
    ...result,
    hits: result.hits.map((hit) => ({
      id: hit.doc.id,
      brand: hit.doc.brand,
      name: hit.doc.name,
      category: hit.doc.category,
      proof: hit.doc.proof,
      bottles: hit.doc.bottles,
      distilleries: hit.doc.distilleries,
      group: hit.group,
      via: hit.via,
      exact: hit.exact,
    })),
  };
}

/** A chosen label: what the page shows of it, and what it needs to edit it in place. */
export async function catalogLabelAction(id: number): Promise<CatalogLabel | null> {
  const user = await requireSession();
  if (!Number.isInteger(id)) return null;
  return loadCatalogLabel(id, user.id);
}

export type CatalogInput = {
  /** The label chosen from the search, or null for a new one. */
  expressionId: number | null;
  /** The label's fields: a new label's, or a chosen label's when edited in place. Null leaves a chosen label as it is. */
  label: Record<string, FieldValue> | null;
  /** The label's lists, as the pickers submit them (JSON). */
  links: { distilleryLinks: string; mashbillLinks: string; finishLinks: string } | null;
  /** TTB approvals picked for a new label. */
  ttbIds: string;
  bottle: Record<string, FieldValue>;
  /** The haul's group, once it has been made one: the new bottle joins it. */
  groupId?: number | null;
};

export type CatalogResult =
  | { ok: true; bottleId: number; expressionId: number; message: string }
  | { ok: false; error: string; labelErrors: Record<string, string>; bottleErrors: Record<string, string> };

/**
 * The label (new, edited, or as it was) and its bottle, in one transaction:
 * a new label is never left behind without the bottle it was made for, and a
 * bottle is never saved against a label edit that failed. Photos follow, once
 * the bottle exists, through the same upload route as the bottle page.
 */
export async function catalogBottleAction(input: CatalogInput): Promise<CatalogResult> {
  const user = await requireSession();

  const chosenId = Number.isInteger(input.expressionId) && (input.expressionId ?? 0) > 0 ? input.expressionId : null;
  if (chosenId === null && !input.label) {
    return { ok: false, error: "Choose a label, or start a new one.", labelErrors: {}, bottleErrors: {} };
  }

  const label = input.label ? expressionSchema.safeParse(input.label) : null;
  // The label's id is not known yet for a new one; any positive id passes the
  // check, and the real one is set below.
  const bottle = bottleSchema.safeParse({ ...input.bottle, expressionId: chosenId ?? 1 });

  const labelErrors = label && !label.success ? fieldErrorsOf(label.error.issues) : {};
  const bottleErrors = bottle.success ? {} : fieldErrorsOf(bottle.error.issues);
  if ((label && !label.success) || !bottle.success) {
    const first = label && !label.success ? "the label" : "the bottle";
    return { ok: false, error: `Check the highlighted fields on ${first}.`, labelErrors, bottleErrors };
  }

  const links = linksFrom(input.links ?? {});
  // Which write a database error came from, so it lands on the right half of the page.
  const progress: { stage: "label" | "bottle" } = { stage: "label" };
  try {
    const values = label?.success ? await labelValues(label.data, user.id, chosenId) : null;

    const { expressionId, bottleId } = await db.transaction(async (tx) => {
      let expressionId: number;
      if (values) {
        expressionId = await writeLabel(tx, user.id, chosenId, values, links);
      } else {
        const [owned] = await tx
          .select({ id: expressions.id })
          .from(expressions)
          .where(and(eq(expressions.id, chosenId!), eq(expressions.ownerId, user.id)))
          .limit(1);
        if (!owned) throw new NotOwned();
        expressionId = owned.id;
      }
      progress.stage = "bottle";
      const [row] = await tx
        .insert(bottles)
        .values({ ...bottle.data, expressionId, ownerId: user.id })
        .returning({ id: bottles.id });
      return { expressionId, bottleId: row!.id };
    });

    const approvals =
      chosenId === null ? await attachPendingColas(expressionId, user.id, pendingTtbIds(input.ttbIds)) : "";

    // After the save, not inside it: a group deleted mid-haul should cost the
    // group its new member, never the bottle itself.
    let grouped = "";
    if (Number.isInteger(input.groupId) && (input.groupId ?? 0) > 0) {
      const added = await addToGroup(input.groupId!, [bottleId], user.id).catch(() => false);
      grouped = added ? " Added to the haul's group." : " The haul's group is gone, so it was not added to it.";
    }

    revalidatePath("/bottles");
    revalidatePath("/expressions");
    revalidatePath(`/expressions/${expressionId}`);
    revalidatePath("/");
    return {
      ok: true,
      bottleId,
      expressionId,
      message: `${chosenId === null ? "Label and bottle added." : "Bottle added."}${approvals}${grouped}`,
    };
  } catch (error: unknown) {
    if (error instanceof NotOwned) {
      return { ok: false, error: "That label is gone. Search for it again.", labelErrors: {}, bottleErrors: {} };
    }
    const { stage } = progress;
    const shaped = mapDbError(error, { singular: stage === "label" ? "Label" : "Bottle" });
    const fieldErrors = shaped.ok ? {} : (shaped.fieldErrors ?? {});
    return {
      ok: false,
      error: shaped.ok ? "Could not save." : shaped.error,
      labelErrors: stage === "label" ? fieldErrors : {},
      bottleErrors: stage === "bottle" ? fieldErrors : {},
    };
  }
}

/**
 * Appends the caller's own bottles to the caller's own group, after its
 * current last member. False when the group isn't theirs (or is gone). The
 * database also holds a group's bottles to its owner.
 */
async function addToGroup(groupId: number, bottleIds: number[], ownerId: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.ownerId, ownerId)))
      .limit(1);
    if (!group) return false;
    const owned = await tx
      .select({ id: bottles.id })
      .from(bottles)
      .where(and(inArray(bottles.id, bottleIds), eq(bottles.ownerId, ownerId)));
    const ownedIds = new Set(owned.map((row) => row.id));
    const ordered = bottleIds.filter((id) => ownedIds.has(id));
    if (ordered.length === 0) return true;
    const [{ next } = { next: 0 }] = await tx
      .select({ next: sql<number>`coalesce(max(${groupBottles.position}), -1)::int + 1` })
      .from(groupBottles)
      .where(eq(groupBottles.groupId, groupId));
    await tx
      .insert(groupBottles)
      .values(ordered.map((bottleId, i) => ({ groupId, bottleId, position: next + i })))
      .onConflictDoNothing();
    return true;
  });
}

export type HaulGroupResult = { ok: true; groupId: number; name: string } | { ok: false; error: string };

/**
 * "Make this haul a group": a new group holding the haul's bottles, in the
 * order they were added. The name is checked like the Groups form's.
 */
export async function groupHaulAction(name: string, bottleIds: number[]): Promise<HaulGroupResult> {
  const user = await requireSession();
  const parsed = groupSchema.safeParse({ name, description: "" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Name this group." };
  const ids = Array.isArray(bottleIds) ? bottleIds.filter((id) => Number.isInteger(id) && id > 0).slice(0, 500) : [];
  if (ids.length === 0) return { ok: false, error: "There are no bottles in this haul yet." };

  try {
    const slug = await resolveSlug({
      table: groups,
      column: groups.slug,
      idColumn: groups.id,
      scope: { column: groups.ownerId, value: user.id },
      requested: null,
      fallbackFrom: parsed.data.name,
    });
    const [group] = await db
      .insert(groups)
      .values({ ...parsed.data, slug, ownerId: user.id })
      .returning({ id: groups.id, name: groups.name });
    await addToGroup(group!.id, ids, user.id);
    revalidatePath("/groups");
    revalidatePath(`/groups/${group!.id}`);
    return { ok: true, groupId: group!.id, name: group!.name };
  } catch (error: unknown) {
    const shaped = mapDbError(error, { singular: "Group" });
    return { ok: false, error: shaped.ok ? "Could not make the group." : shaped.error };
  }
}
