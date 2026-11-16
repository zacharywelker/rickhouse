"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
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

const DELETE_LIMIT = 5000;
const selectedIds = (list: unknown) => Array.isArray(list)
  ? [...new Set(list.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0))]
  : [];

/** What deleting these rows would take with them, for the confirmation (see `deleteImpact`). */
export async function deleteImpactAction(input: { labelIds: number[]; bottleIds: number[] }) {
  const user = await requireSession();
  const labelIds = selectedIds(input?.labelIds);
  const bottleIds = selectedIds(input?.bottleIds);
  const impact = await deleteImpact(user.id, { labelIds: labelIds.slice(0, DELETE_LIMIT), bottleIds: bottleIds.slice(0, DELETE_LIMIT) });
  return {
    ...impact,
    excluded: Math.max(0, labelIds.length - DELETE_LIMIT) + Math.max(0, bottleIds.length - DELETE_LIMIT),
  };
}

/** Deletes the chosen rows: a label with all its bottles, a bottle alone (see `deleteRows`). */
export async function deleteRowsAction(input: { labelIds: number[]; bottleIds: number[] }): Promise<DeleteOutcome> {
  const user = await requireSession();
  const labelIds = selectedIds(input?.labelIds);
  const bottleIds = selectedIds(input?.bottleIds);
  const outcome = await deleteRows(user.id, { labelIds: labelIds.slice(0, DELETE_LIMIT), bottleIds: bottleIds.slice(0, DELETE_LIMIT) });
  for (const id of labelIds.slice(DELETE_LIMIT)) {
    outcome.failed.push({ kind: "label", id, error: "Only the first 5,000 selected labels can be deleted at once." });
  }
  const deletedBottles = new Set(outcome.deletedBottleIds);
  for (const id of bottleIds.slice(DELETE_LIMIT)) {
    if (!deletedBottles.has(id)) {
      outcome.failed.push({ kind: "bottle", id, error: "Only the first 5,000 selected bottles can be deleted at once." });
    }
  }
  if (outcome.deletedLabels + outcome.deletedBottles > 0) refresh();
  return outcome;
}
