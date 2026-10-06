import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { expressionReleases, expressions } from "@/db/schema";
import { deleteStoredImage } from "./images";
import { releaseLabel, type Release, type ReleaseInput } from "./releases";

export type StoredPhoto = { filePath: string; thumbPath: string | null };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const columns = {
  id: expressionReleases.id,
  name: expressionReleases.name,
  releaseYear: expressionReleases.releaseYear,
  proof: expressionReleases.proof,
  ageYears: expressionReleases.ageYears,
  ageMonths: expressionReleases.ageMonths,
  ageDays: expressionReleases.ageDays,
  ageStatement: expressionReleases.ageStatement,
  msrp: expressionReleases.msrp,
  expressionId: expressionReleases.expressionId,
  photoPath: expressionReleases.photoPath,
  photoThumbPath: expressionReleases.photoThumbPath,
  notes: expressionReleases.notes,
};

/**
 * Makes a label's known releases exactly `releases`. A row with an id updates
 * that release (only if it is this label's), so a rename keeps its bottles,
 * photo and notes; a row without one matches by name or is inserted. Returns
 * the photos of releases it removed, for the caller to delete from disk once
 * the transaction has committed.
 */
export async function syncExpressionReleases(
  tx: Tx,
  expressionId: number,
  releases: ReleaseInput[],
): Promise<StoredPhoto[]> {
  const existing = await tx
    .select({
      id: expressionReleases.id,
      name: expressionReleases.name,
      photoPath: expressionReleases.photoPath,
      photoThumbPath: expressionReleases.photoThumbPath,
    })
    .from(expressionReleases)
    .where(eq(expressionReleases.expressionId, expressionId));
  const ids = new Set(existing.map((row) => row.id));
  const byName = new Map(existing.map((row) => [row.name.toLowerCase(), row.id]));
  const kept = new Set<number>();
  const pending: Array<{ id: number | null; values: Release & { position: number } }> = [];
  for (const [position, { id, ...release }] of releases.entries()) {
    const match = id !== null && ids.has(id) ? id : byName.get(release.name.toLowerCase());
    // Each existing release is claimed once; a second claim is a new release.
    const target = match !== undefined && !kept.has(match) ? match : null;
    if (target !== null) kept.add(target);
    pending.push({ id: target, values: { ...release, position } });
  }
  // Removed first, so a new row may reuse a removed release's name.
  const removed = existing.filter((row) => !kept.has(row.id));
  if (removed.length > 0) {
    await tx.delete(expressionReleases).where(inArray(expressionReleases.id, removed.map((row) => row.id)));
  }
  for (const { id, values } of pending) {
    if (id !== null) await tx.update(expressionReleases).set(values).where(eq(expressionReleases.id, id));
    else await tx.insert(expressionReleases).values({ ...values, expressionId });
  }
  return removed.flatMap((row) => (row.photoPath ? [{ filePath: row.photoPath, thumbPath: row.photoThumbPath }] : []));
}

/** Every release photo of a label, for deleting the files when the label goes. */
export async function releasePhotosOfLabel(expressionId: number): Promise<StoredPhoto[]> {
  const rows = await db
    .select({ filePath: expressionReleases.photoPath, thumbPath: expressionReleases.photoThumbPath })
    .from(expressionReleases)
    .where(eq(expressionReleases.expressionId, expressionId));
  return rows.flatMap((row) => (row.filePath ? [{ filePath: row.filePath, thumbPath: row.thumbPath }] : []));
}

export async function deleteStoredPhotos(photos: StoredPhoto[]) {
  await Promise.all(photos.map((photo) => deleteStoredImage(photo.filePath, photo.thumbPath)));
}

/**
 * What removing each of a label's releases would affect, by release id: its
 * photo and notes go with it; its bottles (and their tastings) stay but lose
 * the release. Only releases with something to lose appear.
 */
