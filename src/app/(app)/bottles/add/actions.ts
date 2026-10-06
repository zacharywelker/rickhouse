"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bottles, expressions } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { bottleSchema, expressionSchema } from "@/lib/expressions/schema";
import { searchLabels, type CategoryFacet, type HitGroup, type TypedCode } from "@/lib/expressions/label-search";
import { loadLabelDocs } from "@/lib/expressions/label-search-docs";
import { loadCatalogLabel, type CatalogLabel } from "@/lib/expressions/catalog";
import { NotOwned, attachPendingColas, fieldErrorsOf, labelValues, linksFrom, writeLabel } from "@/lib/expressions/save";
import { settleLabelChoices } from "@/lib/expressions/label-choices";
import { pendingTtbIds } from "@/lib/cola/ids";
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

  // A release can only be one of a chosen label's; a new label has none yet.
  const bottleData = chosenId === null ? { ...bottle.data, releaseId: null } : await settleLabelChoices({ ...bottle.data });

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
        .values({ ...bottleData, expressionId, ownerId: user.id })
        .returning({ id: bottles.id });
      return { expressionId, bottleId: row!.id };
    });

    const approvals =
      chosenId === null ? await attachPendingColas(expressionId, user.id, pendingTtbIds(input.ttbIds)) : "";

    revalidatePath("/bottles");
    revalidatePath("/expressions");
    revalidatePath(`/expressions/${expressionId}`);
    revalidatePath("/");
    return {
      ok: true,
      bottleId,
      expressionId,
      message: `${chosenId === null ? "Label and bottle added." : "Bottle added."}${approvals}`,
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
