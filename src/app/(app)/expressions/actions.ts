"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  expressionDistilleries,
  expressionFinishes,
  expressionMashbills,
  expressions,
} from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { resolveSlug } from "@/lib/slug";
import { slugify } from "@/lib/utils";
import type { ActionResult } from "@/lib/admin/types";
import type { BulkSaveResult } from "@/lib/bulk/types";
import { writableFields } from "@/lib/expressions/fields";
import { expressionGridEditSchema, expressionSchema, parseLinks, type ExpressionInput } from "@/lib/expressions/schema";
import { fieldGroupForCategory } from "@/lib/expressions/queries";

/**
 * Fields every category writes, whatever its field group. Anything outside
 * this set belongs to a section that may be hidden.
 */
const COMMON_FIELDS = new Set(writableFields("other"));

/**
 * Builds the column values to write, dropping anything whose section is not
 * visible for this category's field group.
 *
 * This is what makes "hidden fields must not be cleared silently" true: switch
 * a Rum to a Bourbon and the rum columns are simply not part of the update, so
 * the ester count survives to be there again if you switch back.
 */
function valuesForGroup(input: ExpressionInput, allowed: Set<string>, slug: string) {
  const all: Record<string, unknown> = { ...input, slug };
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(all)) {
    if (key === "slug" || COMMON_FIELDS.has(key) || allowed.has(key)) values[key] = value;
  }
  return values;
}

/** Thrown inside a transaction to roll it back when the label isn't the caller's. */
class NotOwned extends Error {}

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
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the highlighted fields.",
      fieldErrors,
    };
  }

  const input = parsed.data;
  const linkedDistilleries = parseLinks(formData.get("distilleryLinks"));
  const linkedMashbills = parseLinks(formData.get("mashbillLinks"));
  const linkedFinishes = parseLinks(formData.get("finishLinks"));

  try {
    const fieldGroup = await fieldGroupForCategory(input.categoryId);
    const allowed = writableFields(fieldGroup);

    const slug = await resolveSlug({
      table: expressions,
      column: expressions.slug,
      idColumn: expressions.id,
      scope: { column: expressions.ownerId, value: user.id },
      requested: input.slug,
      fallbackFrom: `${input.name}${input.batch ? ` ${input.batch}` : ""}`,
      ...(id !== null ? { excludeId: id } : {}),
    });

    const values = valuesForGroup(input, allowed, slug);

    const expressionId = await db.transaction(async (tx) => {
      let target = id;
      if (target === null) {
        const [row] = await tx
          .insert(expressions)
          .values({ ...(values as typeof expressions.$inferInsert), ownerId: user.id })
          .returning({ id: expressions.id });
        target = row!.id;
      } else {
        const updated = await tx
          .update(expressions)
          .set(values as Partial<typeof expressions.$inferInsert>)
          .where(and(eq(expressions.id, target), eq(expressions.ownerId, user.id)))
          .returning({ id: expressions.id });
        // Stop before the link rows below are rewritten for someone else's label.
        if (updated.length === 0) throw new NotOwned();
      }

      // Replace rather than diff: the lists are short and ordering matters,
      // so rewriting them is both simpler and correct.
      await tx.delete(expressionDistilleries).where(eq(expressionDistilleries.expressionId, target));
      await tx.delete(expressionMashbills).where(eq(expressionMashbills.expressionId, target));
      await tx.delete(expressionFinishes).where(eq(expressionFinishes.expressionId, target));

      if (linkedDistilleries.length > 0) {
        await tx.insert(expressionDistilleries).values(
          linkedDistilleries.map((row, position) => ({
            expressionId: target,
            distilleryId: row.id,
            position,
            sharePct: row.amount === null ? null : String(row.amount),
          })),
        );
      }
      if (linkedMashbills.length > 0) {
        // With exactly one distillery, it is the automatic answer for every
        // mashbill regardless of what the form sent; with more than one, only
        // a choice that is actually one of them is kept (issue #13).
        const soloDistilleryId = linkedDistilleries.length === 1 ? linkedDistilleries[0]!.id : null;
        const validDistilleryIds = new Set(linkedDistilleries.map((row) => row.id));
        const distilleryIdFor = (row: (typeof linkedMashbills)[number]) =>
          soloDistilleryId ?? (row.distilleryId && validDistilleryIds.has(row.distilleryId) ? row.distilleryId : null);

        await tx.insert(expressionMashbills).values(
          linkedMashbills.map((row, position) => ({
            expressionId: target,
            mashbillId: row.id,
            position,
            sharePct: row.amount === null ? null : String(row.amount),
            distilleryId: distilleryIdFor(row),
          })),
        );
      }
      if (linkedFinishes.length > 0) {
        await tx.insert(expressionFinishes).values(
          linkedFinishes.map((row, position) => ({
            expressionId: target,
            finishId: row.id,
            position,
            months: row.amount === null ? null : Math.round(row.amount),
          })),
        );
      }

      return target;
    });

    revalidatePath("/expressions");
    revalidatePath("/bottles");
    revalidatePath("/");
    return {
      ok: true,
      message: id === null ? "Label created." : "Label saved.",
      createdId: expressionId,
    };
  } catch (error: unknown) {
    if (error instanceof NotOwned) return { ok: false, error: "That label is gone." };
    return mapDbError(error, { singular: "Label" });
  }
}

