"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { deleteStoredImage } from "@/lib/images";
import { db } from "@/db";
import { bottles, distilleries, expressions, expressionDistilleries, expressionMashbills, ingredients, mashbillGrains, mashbills, type IngredientKind } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { resolveSlug } from "@/lib/slug";
import { slugify } from "@/lib/utils";
import type { ActionResult } from "@/lib/admin/types";
import type { BulkSaveResult } from "@/lib/bulk/types";
import { writableFields } from "@/lib/expressions/fields";
import { expressionGridEditSchema, expressionSchema } from "@/lib/expressions/schema";
import { categoryKindsById, fieldGroupForCategory } from "@/lib/expressions/queries";
import { BRANDY_MINIMUM_YEARS, isAgaveKind, TEQUILA_CLASS_LABELS, type TequilaClass } from "@/lib/expressions/spirit-details";
import {
  NotOwned,
  attachPendingColas,
  fieldErrorsOf,
  insertLinks,
  labelValues,
  linksFrom,
  replaceLinks,
  replaceIngredients,
  writableValues,
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
import { isGinKind } from "@/lib/expressions/gin-details";

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
  if ((category === "flavored-vodka" || category === "liqueur" || category === "chocolate-liqueur" || category === "cream-liqueur") &&
    !links.ingredients?.some((choice) => choice.kind === "flavor")) {
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
    return mapDbError(error, { singular: "Label" });
  }
}

/**
 * Bulk grid save (Issue #49). The grid sends every field on the label form,
 * plus the three ordered lists, so a row saves exactly what the form would:
 * only the sections that apply to its category are written (a rum's ester
 * count on a row later switched to Bourbon is dropped, not stored where
 * nothing will ever show it), and the lists go in with the same rules.
 *
 * As with the bottle grid, each row is validated and saved on its own rather
 * than under one shared transaction, so a bad row never rolls back the good
 * ones next to it. Within a row, the label and its lists are one transaction.
 */
export async function saveExpressionsBulkAction(rows: Record<string, unknown>[]): Promise<BulkSaveResult> {
  const user = await requireSession();
  const results: BulkSaveResult["results"] = [];

  for (const [index, row] of rows.entries()) {
    const parsed = expressionSchema.safeParse(row);
    if (!parsed.success) {
      results.push({
        index,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Please check the highlighted fields.",
        fieldErrors: fieldErrorsOf(parsed.error.issues),
      });
      continue;
    }

    const input = parsed.data;
    const category = (await categoryKindsById())[input.categoryId] ?? "other";
    const links = linksFrom(row);
    if ((category === "flavored-vodka" || category === "liqueur" || category === "chocolate-liqueur" || category === "cream-liqueur") &&
      !links.ingredients?.some((choice) => choice.kind === "flavor")) {
      results.push({ index, ok: false, error: "Add at least one flavor.", fieldErrors: { ingredientLinks: "Add at least one flavor." } });
      continue;
    }
    try {
      const values = await labelValues(input, user.id, null);
      const id = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(expressions)
          .values({ ...(values as typeof expressions.$inferInsert), ownerId: user.id })
          .returning({ id: expressions.id });
        await insertLinks(tx, user.id, inserted!.id, links);
        // The row's "Add bottle" box: same transaction, so a label is
        // never saved without the bottle that was asked for.
        if (row.addBottle === true) {
          await tx.insert(bottles).values({ expressionId: inserted!.id, ownerId: user.id });
        }
        return inserted!.id;
      });
      results.push({ index, ok: true, id });
    } catch (error: unknown) {
      const shaped = mapDbError(error, { singular: "Label" });
      results.push({
        index,
        ok: false,
        error: shaped.ok ? "Could not save this row." : shaped.error,
        fieldErrors: shaped.ok ? {} : (shaped.fieldErrors ?? {}),
      });
    }
  }

  if (results.some((r) => r.ok)) {
    revalidatePath("/expressions");
    revalidatePath("/bottles");
    revalidatePath("/");
  }

  return { savedCount: results.filter((r) => r.ok).length, results };
}

/**
 * Bulk save from the labels grid's unlocked edit mode. Same per-row
 * independent save as `saveExpressionsBulkAction` — a bad row should not roll
 * back the good ones next to it — but each row carries only the fields that
 * were edited (`expressionGridEditSchema`), and nothing else on the label is
 * touched. Out-of-category fields are dropped by the same rule as the edit
 * page, judged against the category the row ends up with.
 *
 * When any of a row's distilleries, mashbills or finishes changed, the grid
 * sends all three lists and they are replaced together, as the form does.
 */
