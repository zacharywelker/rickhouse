import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { expressionDistilleries, expressionFinishes, expressionMashbills, expressions } from "@/db/schema";
import { resolveSlug } from "@/lib/slug";
import { attachCola, colaLookupEnabled, refreshCola } from "@/lib/cola/store";
import { writableFields } from "./fields";
import { fieldGroupForCategory } from "./queries";
import { parseLinks, type ExpressionInput, type LinkRow } from "./schema";
import { undisclosedDistilleryId } from "./undisclosed";

/**
 * Saving a label, shared by the label form, the label grids and the
 * search-first Add bottle page, which writes a label and its bottle in one
 * transaction.
 */

/**
 * Fields every category writes, whatever its field group. Anything outside
 * this set belongs to a section that may be hidden.
 */
const COMMON_FIELDS = new Set(writableFields("other"));

/**
 * Keeps only the columns this category may write, dropping anything whose
 * section is not visible for its field group (and anything left undefined,
 * which a partial grid edit uses for "not changed").
 *
 * This is what makes "hidden fields must not be cleared silently" true: switch
 * a Rum to a Bourbon and the rum columns are simply not part of the update, so
 * the ester count survives to be there again if you switch back.
 */
export function writableValues(values: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (key === "slug" || COMMON_FIELDS.has(key) || allowed.has(key)) kept[key] = value;
  }
  return kept;
}

export function valuesForGroup(input: ExpressionInput, allowed: Set<string>, slug: string) {
  return writableValues({ ...input, slug }, allowed);
}

