import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottles, expressionColas, expressionNames, expressionReleases, expressions } from "@/db/schema";
import { colaFilesForCola, deleteColaFiles } from "@/lib/cola/store";
import { deleteStoredImage } from "@/lib/images";
import { deleteStoredPhotos, type StoredPhoto } from "@/lib/releases-store";

/**
 * Merging one label into another (spec 2026-10-08-edit-facts-design.md, section 4):
 * the first label's bottles, tastings, older names, releases and approvals move to
 * the second, the second keeps its own facts unless `keepMine` says otherwise, and
 * the first is removed. One transaction, and not undoable.
 */

/** The facts the removed label may carry over. The rest are always the surviving label's. */
export const KEEPABLE_FACTS = ["categoryId", "proof", "ageYears", "ageStatement", "sizeMl", "msrp", "upc"] as const;
export type KeepableFact = (typeof KEEPABLE_FACTS)[number];

/** `same`: a label cannot merge into itself. `gone`: one of them is not the caller's, or does not exist. */
export class MergeError extends Error {
  constructor(readonly code: "same" | "gone") {
    super(code);
  }
}

export type MergeResult = { intoId: number; bottles: number; tastings: number };

export async function mergeLabels(ownerId: number, sourceId: number, intoId: number, keepMine: KeepableFact[]): Promise<MergeResult> {
  if (sourceId === intoId) throw new MergeError("same");

  // Files are removed only once the rows are gone for good.
  const orphans = { labelPhoto: null as StoredPhoto | null, releasePhotos: [] as StoredPhoto[], colaFiles: [] as Awaited<ReturnType<typeof colaFilesForCola>> };

  const result = await db.transaction(async (tx) => {
    // Locked in id order, so two merges touching the same pair cannot wait on each other.
    const locked = await tx
      .select()
      .from(expressions)
      .where(and(inArray(expressions.id, [sourceId, intoId]), eq(expressions.ownerId, ownerId)))
      .orderBy(asc(expressions.id))
      .for("update");
    const source = locked.find((row) => row.id === sourceId);
    const target = locked.find((row) => row.id === intoId);
    if (!source || !target) throw new MergeError("gone");

    // Facts: the surviving label's, except those the caller chose to keep from the other.
    const facts: Partial<typeof expressions.$inferInsert> = {};
    for (const key of keepMine) Object.assign(facts, { [key]: source[key] });
    // The photo: the survivor's own, else the other's.
    if (!target.photoPath && source.photoPath) {
      facts.photoPath = source.photoPath;
      facts.photoThumbPath = source.photoThumbPath;
      facts.photoIsCutout = source.photoIsCutout;
    } else if (source.photoPath) {
      orphans.labelPhoto = { filePath: source.photoPath, thumbPath: source.photoThumbPath };
    }
    if (Object.keys(facts).length > 0) await tx.update(expressions).set(facts).where(eq(expressions.id, intoId));

    // Older names. A name the survivor already has is reused, and the bottles that pointed at the other's are re-pointed.
    const targetNames = await tx.select().from(expressionNames).where(eq(expressionNames.expressionId, intoId));
    const nameIds = new Map(targetNames.map((row) => [row.name.toLowerCase(), row.id]));
    let namePosition = targetNames.reduce((next, row) => Math.max(next, row.position + 1), 0);
    const sourceNames = await tx
      .select()
      .from(expressionNames)
      .where(eq(expressionNames.expressionId, sourceId))
      .orderBy(asc(expressionNames.position));
    for (const name of sourceNames) {
      const same = nameIds.get(name.name.toLowerCase());
      if (same !== undefined) {
        await tx
          .update(bottles)
          .set({ expressionNameId: same })
          .where(and(eq(bottles.expressionId, sourceId), eq(bottles.expressionNameId, name.id)));
      } else {
        await tx.update(expressionNames).set({ expressionId: intoId, position: namePosition++ }).where(eq(expressionNames.id, name.id));
        nameIds.set(name.name.toLowerCase(), name.id);
      }
    }
    // The removed label's own name becomes an older name of the survivor, so its bottles still read as what they were bought as.
    if (source.name.toLowerCase() !== target.name.toLowerCase()) {
      let carried = nameIds.get(source.name.toLowerCase());
      if (carried === undefined) {
        const [row] = await tx
          .insert(expressionNames)
          .values({ expressionId: intoId, name: source.name, position: namePosition++ })
          .returning({ id: expressionNames.id });
        carried = row!.id;
      }
      await tx
        .update(bottles)
        .set({ expressionNameId: carried })
        .where(and(eq(bottles.expressionId, sourceId), isNull(bottles.expressionNameId)));
    }

    // Releases. A name the survivor already has wins; the other's photo goes with it.
    const targetReleases = await tx.select().from(expressionReleases).where(eq(expressionReleases.expressionId, intoId));
    const releaseIds = new Map(targetReleases.map((row) => [row.name.toLowerCase(), row.id]));
    let releasePosition = targetReleases.reduce((next, row) => Math.max(next, row.position + 1), 0);
    const sourceReleases = await tx
      .select()
      .from(expressionReleases)
      .where(eq(expressionReleases.expressionId, sourceId))
      .orderBy(asc(expressionReleases.position));
    for (const release of sourceReleases) {
      const same = releaseIds.get(release.name.toLowerCase());
      if (same === undefined) {
        await tx
          .update(expressionReleases)
          .set({ expressionId: intoId, position: releasePosition++ })
          .where(eq(expressionReleases.id, release.id));
        continue;
      }
      await tx
        .update(bottles)
        .set({ releaseId: same })
        .where(and(eq(bottles.expressionId, sourceId), eq(bottles.releaseId, release.id)));
      if (release.photoPath) orphans.releasePhotos.push({ filePath: release.photoPath, thumbPath: release.photoThumbPath });
      await tx.delete(expressionReleases).where(eq(expressionReleases.id, release.id));
    }

    // Approvals. One the survivor already has is dropped, with its files.
    const targetColas = await tx.select({ ttbId: expressionColas.ttbId }).from(expressionColas).where(eq(expressionColas.expressionId, intoId));
    const haveTtb = new Set(targetColas.map((row) => row.ttbId));
    let colaPosition = targetColas.length;
    const sourceColas = await tx
      .select({ id: expressionColas.id, ttbId: expressionColas.ttbId })
      .from(expressionColas)
      .where(eq(expressionColas.expressionId, sourceId))
      .orderBy(asc(expressionColas.position));
    for (const cola of sourceColas) {
      if (haveTtb.has(cola.ttbId)) {
        orphans.colaFiles.push(...(await colaFilesForCola(cola.id)));
        await tx.delete(expressionColas).where(eq(expressionColas.id, cola.id));
      } else {
        await tx.update(expressionColas).set({ expressionId: intoId, position: colaPosition++ }).where(eq(expressionColas.id, cola.id));
      }
    }

    // Bottles and tastings in ONE statement: a tasting points at its bottle and label together
    // (tasting_notes_bottle_expression_fk, no ON UPDATE CASCADE), so moving the bottles alone
    // would break that key. Checked at the end of the statement, both moves satisfy it.
    const [moved] = await tx.execute<{ bottles: number; tastings: number }>(sql`
      WITH b AS (
        UPDATE bottles SET expression_id = ${intoId}
        WHERE expression_id = ${sourceId} AND owner_id = ${ownerId} RETURNING id
      ), t AS (
        UPDATE tasting_notes SET expression_id = ${intoId}
        WHERE expression_id = ${sourceId} AND owner_id = ${ownerId} RETURNING id
      )
      SELECT (SELECT count(*) FROM b)::int AS bottles, (SELECT count(*) FROM t)::int AS tastings
    `);

    // What is left (its distillery, mashbill and finish lists) goes with it.
    await tx.delete(expressions).where(and(eq(expressions.id, sourceId), eq(expressions.ownerId, ownerId)));

    return { intoId, bottles: moved?.bottles ?? 0, tastings: moved?.tastings ?? 0 };
  });

  if (orphans.labelPhoto) await deleteStoredImage(orphans.labelPhoto.filePath, orphans.labelPhoto.thumbPath).catch(() => {});
  await deleteStoredPhotos(orphans.releasePhotos).catch(() => {});
  await deleteColaFiles(orphans.colaFiles);
  return result;
}
