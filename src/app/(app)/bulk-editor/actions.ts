"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { expressions } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { loadLinks } from "@/lib/expressions/form-data";
import { createRow, deleteImpact, deleteRows, patchBottleRow, patchLabelRow, type CreateOutcome, type DeleteOutcome, type PatchOutcome } from "@/lib/bulk-editor/rows";

/**
 * The bulk editor's saves, one row at a time, in the signed-in account. The work and its rules are in
 * `@/lib/bulk-editor/rows`; these only sign the caller in and refresh the pages that list what changed.
 */

function refresh() {
  revalidatePath("/bottles");
  revalidatePath("/expressions");
  revalidatePath("/");
}

/**
 * A label's distilleries, mashbills, finishes (with their pairs) and ingredients, exactly as the label form's edit page
 * loads them, for the cell that opens the form's own pickers. Null when the label is not the caller's.
 */
export async function labelLinksAction(labelId: number) {
  const user = await requireSession();
  if (!Number.isInteger(labelId) || labelId <= 0) return null;
  if ((await db.$count(expressions, and(eq(expressions.id, labelId), eq(expressions.ownerId, user.id)))) === 0) return null;
  return loadLinks(labelId);
}

/** A new label and/or bottle (see `createRow`). The brand and label are created if they are new. */
export async function createRowAction(raw: unknown): Promise<CreateOutcome> {
  const user = await requireSession();
  const outcome = await createRow(user.id, raw);
  if (outcome.ok) refresh();
  return outcome;
}

/** Changes only the bottle columns sent; changing its label moves it (see `patchBottleRow`). */
export async function patchBottleRowAction(bottleId: number, raw: unknown): Promise<PatchOutcome> {
  const user = await requireSession();
  const outcome = await patchBottleRow(user.id, bottleId, raw);
  if (outcome.ok) refresh();
  return outcome;
}

/** Changes only the label facts sent, for every bottle on it (see `patchLabelRow`). */
export async function patchLabelRowAction(labelId: number, raw: unknown): Promise<PatchOutcome> {
  const user = await requireSession();
  const outcome = await patchLabelRow(user.id, labelId, raw);
  if (outcome.ok) refresh();
  return outcome;
}

/** What deleting these rows would take with them, for the confirmation (see `deleteImpact`). */
export async function deleteImpactAction(input: { labelIds: number[]; bottleIds: number[] }) {
  const user = await requireSession();
  return deleteImpact(user.id, input);
}

/** Deletes the chosen rows: a label with all its bottles, a bottle alone (see `deleteRows`). */
export async function deleteRowsAction(input: { labelIds: number[]; bottleIds: number[] }): Promise<DeleteOutcome> {
  const user = await requireSession();
  // Bounded, and ids only: nothing else from the browser is read.
  const ids = (list: unknown) => (Array.isArray(list) ? list.filter((id): id is number => typeof id === "number").slice(0, 5000) : []);
  const outcome = await deleteRows(user.id, { labelIds: ids(input?.labelIds), bottleIds: ids(input?.bottleIds) });
  if (outcome.deletedLabels + outcome.deletedBottles > 0) refresh();
  return outcome;
}