export async function releaseRemovalImpact(expressionId: number): Promise<Record<string, string>> {
  const rows = await db
    .select({
      id: expressionReleases.id,
      name: expressionReleases.name,
      hasPhoto: sql<boolean>`${expressionReleases.photoPath} is not null`,
      hasNotes: sql<boolean>`coalesce(${expressionReleases.notes}, '') <> ''`,
      // Spelled out: in a single-table select Drizzle leaves columns unqualified,
      // which makes "id" ambiguous inside these subqueries.
      bottleCount: sql<number>`(select count(*)::int from bottles b where b.release_id = expression_releases.id)`,
      tastingCount: sql<number>`(select count(*)::int from tasting_notes tn join bottles b on b.id = tn.bottle_id where b.release_id = expression_releases.id)`,
    })
    .from(expressionReleases)
    .where(eq(expressionReleases.expressionId, expressionId));
  const impact: Record<string, string> = {};
  for (const row of rows) {
    const message = removalWarning(row);
    if (message) impact[String(row.id)] = message;
  }
  return impact;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "Kentucky Tea has a photo, notes and 2 bottles (3 tastings). …", or null with nothing to lose. */
export function removalWarning(row: { name: string; hasPhoto: boolean; hasNotes: boolean; bottleCount: number; tastingCount: number }): string | null {
  const has = [
    row.hasPhoto ? "a photo" : null,
    row.hasNotes ? "notes" : null,
    row.bottleCount > 0
      ? `${plural(row.bottleCount, "bottle")}${row.tastingCount > 0 ? ` (${plural(row.tastingCount, "tasting")})` : ""}`
      : null,
  ].filter((part): part is string => part !== null);
  if (has.length === 0) return null;
  const list = has.length === 1 ? has[0] : `${has.slice(0, -1).join(", ")} and ${has.at(-1)}`;
  const consequences = [
    row.hasPhoto || row.hasNotes ? `its ${[row.hasPhoto && "photo", row.hasNotes && "notes"].filter(Boolean).join(" and ")} will be deleted` : null,
    row.bottleCount > 0 ? `${row.bottleCount === 1 ? "the bottle stays" : "the bottles stay"} but ${row.bottleCount === 1 ? "loses" : "lose"} this release` : null,
  ].filter(Boolean);
  return `${row.name} has ${list}. Removing it: ${consequences.join("; ")}.`;
}

/** A label's known releases, in the order they were typed. */
export async function expressionReleaseList(expressionId: number) {
  return db
    .select(columns)
    .from(expressionReleases)
    .where(eq(expressionReleases.expressionId, expressionId))
    .orderBy(expressionReleases.position, expressionReleases.id);
}

/** One release by id, for a bottle's page; only if its label is `ownerId`'s. */
export async function releaseById(id: number, ownerId: number) {
  const [row] = await db
    .select(columns)
    .from(expressionReleases)
    .innerJoin(expressions, eq(expressions.id, expressionReleases.expressionId))
    .where(and(eq(expressionReleases.id, id), eq(expressions.ownerId, ownerId)));
  return row ?? null;
}

/**
 * Every known release of the account's labels, by label id, as the bottle
 * form's Release choices. Only labels that have some appear.
 */
export async function releaseChoices(ownerId: number): Promise<Record<number, Array<{ value: string; label: string }>>> {
  const rows = await db
    .select({
      id: expressionReleases.id,
      expressionId: expressionReleases.expressionId,
      name: expressionReleases.name,
      releaseYear: expressionReleases.releaseYear,
    })
    .from(expressionReleases)
    .innerJoin(expressions, eq(expressions.id, expressionReleases.expressionId))
    .where(eq(expressions.ownerId, ownerId))
    .orderBy(expressionReleases.position, expressionReleases.id);
  const byLabel: Record<number, Array<{ value: string; label: string }>> = {};
  for (const row of rows) {
    (byLabel[row.expressionId] ??= []).push({ value: String(row.id), label: releaseLabel(row) });
  }
  return byLabel;
}

/**
 * Does this release belong to this label? Guards a bottle's chosen release;
 * the label is already known to be the caller's, so this also keeps another
 * account's release ids out.
 */
export async function releaseBelongsToExpression(releaseId: number, expressionId: number): Promise<boolean> {
  const rows = await db
    .select({ id: expressionReleases.id })
    .from(expressionReleases)
    .where(and(eq(expressionReleases.id, releaseId), eq(expressionReleases.expressionId, expressionId)));
  return rows.length > 0;
}
