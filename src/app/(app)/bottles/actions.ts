"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { bottleImages, bottles, tastingNotes } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { deleteStoredImage } from "@/lib/images";
import type { ActionResult } from "@/lib/admin/types";
import type { BulkSaveResult } from "@/lib/bulk/types";
import { z } from "zod";
import { bottleGridEditSchema, bottleSchema, tastingNoteSchema } from "@/lib/expressions/schema";

/**
 * Every write below is scoped to the signed-in account. A bottle id that is
 * someone else's matches nothing, so it reads as "gone" — the same answer a
 * deleted bottle gets, which gives nothing away. Label and store ids on a
 * bottle are held to the same owner by composite foreign keys in Postgres.
 */
function ownedBottle(id: number, ownerId: number) {
  return and(eq(bottles.id, id), eq(bottles.ownerId, ownerId));
}

/** The image, provided its bottle belongs to `ownerId`. */
async function ownedImage(imageId: number, ownerId: number) {
  const [row] = await db
    .select({ image: bottleImages })
    .from(bottleImages)
    .innerJoin(bottles, eq(bottles.id, bottleImages.bottleId))
    .where(and(eq(bottleImages.id, imageId), eq(bottles.ownerId, ownerId)))
    .limit(1);
  return row?.image ?? null;
}

async function ownsBottle(bottleId: number, ownerId: number): Promise<boolean> {
  return (await db.$count(bottles, ownedBottle(bottleId, ownerId))) > 0;
}

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
  const user = await requireSession();

  const parsed = bottleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return invalid(parsed.error.issues);
  const input = parsed.data;

  try {
    if (id === null) {
      const [row] = await db
        .insert(bottles)
        .values({ ...input, ownerId: user.id })
        .returning({ id: bottles.id });
      revalidatePath("/bottles");
      revalidatePath("/");
      return { ok: true, message: "Bottle added.", createdId: row!.id };
    }
    const updated = await db.update(bottles).set(input).where(ownedBottle(id, user.id)).returning({ id: bottles.id });
    if (updated.length === 0) return { ok: false, error: "That bottle is gone." };
    revalidatePath("/bottles");
    revalidatePath(`/bottles/${id}`);
    revalidatePath("/");
    return { ok: true, message: "Bottle saved.", createdId: id };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Bottle" });
  }
}

/**
 * Bulk grid save (Issue #49). Each row is validated and inserted on its own —
 * not wrapped in one shared transaction — because the rows are independent
 * bottles with no cross-row constraint, and a bad row should never roll back
 * the good ones next to it.
 */
export async function saveBottlesBulkAction(rows: Record<string, unknown>[]): Promise<BulkSaveResult> {
  const user = await requireSession();
  const results: BulkSaveResult["results"] = [];

  for (const [index, row] of rows.entries()) {
    const parsed = bottleSchema.safeParse(row);
    if (!parsed.success) {
      const shaped = invalid(parsed.error.issues);
      results.push({
        index,
        ok: false,
        error: shaped.ok ? "Could not save this row." : shaped.error,
        fieldErrors: shaped.ok ? {} : (shaped.fieldErrors ?? {}),
      });
      continue;
    }
    try {
      const [inserted] = await db
        .insert(bottles)
        .values({ ...parsed.data, ownerId: user.id })
        .returning({ id: bottles.id });
      results.push({ index, ok: true, id: inserted!.id });
    } catch (error: unknown) {
      const shaped = mapDbError(error, { singular: "Bottle" });
      results.push({
        index,
        ok: false,
        error: shaped.ok ? "Could not save this row." : shaped.error,
        fieldErrors: shaped.ok ? {} : (shaped.fieldErrors ?? {}),
      });
    }
  }

  if (results.some((r) => r.ok)) {
    revalidatePath("/bottles");
    revalidatePath("/");
  }

  return { savedCount: results.filter((r) => r.ok).length, results };
}

