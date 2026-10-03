import "server-only";
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { distilleryNames, expressionNames, expressions } from "@/db/schema";
import { nameWithYears, type OtherName } from "./other-names";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Makes a label's older names exactly `names`. Rows are matched by name and
 * updated in place rather than rewritten, because bottles point at them: a
 * delete-and-reinsert would quietly unset every bottle's chosen version.
 */
export async function syncExpressionNames(tx: Tx, expressionId: number, names: OtherName[]) {
  const existing = await tx
    .select({ id: expressionNames.id, name: expressionNames.name })
    .from(expressionNames)
    .where(eq(expressionNames.expressionId, expressionId));
  const byName = new Map(existing.map((row) => [row.name.toLowerCase(), row.id]));
  const keep: number[] = [];
  for (const [position, entry] of names.entries()) {
    const values = { name: entry.name, yearFrom: entry.yearFrom, yearTo: entry.yearTo, position };
    const id = byName.get(entry.name.toLowerCase());
    if (id !== undefined) {
      await tx.update(expressionNames).set(values).where(eq(expressionNames.id, id));
      keep.push(id);
    } else {
      const [row] = await tx.insert(expressionNames).values({ ...values, expressionId }).returning({ id: expressionNames.id });
      keep.push(row!.id);
    }
  }
  await tx
    .delete(expressionNames)
    .where(
      keep.length === 0
        ? eq(expressionNames.expressionId, expressionId)
        : and(eq(expressionNames.expressionId, expressionId), notInArray(expressionNames.id, keep)),
    );
}

/** The same for a distillery's older names. */
export async function syncDistilleryNames(tx: Tx, distilleryId: number, names: OtherName[]) {
  const existing = await tx
    .select({ id: distilleryNames.id, name: distilleryNames.name })
    .from(distilleryNames)
    .where(eq(distilleryNames.distilleryId, distilleryId));
  const byName = new Map(existing.map((row) => [row.name.toLowerCase(), row.id]));
  const keep: number[] = [];
  for (const [position, entry] of names.entries()) {
    const values = { name: entry.name, yearFrom: entry.yearFrom, yearTo: entry.yearTo, position };
    const id = byName.get(entry.name.toLowerCase());
    if (id !== undefined) {
      await tx.update(distilleryNames).set(values).where(eq(distilleryNames.id, id));
      keep.push(id);
    } else {
      const [row] = await tx.insert(distilleryNames).values({ ...values, distilleryId }).returning({ id: distilleryNames.id });
      keep.push(row!.id);
    }
  }
  await tx
    .delete(distilleryNames)
    .where(
      keep.length === 0
        ? eq(distilleryNames.distilleryId, distilleryId)
        : and(eq(distilleryNames.distilleryId, distilleryId), notInArray(distilleryNames.id, keep)),
    );
}

/** A label's older names, in the order they were typed. */
export async function expressionOtherNames(expressionId: number) {
  return db
    .select({ id: expressionNames.id, name: expressionNames.name, yearFrom: expressionNames.yearFrom, yearTo: expressionNames.yearTo })
    .from(expressionNames)
    .where(eq(expressionNames.expressionId, expressionId))
    .orderBy(expressionNames.position, expressionNames.id);
}

/** A distillery's older names, in the order they were typed. */
export async function distilleryOtherNames(distilleryId: number) {
  return db
    .select({ id: distilleryNames.id, name: distilleryNames.name, yearFrom: distilleryNames.yearFrom, yearTo: distilleryNames.yearTo })
    .from(distilleryNames)
    .where(eq(distilleryNames.distilleryId, distilleryId))
    .orderBy(distilleryNames.position, distilleryNames.id);
}

/**
 * Every older name of the account's labels, by label id, as the bottle form's
 * Label Version choices. Only labels that have some appear.
 */
export async function labelVersionChoices(ownerId: number): Promise<Record<number, Array<{ value: string; label: string }>>> {
  const rows = await db
    .select({
      id: expressionNames.id,
      expressionId: expressionNames.expressionId,
      name: expressionNames.name,
      yearFrom: expressionNames.yearFrom,
      yearTo: expressionNames.yearTo,
    })
    .from(expressionNames)
    .innerJoin(expressions, eq(expressions.id, expressionNames.expressionId))
    .where(eq(expressions.ownerId, ownerId))
    .orderBy(expressionNames.position, expressionNames.id);
  const byLabel: Record<number, Array<{ value: string; label: string }>> = {};
  for (const row of rows) {
    (byLabel[row.expressionId] ??= []).push({ value: String(row.id), label: nameWithYears(row) });
  }
  return byLabel;
}

/** Does this older name belong to this label? Guards a bottle's chosen version. */
export async function nameBelongsToExpression(nameId: number, expressionId: number): Promise<boolean> {
  const rows = await db
    .select({ id: expressionNames.id })
    .from(expressionNames)
    .where(and(eq(expressionNames.id, nameId), eq(expressionNames.expressionId, expressionId)));
  return rows.length > 0;
}

