"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottleImages, bottles, tastingNotes } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { ImageError, deleteBottleImage, storeBottleImage } from "@/lib/images";
import type { ActionResult } from "@/lib/admin/types";
import { bottleSchema, tastingNoteSchema } from "@/lib/expressions/schema";

function invalid(issues: { path: PropertyKey[]; message: string }[]): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return {
    ok: false,
    error: issues[0]?.message ?? "Please check the highlighted fields.",
    fieldErrors,
  };
}

export async function saveBottleAction(
  id: number | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireSession();

  const parsed = bottleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return invalid(parsed.error.issues);
  const input = parsed.data;

  try {
    if (id === null) {
      const [row] = await db.insert(bottles).values(input).returning({ id: bottles.id });
      revalidatePath("/bottles");
      revalidatePath("/");
      return { ok: true, message: "Bottle added.", createdId: row!.id };
    }
    await db.update(bottles).set(input).where(eq(bottles.id, id));
    revalidatePath("/bottles");
    revalidatePath(`/bottles/${id}`);
    revalidatePath("/");
    return { ok: true, message: "Bottle saved.", createdId: id };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Bottle" });
  }
}

export async function deleteBottleAction(id: number): Promise<ActionResult> {
  await requireSession();
  try {
    // Images cascade in the database; the files on disk do not.
    const images = await db.select().from(bottleImages).where(eq(bottleImages.bottleId, id));
    await db.delete(bottles).where(eq(bottles.id, id));
    await Promise.all(images.map((image) => deleteBottleImage(image.filePath, image.thumbPath)));
    revalidatePath("/bottles");
    revalidatePath("/");
    return { ok: true, message: "Bottle deleted." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Bottle" });
  }
}

// ------------------------------------------------------------
// Images
// ------------------------------------------------------------

export async function uploadBottleImagesAction(bottleId: number, formData: FormData): Promise<ActionResult> {
  await requireSession();

  const files = formData.getAll("images").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return { ok: false, error: "No images were selected." };

  try {
    const [existing] = await db
      .select({ count: sql<number>`count(*)::int`, maxOrder: sql<number>`coalesce(max(${bottleImages.sortOrder}), -1)::int` })
      .from(bottleImages)
      .where(eq(bottleImages.bottleId, bottleId));

    let order = (existing?.maxOrder ?? -1) + 1;
    let isFirst = (existing?.count ?? 0) === 0;

    for (const file of files) {
      const stored = await storeBottleImage(file);
      await db.insert(bottleImages).values({
        bottleId,
        filePath: stored.filePath,
        thumbPath: stored.thumbPath,
        isPrimary: isFirst,
        sortOrder: order,
      });
      order += 1;
      isFirst = false;
    }

    revalidatePath(`/bottles/${bottleId}`);
    revalidatePath("/bottles");
    return { ok: true, message: `${files.length} image${files.length === 1 ? "" : "s"} added.` };
  } catch (error: unknown) {
    if (error instanceof ImageError) return { ok: false, error: error.message };
    return mapDbError(error, { singular: "Image" });
  }
}

export async function deleteBottleImageAction(imageId: number): Promise<ActionResult> {
  await requireSession();
  try {
    const [image] = await db.select().from(bottleImages).where(eq(bottleImages.id, imageId)).limit(1);
    if (!image) return { ok: false, error: "That image is already gone." };

    await db.delete(bottleImages).where(eq(bottleImages.id, imageId));
    await deleteBottleImage(image.filePath, image.thumbPath);

    // Losing the primary must not leave the bottle without one.
    if (image.isPrimary) {
      const [next] = await db
        .select({ id: bottleImages.id })
        .from(bottleImages)
        .where(eq(bottleImages.bottleId, image.bottleId))
        .orderBy(bottleImages.sortOrder)
        .limit(1);
      if (next) await db.update(bottleImages).set({ isPrimary: true }).where(eq(bottleImages.id, next.id));
    }

    revalidatePath(`/bottles/${image.bottleId}`);
    revalidatePath("/bottles");
    return { ok: true, message: "Image removed." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Image" });
  }
}

export async function setPrimaryImageAction(imageId: number): Promise<ActionResult> {
  await requireSession();
  try {
    const [image] = await db.select().from(bottleImages).where(eq(bottleImages.id, imageId)).limit(1);
    if (!image) return { ok: false, error: "That image is already gone." };

    // A partial unique index enforces one primary per bottle, so the old one
    // has to be cleared before the new one is set.
    await db.transaction(async (tx) => {
      await tx
        .update(bottleImages)
        .set({ isPrimary: false })
        .where(and(eq(bottleImages.bottleId, image.bottleId), ne(bottleImages.id, imageId)));
      await tx.update(bottleImages).set({ isPrimary: true }).where(eq(bottleImages.id, imageId));
    });

    revalidatePath(`/bottles/${image.bottleId}`);
    revalidatePath("/bottles");
    return { ok: true, message: "Primary image set." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Image" });
  }
}

export async function reorderBottleImagesAction(bottleId: number, orderedIds: number[]): Promise<ActionResult> {
  await requireSession();
  try {
    await db.transaction(async (tx) => {
      for (const [index, imageId] of orderedIds.entries()) {
        await tx
          .update(bottleImages)
          .set({ sortOrder: index })
          .where(and(eq(bottleImages.id, imageId), eq(bottleImages.bottleId, bottleId)));
      }
    });
    revalidatePath(`/bottles/${bottleId}`);
    return { ok: true, message: "Order saved." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Image" });
  }
}

// ------------------------------------------------------------
// Tasting notes
// ------------------------------------------------------------

export async function saveTastingNoteAction(
  bottleId: number,
  noteId: number | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireSession();

  const parsed = tastingNoteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return invalid(parsed.error.issues);

  try {
    if (noteId === null) {
      await db.insert(tastingNotes).values({ bottleId, ...parsed.data });
    } else {
      await db.update(tastingNotes).set(parsed.data).where(eq(tastingNotes.id, noteId));
    }
    revalidatePath(`/bottles/${bottleId}`);
    revalidatePath("/bottles");
    return { ok: true, message: noteId === null ? "Note added." : "Note saved." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Tasting note" });
  }
}

export async function deleteTastingNoteAction(bottleId: number, noteId: number): Promise<ActionResult> {
  await requireSession();
  try {
    await db.delete(tastingNotes).where(eq(tastingNotes.id, noteId));
    revalidatePath(`/bottles/${bottleId}`);
    return { ok: true, message: "Note deleted." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Tasting note" });
  }
}
