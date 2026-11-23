"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import type { ActionResult } from "@/lib/admin/types";
import { dismiss } from "@/lib/housekeeping/dismissals";
import { DUPLICATE_KINDS, type DuplicateKind } from "@/lib/housekeeping/duplicate-kinds";
import { HousekeepingMergeError, mergeReference } from "@/lib/housekeeping/merge-reference";
import { describeMoves } from "@/lib/housekeeping/move-text";
import { duplicateScope, pairKey } from "@/lib/housekeeping/pair-key";

const kindOf = (value: unknown): DuplicateKind | null =>
  typeof value === "string" ? (DUPLICATE_KINDS.find((kind) => kind === value) ?? null) : null;
const idOf = (value: unknown): number | null => (typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null);

const GONE = "That pair has already been merged or removed.";
const BAD_REQUEST: ActionResult = { ok: false, error: "That request did not make sense. Reload the page and try again." };

/**
 * Merges the removed row into the survivor. The account is the signed-in one, never anything in the request; the kind,
 * the ids and the fields to adopt are checked here and again by the engine.
 */
export async function mergePairAction(input: { kind: string; survivorId: number; removedId: number; adopt: string[] }): Promise<ActionResult> {
  const user = await requireSession();
  const kind = kindOf(input?.kind);
  const survivorId = idOf(input?.survivorId);
  const removedId = idOf(input?.removedId);
  if (!kind || !survivorId || !removedId || survivorId === removedId) return BAD_REQUEST;
  const adopt = Array.isArray(input.adopt) ? input.adopt.filter((field): field is string => typeof field === "string").slice(0, 30) : [];

  try {
    const summary = await mergeReference(user.id, kind, survivorId, removedId, adopt);
    revalidatePath("/housekeeping");
    const moved = describeMoves(summary.moves);
    return { ok: true, message: `Merged “${summary.removedName}” into “${summary.survivorName}”.${moved ? ` ${moved} moved.` : ""}` };
  } catch (error) {
    if (error instanceof HousekeepingMergeError) return { ok: false, error: error.code === "gone" ? GONE : error.message };
    console.error("[housekeeping] merge failed", error);
    return { ok: false, error: "The merge did not go through. Nothing was changed." };
  }
}

/** Remembers that two rows are not the same thing, so the pair is not offered again. */
export async function dismissPairAction(input: { kind: string; aId: number; bId: number }): Promise<ActionResult> {
  const user = await requireSession();
  const kind = kindOf(input?.kind);
  const aId = idOf(input?.aId);
  const bId = idOf(input?.bId);
  if (!kind || !aId || !bId || aId === bId) return BAD_REQUEST;
  try {
    await dismiss(user.id, duplicateScope(kind), pairKey(aId, bId));
    revalidatePath("/housekeeping");
    return { ok: true, message: "Marked as different. It won’t be suggested again." };
  } catch (error) {
    console.error("[housekeeping] dismiss failed", error);
    return { ok: false, error: "That did not save. Try again." };
  }
}
