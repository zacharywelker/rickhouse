"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { deleteStoredImage } from "@/lib/images";
import { db } from "@/db";
import { bottles, expressions } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { resolveSlug } from "@/lib/slug";
import { slugify } from "@/lib/utils";
import type { ActionResult } from "@/lib/admin/types";
import type { BulkSaveResult } from "@/lib/bulk/types";
import { writableFields } from "@/lib/expressions/fields";
import { expressionGridEditSchema, expressionSchema } from "@/lib/expressions/schema";
import { fieldGroupForCategory } from "@/lib/expressions/queries";
import {
  NotOwned,
  attachPendingColas,
  fieldErrorsOf,
  insertLinks,
  labelValues,
  linksFrom,
  replaceLinks,
  valuesForGroup,
  writableValues,
  writeLabel,
} from "@/lib/expressions/save";
import { pendingTtbIds } from "@/lib/cola/ids";
import { colaFilesForExpression, deleteColaFiles } from "@/lib/cola/store";

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
  });

  try {
    const values = await labelValues(input, user.id, id);
    const expressionId = await db.transaction((tx) => writeLabel(tx, user.id, id, values, links));

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
    try {
      const allowed = writableFields(await fieldGroupForCategory(input.categoryId));
      const slug = await resolveSlug({
        table: expressions,
        column: expressions.slug,
        idColumn: expressions.id,
        scope: { column: expressions.ownerId, value: user.id },
        requested: input.slug,
        fallbackFrom: input.name,
      });
      const id = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(expressions)
          .values({ ...(valuesForGroup(input, allowed, slug) as typeof expressions.$inferInsert), ownerId: user.id })
          .returning({ id: expressions.id });
        await insertLinks(tx, inserted!.id, linksFrom(row));
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

  for (const [index, { id, distilleryLinks, mashbillLinks, finishLinks, ...fields }] of rows.entries()) {
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

      const allowed = writableFields(await fieldGroupForCategory(parsed.data.categoryId ?? current.categoryId));
      const values = writableValues(parsed.data, allowed);
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
        if (relink) await replaceLinks(tx, id, linksFrom({ distilleryLinks, mashbillLinks, finishLinks }));
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
    const deleted = await db
      .delete(expressions)
      .where(and(eq(expressions.id, id), eq(expressions.ownerId, user.id)))
      .returning({ id: expressions.id, photoPath: expressions.photoPath, photoThumbPath: expressions.photoThumbPath });
    if (deleted.length === 0) return { ok: false, error: "That label is gone." };
    if (deleted[0]?.photoPath) await deleteStoredImage(deleted[0].photoPath, deleted[0].photoThumbPath);
    await deleteColaFiles(colaFiles);
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
      const deleted = await db
        .delete(expressions)
        .where(and(eq(expressions.id, id), eq(expressions.ownerId, user.id)))
        .returning({ id: expressions.id });
      if (deleted.length > 0) await deleteColaFiles(colaFiles);
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
