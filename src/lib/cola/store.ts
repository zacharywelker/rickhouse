import "server-only";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { colaImages, distilleries, expressionColas, expressions } from "@/db/schema";
import { env } from "@/lib/env";
import { deleteStoredImage, ImageError, storeColaImage } from "@/lib/images";
import { ColaLookupError, ColaNotFoundError, ColaParseError, lookupCola } from "./client";

/**
 * A label's COLAs in the database, and the lookups that fill them (SPEC M11).
 * Every function takes the signed-in owner and matches nothing of anyone else's.
 */

export type ColaRow = typeof expressionColas.$inferSelect;
export type ColaImageRow = typeof colaImages.$inferSelect;
export type ColaWithImages = ColaRow & { images: ColaImageRow[] };

export function colaLookupEnabled(): boolean {
  return env().COLA_LOOKUP;
}

/** The label's COLAs in the order they were added, each with its label panels. */
export async function colasForExpression(expressionId: number, ownerId: number): Promise<ColaWithImages[]> {
  const rows = await db
    .select()
    .from(expressionColas)
    .where(and(eq(expressionColas.expressionId, expressionId), eq(expressionColas.ownerId, ownerId)))
    .orderBy(asc(expressionColas.position), asc(expressionColas.id));
  if (rows.length === 0) return [];
  const images = await db
    .select()
    .from(colaImages)
    .where(
      inArray(
        colaImages.colaId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(colaImages.sortOrder), asc(colaImages.id));
  return rows.map((row) => ({ ...row, images: images.filter((image) => image.colaId === row.id) }));
}

export async function ownedCola(colaId: number, ownerId: number): Promise<ColaRow | null> {
  const [row] = await db
    .select()
    .from(expressionColas)
    .where(and(eq(expressionColas.id, colaId), eq(expressionColas.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

export async function ownedColaImage(
  imageId: number,
  ownerId: number,
): Promise<{ image: ColaImageRow; expressionId: number } | null> {
  const [row] = await db
    .select({ image: colaImages, expressionId: expressionColas.expressionId })
    .from(colaImages)
    .innerJoin(expressionColas, eq(expressionColas.id, colaImages.colaId))
    .where(and(eq(colaImages.id, imageId), eq(expressionColas.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

/**
 * Attaches a TTB ID to a label, at the end of its list. "gone" when the label
 * is not the owner's, "duplicate" when the label already has that COLA.
 */
export async function attachCola(
  expressionId: number,
  ownerId: number,
  ttbId: string,
): Promise<ColaRow | "gone" | "duplicate"> {
  const [label] = await db
    .select({ id: expressions.id })
    .from(expressions)
    .where(and(eq(expressions.id, expressionId), eq(expressions.ownerId, ownerId)))
    .limit(1);
  if (!label) return "gone";
  const position = await db.$count(expressionColas, eq(expressionColas.expressionId, expressionId));
  const [row] = await db
    .insert(expressionColas)
    .values({ ownerId, expressionId, ttbId, position })
    .onConflictDoNothing({ target: [expressionColas.expressionId, expressionColas.ttbId] })
    .returning();
  return row ?? "duplicate";
}

type StoredFiles = { filePath: string; thumbPath: string | null; displayPath: string | null };

/** Stored label files for a set of COLAs, for removing from disk once their rows are gone. */
async function filesOf(where: ReturnType<typeof eq>): Promise<StoredFiles[]> {
  return db
    .select({ filePath: colaImages.filePath, thumbPath: colaImages.thumbPath, displayPath: colaImages.displayPath })
    .from(colaImages)
    .innerJoin(expressionColas, eq(expressionColas.id, colaImages.colaId))
    .where(where);
}

export function colaFilesForExpression(expressionId: number) {
  return filesOf(eq(expressionColas.expressionId, expressionId));
}

export function colaFilesForOwner(ownerId: number) {
  return filesOf(eq(expressionColas.ownerId, ownerId));
}

export function colaFilesForCola(colaId: number) {
  return filesOf(eq(expressionColas.id, colaId));
}

export async function deleteColaFiles(files: { filePath: string; thumbPath: string | null; displayPath?: string | null }[]): Promise<void> {
  await Promise.allSettled(files.map((file) => deleteStoredImage(file.filePath, file.thumbPath, file.displayPath ?? null)));
}

/** Moves a COLA to the front of its label's list, where the label page features it. */
export async function featureCola(colaId: number, ownerId: number): Promise<ColaRow | null> {
  const cola = await ownedCola(colaId, ownerId);
  if (!cola) return null;
  const siblings = await db
    .select({ id: expressionColas.id })
    .from(expressionColas)
    .where(eq(expressionColas.expressionId, cola.expressionId))
    .orderBy(asc(expressionColas.position), asc(expressionColas.id));
  const order = [cola.id, ...siblings.map((row) => row.id).filter((id) => id !== cola.id)];
  await db.transaction(async (tx) => {
    for (const [position, id] of order.entries()) {
      await tx.update(expressionColas).set({ position }).where(eq(expressionColas.id, id));
    }
  });
  return cola;
}

/**
 * The owner's distilleries that carry one of these permit numbers, keyed by
 * the number. Read-only: a COLA's permit holder is shown against a matching
 * distillery, never written to one.
 */
export async function distilleriesByPermit(
  ownerId: number,
  permits: ReadonlyArray<string | null>,
): Promise<Record<string, { name: string; slug: string }>> {
  const wanted = [...new Set(permits.filter((permit): permit is string => Boolean(permit)))];
  if (wanted.length === 0) return {};
  const rows = await db
    .select({ name: distilleries.name, slug: distilleries.slug, dspNumber: distilleries.dspNumber })
    .from(distilleries)
    .where(and(eq(distilleries.ownerId, ownerId), isNotNull(distilleries.dspNumber)));
  // Permit numbers are typed by hand on distilleries ("DSP-KY-95", "dsp ky 95"), so compare them loosely.
  const key = (permit: string) => permit.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const byKey = new Map(rows.map((row) => [key(row.dspNumber!), { name: row.name, slug: row.slug }]));
  const found: Record<string, { name: string; slug: string }> = {};
  for (const permit of wanted) {
    const match = byKey.get(key(permit));
    if (match) found[permit] = match;
  }
  return found;
}

export type RefreshResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Looks the COLA up again and replaces what is stored: the record and its
 * label panels. A failed lookup leaves the previous copy in place and records
 * why on the row, so a registry outage never blanks a label.
 */
export async function refreshCola(colaId: number, ownerId: number): Promise<RefreshResult> {
  const cola = await ownedCola(colaId, ownerId);
  if (!cola) return { ok: false, error: "That COLA is gone." };
  if (!colaLookupEnabled()) return { ok: false, error: "COLA lookups are turned off on this server (COLA_LOOKUP)." };

  let lookup;
  try {
    lookup = await lookupCola(cola.ttbId, { images: true });
  } catch (error: unknown) {
    const message =
      error instanceof ColaNotFoundError || error instanceof ColaParseError || error instanceof ColaLookupError
        ? error.message
        : "The COLA lookup failed.";
    if (!(error instanceof ColaNotFoundError)) console.warn("[rickhouse] COLA lookup failed", cola.ttbId, error);
    await db.update(expressionColas).set({ fetchError: message }).where(eq(expressionColas.id, cola.id));
    return { ok: false, error: message };
  }

  // Files first, rows second: a crash in between leaves stray files, never rows pointing at nothing.
  const stored: {
    filePath: string;
    thumbPath: string;
    displayPath: string | null;
    panel: string | null;
    width: number;
    height: number;
  }[] = [];
  const skipped = [...lookup.skipped];
  for (const image of lookup.images) {
    try {
      const saved = await storeColaImage(image.bytes, image.contentType);
      stored.push({ ...saved, displayPath: saved.displayPath ?? null, panel: image.panel });
    } catch (error: unknown) {
      if (!(error instanceof ImageError)) console.warn("[rickhouse] could not store COLA image", cola.ttbId, error);
      skipped.push(`${image.panel ?? "label image"} (${error instanceof Error ? error.message : "unreadable"})`);
    }
  }

  const previous = await colaFilesForCola(cola.id);
  const { record } = lookup;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(expressionColas)
        .set({
          status: record.status,
          brandName: record.brandName,
          fancifulName: record.fancifulName,
          classTypeCode: record.classTypeCode,
          classType: record.classType,
          originCode: record.originCode,
          origin: record.origin,
          isImported: record.isImported,
          applicantName: record.applicantName,
          applicantAddress: record.applicantAddress,
          permitNumber: record.permitNumber,
          serialNumber: record.serialNumber,
          approvedOn: record.approvedOn,
          fetchedAt: new Date(),
          fetchError: skipped.length > 0 ? `Some label images were skipped: ${skipped.join("; ")}` : null,
        })
        .where(eq(expressionColas.id, cola.id));
      await tx.delete(colaImages).where(eq(colaImages.colaId, cola.id));
      if (stored.length > 0) {
        await tx.insert(colaImages).values(stored.map((image, sortOrder) => ({ colaId: cola.id, sortOrder, ...image })));
      }
    });
  } catch (error: unknown) {
    await deleteColaFiles(stored);
    throw error;
  }
  await deleteColaFiles(previous);

  const panels = stored.length === 1 ? "1 label image" : `${stored.length} label images`;
  return { ok: true, message: `Fetched ${cola.ttbId} with ${panels}.` };
}
