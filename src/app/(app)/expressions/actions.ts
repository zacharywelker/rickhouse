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
  parseLinks,
  type ExpressionInput,
  type LinkRow,
} from "@/lib/expressions/schema";
import { fieldGroupForCategory } from "@/lib/expressions/queries";

/**
 * Fields every category writes, whatever its field group. Anything outside
 * this set belongs to a section that may be hidden.
 */
const COMMON_FIELDS = new Set(writableFields("other"));

/**
 * Keeps only the columns this category may write, dropping anything whose
 * section is not visible for its field group (and anything left undefined,
 * which a partial grid edit uses for "not changed").
 *
 * This is what makes "hidden fields must not be cleared silently" true: switch
 * a Rum to a Bourbon and the rum columns are simply not part of the update, so
 * the ester count survives to be there again if you switch back.
 */
function writableValues(values: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (key === "slug" || COMMON_FIELDS.has(key) || allowed.has(key)) kept[key] = value;
  }
  return kept;
}

function valuesForGroup(input: ExpressionInput, allowed: Set<string>, slug: string) {
  return writableValues({ ...input, slug }, allowed);
}

function fieldErrorsOf(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Links = { distilleries: LinkRow[]; mashbills: LinkRow[]; finishes: LinkRow[] };

/** The three ordered lists, from a form or a grid row — both send the same JSON. */
function linksFrom(source: { distilleryLinks?: unknown; mashbillLinks?: unknown; finishLinks?: unknown }): Links {
  return {
    distilleries: parseLinks(source.distilleryLinks),
    mashbills: parseLinks(source.mashbillLinks),
    finishes: parseLinks(source.finishLinks),
  };
}

/**
 * Replace rather than diff: the lists are short and ordering matters, so
 * rewriting them is both simpler and correct. Always all three together —
 * which distillery made each mashbill depends on the distillery list.
 */
async function replaceLinks(tx: Tx, expressionId: number, links: Links) {
  await tx.delete(expressionDistilleries).where(eq(expressionDistilleries.expressionId, expressionId));
  await tx.delete(expressionMashbills).where(eq(expressionMashbills.expressionId, expressionId));
  await tx.delete(expressionFinishes).where(eq(expressionFinishes.expressionId, expressionId));
  await insertLinks(tx, expressionId, links);
}

async function insertLinks(tx: Tx, expressionId: number, links: Links) {
  const { distilleries: linkedDistilleries, mashbills: linkedMashbills, finishes: linkedFinishes } = links;

  if (linkedDistilleries.length > 0) {
    await tx.insert(expressionDistilleries).values(
      linkedDistilleries.map((row, position) => ({
        expressionId,
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
        expressionId,
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
        expressionId,
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
      await replaceLinks(tx, target, links);
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
  await requireSession();
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
        requested: input.slug,
        fallbackFrom: input.name,
      });
      const id = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(expressions)
          .values(valuesForGroup(input, allowed, slug) as typeof expressions.$inferInsert)
          .returning({ id: expressions.id });
        await insertLinks(tx, inserted!.id, linksFrom(row));
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
  await requireSession();
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
        .where(eq(expressions.id, id))
        .limit(1);
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
            .where(eq(expressions.id, id));
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
