"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { expressionReleases } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { deleteStoredImage } from "@/lib/images";
import { parseReleaseRow, type ReleaseRow } from "@/lib/releases";
import { releaseById } from "@/lib/releases-store";
import type { ActionResult } from "@/lib/admin/types";

const MAX_NOTES = 4000;

function revalidateRelease(expressionId: number, releaseId: number) {
  revalidatePath(`/expressions/${expressionId}`);
  revalidatePath(`/expressions/${expressionId}/releases/${releaseId}`);
  revalidatePath("/bottles");
}

/**
 * The release page's form. It writes the same row the label form's release
 * rows do, so whichever saved last is what both show — nothing is kept twice.
 */
export async function saveReleaseAction(releaseId: number, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireSession();
  // Someone else's release reads as gone, like everything else.
  const release = await releaseById(releaseId, user.id);
  if (!release) return { ok: false, error: "That release is gone." };

  const row: Partial<ReleaseRow> = {};
  for (const key of ["name", "year", "proof", "ageYears", "ageMonths", "ageDays", "msrp"] as const) {
    row[key] = String(formData.get(key) ?? "");
  }
  // Not on this form; kept as it was.
  row.ageStatement = release.ageStatement ?? "";
  const parsed = parseReleaseRow(row);
  if (parsed.error !== null) return { ok: false, error: parsed.error };
  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > MAX_NOTES) return { ok: false, error: `Keep the notes under ${MAX_NOTES} characters.`, fieldErrors: { notes: "Too long." } };

  const { id: _id, ...values } = parsed.value;
  try {
    await db
      .update(expressionReleases)
      .set({ ...values, notes: notes === "" ? null : notes })
      .where(eq(expressionReleases.id, releaseId));
    revalidateRelease(release.expressionId, releaseId);
    return { ok: true, message: "Release saved." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Release" });
  }
}

/** Deletes a release and its photo. Its bottles stay, without a release. */
export async function deleteReleaseAction(releaseId: number): Promise<ActionResult> {
  const user = await requireSession();
  const release = await releaseById(releaseId, user.id);
  if (!release) return { ok: false, error: "That release is gone." };
  try {
    await db.delete(expressionReleases).where(eq(expressionReleases.id, releaseId));
    if (release.photoPath) await deleteStoredImage(release.photoPath, release.photoThumbPath);
    revalidateRelease(release.expressionId, releaseId);
    return { ok: true, message: "Release deleted." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Release" });
  }
}

export async function removeReleasePhotoAction(releaseId: number): Promise<ActionResult> {
  const user = await requireSession();
  const release = await releaseById(releaseId, user.id);
  if (!release) return { ok: false, error: "That release is gone." };
  try {
    await db
      .update(expressionReleases)
      .set({ photoPath: null, photoThumbPath: null, photoIsCutout: null })
      .where(eq(expressionReleases.id, releaseId));
    if (release.photoPath) await deleteStoredImage(release.photoPath, release.photoThumbPath);
    revalidateRelease(release.expressionId, releaseId);
    return { ok: true, message: "Photo removed." };
  } catch (error: unknown) {
    return mapDbError(error, { singular: "Release" });
  }
}
