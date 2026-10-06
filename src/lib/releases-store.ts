import "server-only";
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { expressionReleases, expressions } from "@/db/schema";
import { releaseLabel, type Release } from "./releases";

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
};

/**
 * Makes a label's known releases exactly `releases`. Matched by name and
 * updated in place, for the same reason as `syncExpressionNames`: bottles
 * point at them, and a delete-and-reinsert would unset every bottle's release.
 */
export async function syncExpressionReleases(tx: Tx, expressionId: number, releases: Release[]) {
  const existing = await tx
    .select({ id: expressionReleases.id, name: expressionReleases.name })
    .from(expressionReleases)
    .where(eq(expressionReleases.expressionId, expressionId));
  const byName = new Map(existing.map((row) => [row.name.toLowerCase(), row.id]));
  const keep: number[] = [];
  for (const [position, release] of releases.entries()) {
    const values = { ...release, position };
    const id = byName.get(release.name.toLowerCase());
    if (id !== undefined) {
      await tx.update(expressionReleases).set(values).where(eq(expressionReleases.id, id));
      keep.push(id);
    } else {
      const [row] = await tx
        .insert(expressionReleases)
        .values({ ...values, expressionId })
        .returning({ id: expressionReleases.id });
      keep.push(row!.id);
    }
  }
  await tx
    .delete(expressionReleases)
    .where(
      keep.length === 0
        ? eq(expressionReleases.expressionId, expressionId)
        : and(eq(expressionReleases.expressionId, expressionId), notInArray(expressionReleases.id, keep)),
    );
}

/** A label's known releases, in the order they were typed. */
export async function expressionReleaseList(expressionId: number) {
  return db
    .select(columns)
    .from(expressionReleases)
    .where(eq(expressionReleases.expressionId, expressionId))
    .orderBy(expressionReleases.position, expressionReleases.id);
}

/** One release by id, for a bottle's page. */
export async function releaseById(id: number) {
  const [row] = await db.select(columns).from(expressionReleases).where(eq(expressionReleases.id, id));
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
