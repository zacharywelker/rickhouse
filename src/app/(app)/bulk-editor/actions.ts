"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { createRow, deleteImpact, patchBottleRow, patchLabelRow, type CreateOutcome, type PatchOutcome } from "@/lib/bulk-editor/rows";

/**
 * The bulk editor's saves, one row at a time, in the signed-in account. The work and its rules are in
 * `@/lib/bulk-editor/rows`; these only sign the caller in and refresh the pages that list what changed.
 */

function refresh() {
  revalidatePath("/bottles");
  revalidatePath("/expressions");
  revalidatePath("/");
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
