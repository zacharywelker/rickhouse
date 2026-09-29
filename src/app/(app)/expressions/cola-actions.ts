"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottleImages, bottles, expressionColas } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { copyToBottleImage, ImageError } from "@/lib/images";
import type { ActionResult } from "@/lib/admin/types";
import { normalizeTtbId } from "@/lib/cola/ids";
import {
  attachCola,
  colaFilesForCola,
  colaLookupEnabled,
  deleteColaFiles,
  ownedCola,
  ownedColaImage,
  refreshCola,
} from "@/lib/cola/store";

/**
 * TTB label approvals on a label (SPEC M11). Scoped to the signed-in account
 * like every other action: someone else's label or COLA reads as gone.
 */

function revalidateLabel(expressionId: number) {
  revalidatePath(`/expressions/${expressionId}/edit`);
  // Bottle pages show their label's approvals.
  revalidatePath("/bottles/[id]", "page");
}

const BAD_ID = "A TTB ID is 14 digits, like 21132001000620. Paste the number or the registry link.";

/** Adds a TTB ID to a label and, when lookups are on, fetches it straight away. */
export async function addColaAction(expressionId: number, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireSession();
  const ttbId = normalizeTtbId(String(formData.get("ttbId") ?? ""));
  if (!ttbId) return { ok: false, error: BAD_ID, fieldErrors: { ttbId: BAD_ID } };

  let cola;
  try {
    cola = await attachCola(expressionId, user.id, ttbId);
  } catch (error: unknown) {
    return mapDbError(error, { singular: "COLA" });
  }
  if (cola === "gone") return { ok: false, error: "That label is gone." };
  if (cola === "duplicate") return { ok: false, error: `${ttbId} is already on this label.` };

  revalidateLabel(expressionId);
  if (!colaLookupEnabled()) return { ok: true, message: `Added ${ttbId}.` };

  const fetched = await refreshCola(cola.id, user.id);
  // The ID is kept either way; a failed lookup is shown on the row and can be retried.
  return fetched.ok ? fetched : { ok: true, message: `Added ${ttbId}, but the lookup failed: ${fetched.error}` };
}

export async function refreshColaAction(colaId: number): Promise<ActionResult> {
  const user = await requireSession();
  const result = await refreshCola(colaId, user.id);
  const cola = await ownedCola(colaId, user.id);
  if (cola) revalidateLabel(cola.expressionId);
  return result;
}

export async function removeColaAction(colaId: number): Promise<ActionResult> {
  const user = await requireSession();
  const cola = await ownedCola(colaId, user.id);
  if (!cola) return { ok: false, error: "That COLA is gone." };
  const files = await colaFilesForCola(colaId);
  await db.delete(expressionColas).where(and(eq(expressionColas.id, colaId), eq(expressionColas.ownerId, user.id)));
  await deleteColaFiles(files);
  revalidateLabel(cola.expressionId);
  return { ok: true, message: `Removed ${cola.ttbId}.` };
}

/**
 * Copies an approved label panel into a bottle's photos as a catalog shot.
 * The bottle has to be a bottle of the label the COLA is on.
 */
export async function copyColaImageToBottleAction(colaImageId: number, bottleId: number): Promise<ActionResult> {
  const user = await requireSession();
  const found = await ownedColaImage(colaImageId, user.id);
  if (!found) return { ok: false, error: "That label image is gone." };
  const [bottle] = await db
    .select({ expressionId: bottles.expressionId })
    .from(bottles)
    .where(and(eq(bottles.id, bottleId), eq(bottles.ownerId, user.id)))
    .limit(1);
  if (!bottle || bottle.expressionId !== found.expressionId) return { ok: false, error: "That bottle is gone." };

  try {
    const stored = await copyToBottleImage(found.image.filePath);
    const [existing] = await db
      .select({ count: sql<number>`count(*)::int`, maxOrder: sql<number>`coalesce(max(${bottleImages.sortOrder}), -1)::int` })
      .from(bottleImages)
      .where(eq(bottleImages.bottleId, bottleId));
    await db.insert(bottleImages).values({
      bottleId,
      filePath: stored.filePath,
      thumbPath: stored.thumbPath,
      caption: found.image.panel,
      kind: "catalog",
      // The first photo becomes the hero, as with an upload.
      isPrimary: (existing?.count ?? 0) === 0,
      sortOrder: (existing?.maxOrder ?? -1) + 1,
    });
  } catch (error: unknown) {
    if (error instanceof ImageError) return { ok: false, error: error.message };
    return mapDbError(error, { singular: "Image" });
  }
  revalidatePath(`/bottles/${bottleId}`);
  revalidatePath("/bottles");
  return { ok: true, message: "Added to this bottle's photos." };
}