/**
 * Bulk grid save (Issue #49). The grid only ever sends the columns every
 * category writes (identity, strength, commercial — `COMMON_FIELDS`), so
 * there is no field-group filtering to do: every row is a plain create, and
 * `valuesForGroup` exists to protect an *update* from clobbering hidden
 * sections, which a brand-new row has none of.
 *
 * As with the bottle grid, each row is validated and inserted on its own
 * rather than under one shared transaction, so a bad row never rolls back
 * the good ones next to it.
 */
export async function saveExpressionsBulkAction(rows: Record<string, unknown>[]): Promise<BulkSaveResult> {
  const user = await requireSession();
  const results: BulkSaveResult["results"] = [];

  for (const [index, row] of rows.entries()) {
    const parsed = expressionSchema.safeParse(row);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
      }
      results.push({
        index,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Please check the highlighted fields.",
        fieldErrors,
      });
      continue;
    }

    const input = parsed.data;
    try {
      const slug = await resolveSlug({
        table: expressions,
        column: expressions.slug,
        idColumn: expressions.id,
        scope: { column: expressions.ownerId, value: user.id },
        requested: input.slug,
        fallbackFrom: input.name,
      });
      const [inserted] = await db
        .insert(expressions)
        .values({ ...input, slug, ownerId: user.id })
        .returning({ id: expressions.id });
      results.push({ index, ok: true, id: inserted!.id });
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

/** Bulk save from the labels grid's unlocked edit mode (issue: bulk delete
 * and edit for bottles and labels). Same per-row independent save as
 * `saveExpressionsBulkAction` — a bad row should not roll back the good ones
 * next to it — but updates an existing row rather than inserting one, and
 * only ever touches the grid-editable columns (`expressionGridEditSchema`),
 * never the hidden field-group sections a full edit-page save protects. */
export async function updateExpressionsBulkAction(
  rows: Array<{ id: number } & Record<string, unknown>>,
): Promise<BulkSaveResult> {
  const user = await requireSession();
  const results: BulkSaveResult["results"] = [];

  for (const [index, { id, ...fields }] of rows.entries()) {
    const parsed = expressionGridEditSchema.safeParse(fields);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
      }
      results.push({
        index,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Please check the highlighted fields.",
        fieldErrors,
      });
      continue;
    }
    try {
      const updated = await db
        .update(expressions)
        .set(parsed.data)
        .where(and(eq(expressions.id, id), eq(expressions.ownerId, user.id)))
        .returning({ id: expressions.id });
      results.push(
        updated.length > 0 ? { index, ok: true, id } : { index, ok: false, error: "That label is gone.", fieldErrors: {} },
      );
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
    const deleted = await db
      .delete(expressions)
      .where(and(eq(expressions.id, id), eq(expressions.ownerId, user.id)))
      .returning({ id: expressions.id });
    if (deleted.length === 0) return { ok: false, error: "That label is gone." };
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
      const deleted = await db
        .delete(expressions)
        .where(and(eq(expressions.id, id), eq(expressions.ownerId, user.id)))
        .returning({ id: expressions.id });
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