export function fieldErrorsOf(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Links = { distilleries: LinkRow[]; mashbills: LinkRow[]; finishes: LinkRow[] };

/** The three ordered lists, from a form or a grid row — both send the same JSON. */
export function linksFrom(source: { distilleryLinks?: unknown; mashbillLinks?: unknown; finishLinks?: unknown }): Links {
  return {
    distilleries: parseLinks(source.distilleryLinks),
    mashbills: parseLinks(source.mashbillLinks),
    finishes: parseLinks(source.finishLinks),
  };
}

/**
 * Replace rather than diff: the lists are short and ordering matters, so
 * rewriting them is both simpler and correct. Always all three together —
 * which distillery made each mashbill depends on the distillery list.
 */
export async function replaceLinks(tx: Tx, ownerId: number, expressionId: number, links: Links) {
  await tx.delete(expressionDistilleries).where(eq(expressionDistilleries.expressionId, expressionId));
  await tx.delete(expressionMashbills).where(eq(expressionMashbills.expressionId, expressionId));
  await tx.delete(expressionFinishes).where(eq(expressionFinishes.expressionId, expressionId));
  await insertLinks(tx, ownerId, expressionId, links);
}

export async function insertLinks(tx: Tx, ownerId: number, expressionId: number, links: Links) {
  // An undisclosed place typed into the form arrives as a negative id plus its
  // place; it becomes the account's placeholder row here, in this transaction.
  // Mashbills that named it by that temporary id follow it to the real one.
  const resolved = new Map<number, number>();
  const seen = new Set<number>();
  const linkedDistilleries: LinkRow[] = [];
  for (const row of links.distilleries) {
    let id = row.id;
    if (id < 0) {
      if (!row.place) continue;
      const known = resolved.get(id);
      id = known ?? (await undisclosedDistilleryId(tx, ownerId, row.place));
      resolved.set(row.id, id);
    }
    // A place can land on a row the label already lists; the join's key is one per pair.
    if (seen.has(id)) continue;
    seen.add(id);
    linkedDistilleries.push({ ...row, id, place: undefined });
  }
  // Only distilleries can be a place; a negative id elsewhere is not a row.
  const linkedMashbills = links.mashbills
    .filter((row) => row.id > 0)
    .map((row) => ({ ...row, distilleryId: row.distilleryId && row.distilleryId < 0 ? (resolved.get(row.distilleryId) ?? null) : row.distilleryId }));
  const linkedFinishes = links.finishes.filter((row) => row.id > 0);

  if (linkedDistilleries.length > 0) {
    await tx.insert(expressionDistilleries).values(
      linkedDistilleries.map((row, position) => ({
        expressionId,
        distilleryId: row.id,
        position,
        // Shares are whole percentages (see shareText).
        sharePct: row.amount === null ? null : String(Math.round(row.amount)),
        isInferred: row.inferred === true,
      })),
    );
  }
  if (linkedMashbills.length > 0) {
    // With exactly one distillery, it is the automatic answer for every
    // mashbill regardless of what the form sent; with more than one, only
    // a choice that is actually one of them is kept (issue #13).
    const soloDistilleryId = linkedDistilleries.length === 1 ? linkedDistilleries[0]!.id : null;
    const validDistilleryIds = new Set(linkedDistilleries.map((row) => row.id));
    const distilleryIdFor = (row: (typeof linkedMashbills)[number]) =>
      soloDistilleryId ?? (row.distilleryId && validDistilleryIds.has(row.distilleryId) ? row.distilleryId : null);

    await tx.insert(expressionMashbills).values(
      linkedMashbills.map((row, position) => ({
        expressionId,
        mashbillId: row.id,
        position,
        // Shares are whole percentages (see shareText).
        sharePct: row.amount === null ? null : String(Math.round(row.amount)),
        distilleryId: distilleryIdFor(row),
      })),
    );
  }
  if (linkedFinishes.length > 0) {
    await tx.insert(expressionFinishes).values(
      linkedFinishes.map((row, position) => ({
        expressionId,
        finishId: row.id,
        position,
        months: row.amount === null ? null : Math.round(row.amount),
      })),
    );
  }
}

/** Thrown inside a transaction to roll it back when the label isn't the caller's. */
export class NotOwned extends Error {}

/** A validated label's columns: only its category's sections, and a slug. */
export async function labelValues(input: ExpressionInput, ownerId: number, id: number | null) {
  const allowed = writableFields(await fieldGroupForCategory(input.categoryId));
  const slug = await resolveSlug({
    table: expressions,
    column: expressions.slug,
    idColumn: expressions.id,
    scope: { column: expressions.ownerId, value: ownerId },
    requested: input.slug,
    fallbackFrom: `${input.name}${input.batch ? ` ${input.batch}` : ""}`,
    ...(id !== null ? { excludeId: id } : {}),
  });
  return valuesForGroup(input, allowed, slug);
}

/**
 * Inserts the label (`id` null) or updates the caller's own, then rewrites
 * its lists. Throws NotOwned for someone else's label, which rolls back the
 * transaction it runs in.
 */
export async function writeLabel(
  tx: Tx,
  ownerId: number,
  id: number | null,
  values: Record<string, unknown>,
  links: Links,
): Promise<number> {
  let target = id;
  if (target === null) {
    const [row] = await tx
      .insert(expressions)
      .values({ ...(values as typeof expressions.$inferInsert), ownerId })
      .returning({ id: expressions.id });
    target = row!.id;
  } else {
    const updated = await tx
      .update(expressions)
      .set(values as Partial<typeof expressions.$inferInsert>)
      .where(and(eq(expressions.id, target), eq(expressions.ownerId, ownerId)))
      .returning({ id: expressions.id });
    // Stop before the link rows below are rewritten for someone else's label.
    if (updated.length === 0) throw new NotOwned();
  }
  await replaceLinks(tx, ownerId, target, links);
  return target;
}

/**
 * Approvals picked before the label existed (SPEC M11): attached, and
 * fetched with their label art, once it does. Best effort — the label is
 * saved either way, and a failed lookup shows on the label's page. Returns a
 * sentence for the save message, or "".
 */
export async function attachPendingColas(expressionId: number, ownerId: number, ttbIds: string[]): Promise<string> {
  const failed: string[] = [];
  let attached = 0;
  for (const ttbId of ttbIds) {
    const cola = await attachCola(expressionId, ownerId, ttbId).catch(() => null);
    if (!cola || typeof cola !== "object") continue;
    attached += 1;
    if (colaLookupEnabled()) {
      const fetched = await refreshCola(cola.id, ownerId).catch(() => null);
      if (!fetched?.ok) failed.push(ttbId);
    }
  }
  let message = "";
  if (attached > 0) message = ` Attached ${attached === 1 ? "1 approval" : `${attached} approvals`}.`;
  if (failed.length > 0) message += ` Fetch ${failed.join(", ")} again from the label's page.`;
  return message;
}
