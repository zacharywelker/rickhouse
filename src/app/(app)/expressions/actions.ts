"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
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
import {
  expressionGridEditSchema,
  expressionSchema,
  linkRowSchema,
  parseLinks,
  type ExpressionInput,
  type LinkRow,
} from "@/lib/expressions/schema";
import { expressionLinksBulk, fieldGroupForCategory, type LinkedEntity, type LinkedMashbill } from "@/lib/expressions/queries";
import { z } from "zod";

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

/**
 * Replace rather than diff: the lists are short and ordering matters, so
 * rewriting them is both simpler and correct. Shared by the single-record
 * save and the labels grid's bulk save (issue: bulk edit for bottles and
 * labels), which both submit a full ordered list per relation rather than
 * a delta.
 */
async function replaceExpressionLinks(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  target: number,
  linkedDistilleries: LinkRow[],
  linkedMashbills: LinkRow[],
  linkedFinishes: LinkRow[],
) {
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
}

export async function saveExpressionAction(
  id: number | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireSession();

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
          .values(values as typeof expressions.$inferInsert)
          .returning({ id: expressions.id });
        target = row!.id;
      } else {
        await tx
          .update(expressions)
          .set(values as Partial<typeof expressions.$inferInsert>)
          .where(eq(expressions.id, target));
      }

      await replaceExpressionLinks(tx, target, linkedDistilleries, linkedMashbills, linkedFinishes);

      return target;
    });

    revalidatePath("/expressions");
    revalidatePath("/bottles");
    revalidatePath("/");
    return {
      ok: true,
      message: id === null ? "Expression created." : "Expression saved.",
      createdId: expressionId,
    };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Expression" });
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
  await requireSession();
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
        requested: input.slug,
        fallbackFrom: input.name,
      });
      const [inserted] = await db
        .insert(expressions)
        .values({ ...input, slug })
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

const linkRowsArray = z.array(linkRowSchema).max(50);

/** Bulk save from the labels grid's unlocked edit mode (issue: bulk delete
 * and edit for bottles and labels). Same per-row independent save as
 * `saveExpressionsBulkAction` — a bad row should not roll back the good ones
 * next to it — but updates an existing row rather than inserting one, and
 * only ever touches the grid-editable columns (`expressionGridEditSchema`)
 * plus the three link relations, never the hidden field-group sections a
 * full edit-page save protects.
 *
 * Each row always carries its full current distilleries/mashbills/finishes
 * lists (the grid loads them up front to render the pickers), so — same as
 * the single-record save — they are replaced wholesale rather than diffed,
 * even for a row whose links did not actually change; that is idempotent
 * and far simpler than tracking a link-level dirty flag.
 */
export async function updateExpressionsBulkAction(
  rows: Array<
    { id: number; distilleries: unknown; mashbills: unknown; finishes: unknown } & Record<string, unknown>
  >,
): Promise<BulkSaveResult> {
  await requireSession();
  const results: BulkSaveResult["results"] = [];

  for (const [index, { id, distilleries, mashbills, finishes, ...fields }] of rows.entries()) {
    const parsed = expressionGridEditSchema.safeParse(fields);
    const parsedDistilleries = linkRowsArray.safeParse(distilleries);
    const parsedMashbills = linkRowsArray.safeParse(mashbills);
    const parsedFinishes = linkRowsArray.safeParse(finishes);

    if (!parsed.success || !parsedDistilleries.success || !parsedMashbills.success || !parsedFinishes.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
      }
      results.push({
        index,
        ok: false,
        error: parsed.success
          ? "Could not save the linked distilleries, mashbills or finishes."
          : (parsed.error.issues[0]?.message ?? "Please check the highlighted fields."),
        fieldErrors,
      });
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        await tx.update(expressions).set(parsed.data).where(eq(expressions.id, id));
        await replaceExpressionLinks(tx, id, parsedDistilleries.data, parsedMashbills.data, parsedFinishes.data);
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

/** Feeds the labels grid's distillery/mashbill/finish pickers once it
 * unlocks — not loaded on every page view, since most visits never touch
 * edit mode. */
export async function getExpressionLinksAction(
  ids: number[],
): Promise<Array<{ id: number; distilleries: LinkedEntity[]; mashbills: LinkedMashbill[]; finishes: LinkedEntity[] }>> {
  await requireSession();
  const links = await expressionLinksBulk(ids);
  return ids.map((id) => ({ id, ...(links.get(id) ?? { distilleries: [], mashbills: [], finishes: [] }) }));
}

export async function deleteExpressionAction(id: number): Promise<ActionResult> {
  await requireSession();
  try {
    await db.delete(expressions).where(eq(expressions.id, id));
    revalidatePath("/expressions");
    return { ok: true, message: "Expression deleted." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Expression" });
  }
}

/** Bulk delete from the labels grid's unlocked edit mode. A label with
 * bottles still on it is expected to fail here (restrict FK) while the rest
 * of the batch succeeds, so each id is deleted independently. */
export async function deleteExpressionsBulkAction(ids: number[]): Promise<BulkSaveResult> {
  await requireSession();
  const results: BulkSaveResult["results"] = [];

  for (const [index, id] of ids.entries()) {
    try {
      await db.delete(expressions).where(eq(expressions.id, id));
      results.push({ index, ok: true, id });
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
