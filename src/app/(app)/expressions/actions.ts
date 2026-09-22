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
import { writableFields } from "@/lib/expressions/fields";
import { expressionSchema, parseLinks, type ExpressionInput } from "@/lib/expressions/schema";
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
      message: id === null ? "Expression created." : "Expression saved.",
      createdId: expressionId,
    };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Expression" });
  }
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

/** Suggests a slug in the form as you type, so the field is never a surprise. */
export async function previewSlugAction(name: string, batch: string): Promise<string> {
  await requireSession();
  return slugify(`${name}${batch ? ` ${batch}` : ""}`);
}