export async function deleteBottleAction(id: number): Promise<ActionResult> {
  const user = await requireSession();
  try {
    if (!(await ownsBottle(id, user.id))) return { ok: false, error: "That bottle is gone." };
    // Images cascade in the database; the files on disk do not.
    const images = await db.select().from(bottleImages).where(eq(bottleImages.bottleId, id));
    await db.delete(bottles).where(ownedBottle(id, user.id));
    await Promise.all(images.map((image) => deleteStoredImage(image.filePath, image.thumbPath)));
    revalidatePath("/bottles");
    revalidatePath("/");
    return { ok: true, message: "Bottle deleted." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Bottle" });
  }
}

/** Bulk delete from the collection grid's unlocked edit mode. Each bottle is
 * removed independently — one restrict-FK or already-gone id should not
 * abort the rest of the batch. */
export async function deleteBottlesBulkAction(ids: number[]): Promise<BulkSaveResult> {
  const user = await requireSession();
  const results: BulkSaveResult["results"] = [];

  for (const [index, id] of ids.entries()) {
    try {
      // Checked first so another account's photos are never touched on disk.
      if (!(await ownsBottle(id, user.id))) {
        results.push({ index, ok: false, error: "That bottle is gone.", fieldErrors: {} });
        continue;
      }
      const images = await db.select().from(bottleImages).where(eq(bottleImages.bottleId, id));
      await db.delete(bottles).where(ownedBottle(id, user.id));
      await Promise.all(images.map((image) => deleteStoredImage(image.filePath, image.thumbPath)));
      results.push({ index, ok: true, id });
    } catch (error: unknown) {
      const shaped = mapDbError(error, { singular: "Bottle" });
      results.push({
        index,
        ok: false,
        error: shaped.ok ? "Could not delete this bottle." : shaped.error,
        fieldErrors: {},
      });
    }
  }

  if (results.some((r) => r.ok)) {
    revalidatePath("/bottles");
    revalidatePath("/");
  }

  return { savedCount: results.filter((r) => r.ok).length, results };
}

/** Bulk save from the collection grid's unlocked edit mode (issue: bulk edit).
 * Each row is validated and saved on its own, same reasoning as
 * `saveBottlesBulkAction`: a bad row should not roll back the good ones. */
export async function updateBottlesBulkAction(
  rows: Array<{ id: number } & Record<string, unknown>>,
): Promise<BulkSaveResult> {
  const user = await requireSession();
  const results: BulkSaveResult["results"] = [];

  for (const [index, { id, ...fields }] of rows.entries()) {
    const parsed = bottleGridEditSchema.safeParse(fields);
    if (!parsed.success) {
      const shaped = invalid(parsed.error.issues);
      results.push({
        index,
        ok: false,
        error: shaped.ok ? "Could not save this row." : shaped.error,
        fieldErrors: shaped.ok ? {} : (shaped.fieldErrors ?? {}),
      });
      continue;
    }
    try {
      const updated = await db
        .update(bottles)
        .set(parsed.data)
        .where(ownedBottle(id, user.id))
        .returning({ id: bottles.id });
      results.push(
        updated.length > 0 ? { index, ok: true, id } : { index, ok: false, error: "That bottle is gone.", fieldErrors: {} },
      );
    } catch (error: unknown) {
      const shaped = mapDbError(error, { singular: "Bottle" });
      results.push({
        index,
        ok: false,
        error: shaped.ok ? "Could not save this row." : shaped.error,
        fieldErrors: shaped.ok ? {} : (shaped.fieldErrors ?? {}),
      });
    }
  }

  if (results.some((r) => r.ok)) {
    revalidatePath("/bottles");
    revalidatePath("/");
  }

  return { savedCount: results.filter((r) => r.ok).length, results };
}

// ------------------------------------------------------------
// Images
// ------------------------------------------------------------

export async function deleteBottleImageAction(imageId: number): Promise<ActionResult> {
  const user = await requireSession();
  try {
    const image = await ownedImage(imageId, user.id);
    if (!image) return { ok: false, error: "That image is already gone." };

    await db.delete(bottleImages).where(eq(bottleImages.id, imageId));
    await deleteStoredImage(image.filePath, image.thumbPath);

    // Losing the primary must not leave the bottle without one.
    if (image.isPrimary) {
      const [next] = await db
        .select({ id: bottleImages.id })
        .from(bottleImages)
        .where(eq(bottleImages.bottleId, image.bottleId))
        .orderBy(bottleImages.sortOrder)
        .limit(1);
      if (next) await db.update(bottleImages).set({ isPrimary: true, kind: "catalog" }).where(eq(bottleImages.id, next.id));
    }

    revalidatePath(`/bottles/${image.bottleId}`);
    revalidatePath("/bottles");
    return { ok: true, message: "Image removed." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Image" });
  }
}

export async function setPrimaryImageAction(imageId: number): Promise<ActionResult> {
  const user = await requireSession();
  try {
    const image = await ownedImage(imageId, user.id);
    if (!image) return { ok: false, error: "That image is already gone." };

    // A partial unique index enforces one primary per bottle, so the old one
    // has to be cleared before the new one is set. The hero photo is always
    // the catalog photo, so kind rides along with isPrimary.
    await db.transaction(async (tx) => {
      await tx
        .update(bottleImages)
        .set({ isPrimary: false, kind: "life" })
        .where(and(eq(bottleImages.bottleId, image.bottleId), ne(bottleImages.id, imageId)));
      await tx.update(bottleImages).set({ isPrimary: true, kind: "catalog" }).where(eq(bottleImages.id, imageId));
    });

    revalidatePath(`/bottles/${image.bottleId}`);
    revalidatePath("/bottles");
    return { ok: true, message: "Hero image set." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Image" });
  }
}

export async function reorderBottleImagesAction(bottleId: number, orderedIds: number[]): Promise<ActionResult> {
  const user = await requireSession();
  try {
    if (!(await ownsBottle(bottleId, user.id))) return { ok: false, error: "That bottle is gone." };
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
  const user = await requireSession();

  const parsed = tastingNoteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return invalid(parsed.error.issues);

  try {
    if (!(await ownsBottle(bottleId, user.id))) return { ok: false, error: "That bottle is gone." };
    if (noteId === null) {
      await db.insert(tastingNotes).values({ bottleId, ...parsed.data });
    } else {
      await db
        .update(tastingNotes)
        .set(parsed.data)
        .where(and(eq(tastingNotes.id, noteId), eq(tastingNotes.bottleId, bottleId)));
    }
    revalidatePath(`/bottles/${bottleId}`);
    revalidatePath("/bottles");
    return { ok: true, message: noteId === null ? "Note added." : "Note saved." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Tasting note" });
  }
}

export async function deleteTastingNoteAction(bottleId: number, noteId: number): Promise<ActionResult> {
  const user = await requireSession();
  try {
    if (!(await ownsBottle(bottleId, user.id))) return { ok: false, error: "That bottle is gone." };
    await db.delete(tastingNotes).where(and(eq(tastingNotes.id, noteId), eq(tastingNotes.bottleId, bottleId)));
    revalidatePath(`/bottles/${bottleId}`);
    return { ok: true, message: "Note deleted." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Tasting note" });
  }
}

// ------------------------------------------------------------
// Fill level and open/closed
// ------------------------------------------------------------

const fillSchema = z.coerce.number().int().min(0).max(100);

/**
 * Sets the level. Deliberately does not decide anything else: dropping to
 * empty prompts in the UI, and killing the bottle is a separate, explicit act
 * (SPEC M4).
 */
export async function setBottleFillAction(bottleId: number, fillPct: number): Promise<ActionResult> {
  const user = await requireSession();
  const parsed = fillSchema.safeParse(fillPct);
  if (!parsed.success) return { ok: false, error: "A fill level is 0 to 100." };

  try {
    const updated = await db
      .update(bottles)
      .set({ fillPct: parsed.data })
      .where(ownedBottle(bottleId, user.id))
      .returning({ id: bottles.id });
    if (updated.length === 0) return { ok: false, error: "That bottle is gone." };
    revalidatePath(`/bottles/${bottleId}`);
    revalidatePath("/bottles");
    return { ok: true, message: `Set to ${parsed.data}%.` };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Bottle" });
  }
}

/** Toggled from the heart next to the bottle's name — not a form field. */
export async function setBottleFavoriteAction(bottleId: number, isFavorite: boolean): Promise<ActionResult> {
  const user = await requireSession();
  try {
    const updated = await db
      .update(bottles)
      .set({ isFavorite })
      .where(ownedBottle(bottleId, user.id))
      .returning({ id: bottles.id });
    if (updated.length === 0) return { ok: false, error: "That bottle is gone." };
    revalidatePath(`/bottles/${bottleId}`);
    revalidatePath("/bottles");
    return { ok: true, message: isFavorite ? "Favorited." : "Unfavorited." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Bottle" });
  }
}

/**
 * Opening stamps `date_opened` the first time and promotes the status from
 * owned to open. Closing it again leaves both alone — the bottle was still
 * opened on that date, and the status is not a lie once it is true.
 */
export async function setBottleOpenAction(bottleId: number, isOpen: boolean): Promise<ActionResult> {
  const user = await requireSession();
  try {
    const [current] = await db
      .select({ dateOpened: bottles.dateOpened, status: bottles.status })
      .from(bottles)
      .where(ownedBottle(bottleId, user.id))
      .limit(1);
    if (!current) return { ok: false, error: "That bottle is gone." };

    const today = new Date().toISOString().slice(0, 10);
    await db
      .update(bottles)
      .set({
        isOpen,
        ...(isOpen && current.dateOpened === null ? { dateOpened: today } : {}),
        ...(isOpen && current.status === "owned" ? { status: "open" as const } : {}),
      })
      .where(ownedBottle(bottleId, user.id));

    revalidatePath(`/bottles/${bottleId}`);
    revalidatePath("/bottles");
    return { ok: true, message: isOpen ? "Opened." : "Closed." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Bottle" });
  }
}

/**
 * Corrects a stamped date (SPEC M8). Opening a bottle stamps today, which is
 * wrong for the one you opened three months ago and are only now logging.
 *
 * A blank clears it. Clearing the opened date also closes the bottle, because
 * "open, opened on no date" is a state the rest of the app does not mean.
 */
export async function setBottleDateAction(
  bottleId: number,
  field: "dateOpened" | "dateKilled",
  value: string | null,
): Promise<ActionResult> {
  const user = await requireSession();

  const date = (value ?? "").trim();
  if (date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "Use a date like 2025-06-14." };
  }
  if (date !== "" && Number.isNaN(Date.parse(date))) {
    return { ok: false, error: "That is not a real date." };
  }
  if (date > new Date().toISOString().slice(0, 10)) {
    return { ok: false, error: "That date is in the future." };
  }

  try {
    const [current] = await db
      .select({ dateOpened: bottles.dateOpened, dateKilled: bottles.dateKilled })
      .from(bottles)
      .where(ownedBottle(bottleId, user.id))
      .limit(1);
    if (!current) return { ok: false, error: "That bottle is gone." };

    const next = date === "" ? null : date;
    const other = field === "dateOpened" ? current.dateKilled : current.dateOpened;

    // A bottle cannot be killed before it was opened.
    if (next && other) {
      const [opened, killed] = field === "dateOpened" ? [next, other] : [other, next];
      if (killed < opened) {
        return { ok: false, error: "Killed before it was opened — check these dates." };
      }
    }

    await db
      .update(bottles)
      .set({
        [field]: next,
        ...(field === "dateOpened" && next === null ? { isOpen: false } : {}),
      })
      .where(ownedBottle(bottleId, user.id));

    revalidatePath(`/bottles/${bottleId}`);
    revalidatePath("/bottles");
    return { ok: true, message: next === null ? "Date cleared." : "Date updated." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Bottle" });
  }
}

/** Empty and done: status killed, level zero, dated today. */
export async function killBottleAction(bottleId: number): Promise<ActionResult> {
  const user = await requireSession();
  try {
    const updated = await db
      .update(bottles)
      .set({
        fillPct: 0,
        status: "killed",
        isOpen: true,
        dateKilled: new Date().toISOString().slice(0, 10),
      })
      .where(ownedBottle(bottleId, user.id))
      .returning({ id: bottles.id });
    if (updated.length === 0) return { ok: false, error: "That bottle is gone." };
    revalidatePath(`/bottles/${bottleId}`);
    revalidatePath("/bottles");
    return { ok: true, message: "Marked as killed." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Bottle" });
  }
}