export async function updateExpressionsBulkAction(
  rows: Array<{ id: number } & Record<string, unknown>>,
): Promise<BulkSaveResult> {
  const user = await requireSession();
  const results: BulkSaveResult["results"] = [];

  for (const [index, { id, distilleryLinks, mashbillLinks, finishLinks, ingredientLinks, ...fields }] of rows.entries()) {
    const parsed = expressionGridEditSchema.safeParse(fields);
    if (!parsed.success) {
      results.push({
        index,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Please check the highlighted fields.",
        fieldErrors: fieldErrorsOf(parsed.error.issues),
      });
      continue;
    }
    try {
      const [current] = await db
        .select({ categoryId: expressions.categoryId, name: expressions.name })
        .from(expressions)
        .where(and(eq(expressions.id, id), eq(expressions.ownerId, user.id)))
        .limit(1);
      // Another account's label reads as gone, exactly like a deleted one.
      if (!current) {
        results.push({ index, ok: false, error: "That label is gone.", fieldErrors: {} });
        continue;
      }

      const categoryId = parsed.data.categoryId ?? current.categoryId;
      const kind = (await categoryKindsById())[categoryId] ?? "other";
      const allowed = writableFields(await fieldGroupForCategory(categoryId));
      const values = writableValues(parsed.data, allowed);
      if (isAgaveKind(kind)) {
        delete values.barrelFilledOn; delete values.bottledOn; delete values.isNas;
      }
      if (kind === "tequila") {
        delete values.ageStatement;
        if (parsed.data.tequilaClass !== undefined || current.categoryId !== categoryId) {
          values.ageStatement = parsed.data.tequilaClass ? TEQUILA_CLASS_LABELS[parsed.data.tequilaClass as TequilaClass] : null;
          values.isNas = false;
        }
        if (parsed.data.tequilaClass === "blanco") { values.ageYears = null; values.ageMonths = null; values.ageDays = null; }
      } else delete values.tequilaClass;
      if (BRANDY_MINIMUM_YEARS[kind]) {
        if (parsed.data.brandyGrade !== undefined) values.ageStatement = parsed.data.brandyGrade;
      } else delete values.brandyGrade;
      if (kind !== "gin") delete values.ginStyle;
      if (!isGinKind(kind)) delete values.isAgedGin;
      if (isGinKind(kind)) {
        delete values.barrelFilledOn; delete values.bottledOn; delete values.ageStatement;
      }
      // A cleared slug means "make me one", as it does on the form — the
      // column itself can never be empty.
      if ("slug" in values && values.slug === null) {
        values.slug = await resolveSlug({
          table: expressions,
          column: expressions.slug,
          idColumn: expressions.id,
          scope: { column: expressions.ownerId, value: user.id },
          requested: null,
          fallbackFrom: parsed.data.name ?? current.name,
          excludeId: id,
        });
      }
      const relink = distilleryLinks !== undefined || mashbillLinks !== undefined || finishLinks !== undefined;

      await db.transaction(async (tx) => {
        if (Object.keys(values).length > 0) {
          await tx
            .update(expressions)
            .set(values as Partial<typeof expressions.$inferInsert>)
            .where(and(eq(expressions.id, id), eq(expressions.ownerId, user.id)));
        }
        if (relink) await replaceLinks(tx, user.id, id, linksFrom({ distilleryLinks, mashbillLinks, finishLinks, ingredientLinks }));
        else if (ingredientLinks !== undefined || (kind === "tequila" && current.categoryId !== categoryId) ||
          (isGinKind(kind) && !isGinKind((await categoryKindsById())[current.categoryId] ?? "other"))) {
          await replaceIngredients(tx, user.id, id, linksFrom({ ingredientLinks }).ingredients ?? []);
        }
      });
      results.push({ index, ok: true, id });
    } catch (error: unknown) {
      const shaped = mapDbError(error, { singular: "Label" });
      results.push({
        index,
        ok: false,
        error: shaped.ok ? "Could not save this row." : shaped.error,
        fieldErrors: shaped.ok ? {} : (shaped.fieldErrors ?? {}),
      });
    }
  }

  if (results.some((r) => r.ok)) {
    revalidatePath("/expressions");
    revalidatePath("/bottles");
    revalidatePath("/");
  }

  return { savedCount: results.filter((r) => r.ok).length, results };
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

/** Bulk delete from the labels grid's unlocked edit mode. A label with
 * bottles still on it is expected to fail here (restrict FK) while the rest
 * of the batch succeeds, so each id is deleted independently. */
export async function deleteExpressionsBulkAction(ids: number[]): Promise<BulkSaveResult> {
  const user = await requireSession();
  const results: BulkSaveResult["results"] = [];

  for (const [index, id] of ids.entries()) {
    try {
      const colaFiles = await colaFilesForExpression(id);
      const releasePhotos = await releasePhotosOfLabel(id);
      const deleted = await db
        .delete(expressions)
        .where(and(eq(expressions.id, id), eq(expressions.ownerId, user.id)))
        .returning({ id: expressions.id, photoPath: expressions.photoPath, photoThumbPath: expressions.photoThumbPath });
      if (deleted.length > 0) {
        // The label's own photo too, which this path used to leave on disk.
        if (deleted[0]!.photoPath) await deleteStoredImage(deleted[0]!.photoPath, deleted[0]!.photoThumbPath);
        await deleteColaFiles(colaFiles);
        await deleteStoredPhotos(releasePhotos);
      }
      results.push(
        deleted.length > 0 ? { index, ok: true, id } : { index, ok: false, error: "That label is gone.", fieldErrors: {} },
      );
    } catch (error: unknown) {
      const shaped = mapDbError(error, { singular: "Label" });
      results.push({
        index,
        ok: false,
        error: shaped.ok ? "Could not delete this label." : shaped.error,
        fieldErrors: {},
      });
    }
  }

  if (results.some((r) => r.ok)) {
    revalidatePath("/expressions");
    revalidatePath("/bottles");
    revalidatePath("/");
  }

  return { savedCount: results.filter((r) => r.ok).length, results };
}

/** Suggests a slug in the form as you type, so the field is never a surprise. */
export async function previewSlugAction(name: string, batch: string): Promise<string> {
  await requireSession();
  return slugify(`${name}${batch ? ` ${batch}` : ""}`);
}
