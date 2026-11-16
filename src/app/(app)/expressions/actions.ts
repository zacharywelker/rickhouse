"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { deleteStoredImage } from "@/lib/images";
import { db } from "@/db";
import { bottles, distilleries, expressions, expressionDistilleries, expressionMashbills, ingredients, mashbillGrains, mashbills, type IngredientKind } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { slugify } from "@/lib/utils";
import type { ActionResult } from "@/lib/admin/types";
import { expressionSchema } from "@/lib/expressions/schema";
import { categoryKindsById } from "@/lib/expressions/queries";
import {
  LabelRejected,
  NotOwned,
  flavorMissing,
  attachPendingColas,
  fieldErrorsOf,
  labelValues,
  linksFrom,
  writeLabel,
} from "@/lib/expressions/save";
import { parseReleaseRows } from "@/lib/releases";
import { deleteStoredPhotos, releasePhotosOfLabel, syncExpressionReleases, type StoredPhoto } from "@/lib/releases-store";
import { parseOtherNames } from "@/lib/other-names";
import { syncExpressionNames } from "@/lib/other-names-store";
import { pendingTtbIds } from "@/lib/cola/ids";
import { colaFilesForExpression, deleteColaFiles } from "@/lib/cola/store";
import { describeMashbill, mashbillTitle } from "@/lib/mashbills";
import type { Option } from "@/lib/admin/types";
import type { IngredientChoice } from "@/lib/expressions/spirit-details";

export async function ingredientOptionsAction(kind: IngredientKind): Promise<IngredientChoice[]> {
  const user = await requireSession();
  if (!["maguey", "distillate", "rum_base", "botanical", "gin_base", "vodka_base", "flavor", "liqueur_base"].includes(kind)) return [];
  return db.select({ name: ingredients.name, family: ingredients.family, kind: ingredients.kind })
    .from(ingredients).where(and(eq(ingredients.ownerId, user.id), eq(ingredients.kind, kind)))
    .orderBy(ingredients.name);
}

/** The most common recipes linked to labels from this distillery in this account. */
export async function mashbillSuggestionsAction(distilleryId: number): Promise<Option[]> {
  const user = await requireSession();
  if (!Number.isInteger(distilleryId) || distilleryId <= 0) return [];
  const rows = await db
    .select({
      value: mashbills.id,
      name: mashbills.name,
      isSecret: mashbills.isSecret,
      isGeneric: mashbills.isGeneric,
      recipe: sql<string | null>`(
        select string_agg(g.grain || ':' || g.percent, '|' order by g.position)
        from ${mashbillGrains} g where g.mashbill_id = ${mashbills.id}
      )`,
      uses: sql<number>`count(distinct ${expressionMashbills.expressionId})::int`,
    })
    .from(expressionDistilleries)
    .innerJoin(distilleries, eq(distilleries.id, expressionDistilleries.distilleryId))
    .innerJoin(expressions, eq(expressions.id, expressionDistilleries.expressionId))
    .innerJoin(
      expressionMashbills,
      and(
        eq(expressionMashbills.expressionId, expressions.id),
        or(
          eq(expressionMashbills.distilleryId, distilleryId),
          and(
            isNull(expressionMashbills.distilleryId),
            sql`not exists (
              select 1 from expression_distilleries other
              where other.expression_id = ${expressions.id}
                and other.distillery_id <> ${distilleryId}
            )`,
          ),
        ),
      ),
    )
    .innerJoin(mashbills, eq(mashbills.id, expressionMashbills.mashbillId))
    .where(and(
      eq(expressionDistilleries.distilleryId, distilleryId),
      eq(distilleries.ownerId, user.id),
      eq(expressions.ownerId, user.id),
    ))
    .groupBy(mashbills.id)
    .orderBy(sql`count(distinct ${expressionMashbills.expressionId}) desc`, sql`min(${mashbills.id})`)
    .limit(3);
  return rows.map((row) => {
    const recipe = describeMashbill(
      row.recipe ? row.recipe.split("|").map((entry) => {
        const [grain, percent] = entry.split(":");
        return { grain: grain ?? "", percent: percent ?? "" };
      }) : [],
    );
    const label = mashbillTitle(row, recipe || "No recipe");
    const hint = `Used on ${row.uses} label${row.uses === 1 ? "" : "s"}`;
    return { value: row.value, label, hint };
  });
}

