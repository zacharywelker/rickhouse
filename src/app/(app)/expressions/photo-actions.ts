"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bottleImages, bottles, expressions } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { contentTypeFor, deleteStoredImage, resolveUpload, storeBottleImageBytes } from "@/lib/images";
import { readFile } from "node:fs/promises";
import type { ActionResult } from "@/lib/admin/types";

/** Copies keep the two sides independent: deleting either never breaks the other. */
async function copyStored(relative: string) {
  return storeBottleImageBytes(await readFile(resolveUpload(relative)), contentTypeFor(relative));
}

/** Makes one of a bottle's photos the photo of its label. */
export async function setLabelPhotoFromBottleImageAction(imageId: number): Promise<ActionResult> {
  const user = await requireSession();
  try {
    const [row] = await db
      .select({ filePath: bottleImages.filePath, expressionId: bottles.expressionId, bottleId: bottles.id })
      .from(bottleImages)
      .innerJoin(bottles, eq(bottles.id, bottleImages.bottleId))
      .where(and(eq(bottleImages.id, imageId), eq(bottles.ownerId, user.id)))
      .limit(1);
    if (!row) return { ok: false, error: "That image is already gone." };

    const [previous] = await db
      .select({ photoPath: expressions.photoPath, photoThumbPath: expressions.photoThumbPath })
      .from(expressions)
      .where(and(eq(expressions.id, row.expressionId), eq(expressions.ownerId, user.id)))
      .limit(1);

    const stored = await copyStored(row.filePath);
    await db
      .update(expressions)
      .set({ photoPath: stored.filePath, photoThumbPath: stored.thumbPath })
      .where(and(eq(expressions.id, row.expressionId), eq(expressions.ownerId, user.id)));
    if (previous?.photoPath) await deleteStoredImage(previous.photoPath, previous.photoThumbPath);

    revalidatePath(`/expressions/${row.expressionId}`);
    revalidatePath(`/bottles/${row.bottleId}`);
    return { ok: true, message: "Now the label's photo." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Image" });
  }
}

export async function removeLabelPhotoAction(expressionId: number): Promise<ActionResult> {
  const user = await requireSession();
  try {
    const [previous] = await db
      .select({ photoPath: expressions.photoPath, photoThumbPath: expressions.photoThumbPath })
      .from(expressions)
      .where(and(eq(expressions.id, expressionId), eq(expressions.ownerId, user.id)))
      .limit(1);
    if (!previous) return { ok: false, error: "That label is gone." };
    await db
      .update(expressions)
      .set({ photoPath: null, photoThumbPath: null })
      .where(and(eq(expressions.id, expressionId), eq(expressions.ownerId, user.id)));
    if (previous.photoPath) await deleteStoredImage(previous.photoPath, previous.photoThumbPath);
    revalidatePath(`/expressions/${expressionId}`);
    return { ok: true, message: "Photo removed." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Label" });
  }
}