/**
 * Scoped to the signed-in account throughout: another account's label id
 * matches nothing and reads as gone. Links to distilleries, mashbills and
 * finishes are held to the label's owner by a trigger in Postgres.
 */
export async function saveExpressionAction(
  id: number | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireSession();

  const parsed = expressionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }

  const input = parsed.data;
  const links = linksFrom({
    distilleryLinks: formData.get("distilleryLinks"),
    mashbillLinks: formData.get("mashbillLinks"),
    finishLinks: formData.get("finishLinks"),
    ingredientLinks: formData.get("ingredientLinks"),
  });
  const category = (await categoryKindsById())[input.categoryId] ?? "other";
  if (await flavorMissing(input.categoryId, category, links.ingredients)) {
    return { ok: false, error: "Add at least one flavor.", fieldErrors: { ingredientLinks: "Add at least one flavor." } };
  }

  // Only the label form sends this; the grids and Add bottle leave older names alone.
  const otherNames = formData.has("otherNames") ? parseOtherNames(String(formData.get("otherNames"))) : null;
  if (otherNames?.error) {
    return { ok: false, error: otherNames.error, fieldErrors: { otherNames: otherNames.error } };
  }

  const releases = formData.has("releases") ? parseReleaseRows(String(formData.get("releases"))) : null;
  if (releases?.error) {
    return { ok: false, error: releases.error, fieldErrors: { releases: releases.error } };
  }

  try {
    const values = await labelValues(input, user.id, id);
    let removedPhotos: StoredPhoto[] = [];
    const expressionId = await db.transaction(async (tx) => {
      const target = await writeLabel(tx, user.id, id, values, links);
      if (otherNames) await syncExpressionNames(tx, target, otherNames.names);
      if (releases) removedPhotos = await syncExpressionReleases(tx, target, releases.releases);
      return target;
    });
    // Files only once the rows are gone for good.
    await deleteStoredPhotos(removedPhotos);

    // Approvals picked on New Label (SPEC M11), attached once the label exists.
    const approvals = id === null ? await attachPendingColas(expressionId, user.id, pendingTtbIds(formData.get("ttbIds"))) : "";

    // "Create Label & Add Bottle": the label is already saved, so a failure
    // here leaves it in place and says so rather than failing the whole save.
    let bottleId: number | undefined;
    let bottleNote = "";
    if (id === null && formData.get("addBottle") === "1") {
      try {
        const [bottle] = await db
          .insert(bottles)
          .values({ expressionId, ownerId: user.id })
          .returning({ id: bottles.id });
        bottleId = bottle!.id;
        bottleNote = " Bottle added to your collection.";
      } catch {
        bottleNote = " The bottle could not be added; add it from the label's page.";
      }
    }

    revalidatePath("/expressions");
    revalidatePath("/bottles");
    revalidatePath("/");
    return {
      ok: true,
      message: id === null ? `Label created.${approvals}${bottleNote}` : "Label saved.",
      createdId: expressionId,
      ...(bottleId !== undefined ? { bottleId } : {}),
    };
  } catch (error: unknown) {
    if (error instanceof NotOwned) return { ok: false, error: "That label is gone." };
    if (error instanceof LabelRejected) return { ok: false, error: error.message, fieldErrors: { ingredientLinks: error.message } };
    return mapDbError(error, { singular: "Label" });
  }
}

export async function deleteExpressionAction(id: number): Promise<ActionResult> {
  const user = await requireSession();
  try {
    // COLA label images cascade in the database; the files on disk do not.
    const colaFiles = await colaFilesForExpression(id);
    const releasePhotos = await releasePhotosOfLabel(id);
    const deleted = await db
      .delete(expressions)
      .where(and(eq(expressions.id, id), eq(expressions.ownerId, user.id)))
      .returning({ id: expressions.id, photoPath: expressions.photoPath, photoThumbPath: expressions.photoThumbPath });
    if (deleted.length === 0) return { ok: false, error: "That label is gone." };
    if (deleted[0]?.photoPath) await deleteStoredImage(deleted[0].photoPath, deleted[0].photoThumbPath);
    await deleteColaFiles(colaFiles);
    await deleteStoredPhotos(releasePhotos);
    revalidatePath("/expressions");
    return { ok: true, message: "Label deleted." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Label" });
  }
}

/** Suggests a slug in the form as you type, so the field is never a surprise. */
export async function previewSlugAction(name: string, batch: string): Promise<string> {
  await requireSession();
  return slugify(`${name}${batch ? ` ${batch}` : ""}`);
}
