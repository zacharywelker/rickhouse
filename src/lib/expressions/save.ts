import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, expressionDistilleries, expressionFinishes, expressionIngredients, expressionMashbills, expressions, ingredients, mashbillGrains, mashbills, type IngredientKind } from "@/db/schema";
import { resolveSlug } from "@/lib/slug";
import { attachCola, colaLookupEnabled, refreshCola } from "@/lib/cola/store";
import { writableFields } from "./fields";
import { fieldGroupForCategory } from "./queries";
import { AGING_FIELDS, BOND_PROOF, isSingleMaltCategory } from "./rules";
import { parseLinks, type ExpressionInput, type LinkRow } from "./schema";
import { undisclosedDistilleryId } from "./undisclosed";
import { ingredientAllowed, TEQUILA_CLASS_LABELS, type IngredientChoice, type TequilaClass } from "./spirit-details";
import { categoryKindsById } from "./queries";
import { isGinKind } from "./gin-details";

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
// Aging is common to most categories but not to all (vodka has none), so it is kept only where the category allows it.
for (const name of AGING_FIELDS) COMMON_FIELDS.delete(name);

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
  // Bottled In Bond is 100 proof by definition, whatever else was sent.
  if (kept.isBottledInBond === true) kept.proof = BOND_PROOF;
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
export type Links = { distilleries: LinkRow[]; mashbills: LinkRow[]; finishes: LinkRow[]; ingredients?: IngredientChoice[] };

export function parseIngredientLinks(raw: unknown): IngredientChoice[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const data = typeof raw === "string" ? (() => { try { return JSON.parse(raw) as unknown; } catch { return null; } })() : raw;
  if (!Array.isArray(data) || data.length > 100) return [];
  const seen = new Set<string>();
  return data.flatMap((item): IngredientChoice[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const family = typeof record.family === "string" ? record.family.trim() : null;
    const kind = typeof record.kind === "string" && ["maguey", "distillate", "rum_base", "botanical", "gin_base"].includes(record.kind) ? record.kind as IngredientKind : undefined;
    if (!name || name.length > 120 || (family && !["grape", "apple", "pear", "other"].includes(family))) return [];
    const key = `${kind ?? ""}:${name.toLocaleLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ name, family, kind }];
  });
}

/** The three ordered lists, from a form or a grid row — both send the same JSON. */
export function linksFrom(source: { distilleryLinks?: unknown; mashbillLinks?: unknown; finishLinks?: unknown; ingredientLinks?: unknown }): Links {
  return {
    distilleries: parseLinks(source.distilleryLinks),
    mashbills: parseLinks(source.mashbillLinks),
    finishes: parseLinks(source.finishLinks),
    ingredients: parseIngredientLinks(source.ingredientLinks),
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
  if (links.ingredients !== undefined) await tx.delete(expressionIngredients).where(eq(expressionIngredients.expressionId, expressionId));
  await insertLinks(tx, ownerId, expressionId, links);
}

export async function replaceIngredients(tx: Tx, ownerId: number, expressionId: number, chosen: IngredientChoice[]) {
  await tx.delete(expressionIngredients).where(eq(expressionIngredients.expressionId, expressionId));
  await insertIngredients(tx, ownerId, expressionId, chosen);
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
  await insertIngredients(tx, ownerId, expressionId, links.ingredients);
}

/** Create reusable ingredient rows and link them in the chosen order. */
async function insertIngredients(tx: Tx, ownerId: number, expressionId: number, submitted: IngredientChoice[] | undefined) {
  const [label] = await tx.select({ categoryId: expressions.categoryId, group: categories.fieldGroup })
    .from(expressions).innerJoin(categories, eq(expressions.categoryId, categories.id))
    .where(eq(expressions.id, expressionId)).limit(1);
  if (!label) return;
  const kind = (await categoryKindsById())[label.categoryId] ?? "other";
  const materialKind: IngredientKind | null = label.group === "agave" ? "maguey" : label.group === "rum" ? "rum_base" : label.group === "brandy" ? "distillate" : null;
  if (!materialKind && label.group !== "gin") return;
  if (submitted === undefined && kind !== "tequila" && label.group !== "gin") return;
  if (kind === "tequila" && submitted === undefined) {
    await tx.delete(expressionIngredients).where(eq(expressionIngredients.expressionId, expressionId));
  }
  const chosen: IngredientChoice[] = kind === "tequila" ? [{ name: "Blue Weber", kind: "maguey" }]
    : label.group === "gin" ? [{ name: "Juniper", kind: "botanical" }, ...(submitted ?? []).filter((choice) =>
      (choice.kind === "botanical" || choice.kind === "gin_base") && !(choice.kind === "botanical" && choice.name.trim().toLocaleLowerCase() === "juniper"))]
    : (submitted ?? []);
  const seen = new Set<string>();
  for (const [position, choice] of chosen.entries()) {
    const choiceKind: IngredientKind | null = label.group === "gin" ? (choice.kind === "botanical" || choice.kind === "gin_base" ? choice.kind : null) : materialKind;
    if (!choiceKind) throw new Error(`Choose whether ${choice.name} is a botanical or base.`);
    if (label.group !== "gin" && choice.kind && choice.kind !== choiceKind) continue;
    const key = `${choiceKind}:${choice.name.trim().toLocaleLowerCase()}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!ingredientAllowed(kind, choice)) throw new Error(`${choice.name} is not allowed for this category.`);
    await tx.insert(ingredients).values({ ownerId, kind: choiceKind, name: choice.name.trim(), family: choice.family ?? null })
      .onConflictDoNothing();
    const [row] = await tx.select({ id: ingredients.id, family: ingredients.family }).from(ingredients)
      .where(and(eq(ingredients.ownerId, ownerId), eq(ingredients.kind, choiceKind), eq(ingredients.name, choice.name.trim())))
      .limit(1);
    if (!row || !ingredientAllowed(kind, { name: choice.name, family: row.family })) throw new Error(`${choice.name} is not allowed for this category.`);
    await tx.insert(expressionIngredients).values({ expressionId, ingredientId: row.id, position }).onConflictDoNothing();
  }
}

/** The recipe inherent in either Single Malt category, shared by that account's labels. */
async function singleMaltMashbillId(tx: Tx, ownerId: number): Promise<number> {
  const [known] = await tx
    .select({ id: mashbills.id })
    .from(mashbills)
    .innerJoin(mashbillGrains, eq(mashbillGrains.mashbillId, mashbills.id))
    .where(
      and(
        eq(mashbills.ownerId, ownerId),
        eq(mashbillGrains.grain, "Malted Barley"),
        eq(mashbillGrains.percent, "100"),
        sql`not exists (select 1 from ${mashbillGrains} other where other.mashbill_id = ${mashbills.id} and other.id <> ${mashbillGrains.id})`,
      ),
    )
    .limit(1);
  if (known) return known.id;

  const [mashbill] = await tx.insert(mashbills).values({ ownerId }).returning({ id: mashbills.id });
  await tx.insert(mashbillGrains).values({ mashbillId: mashbill!.id, grain: "Malted Barley", percent: "100", position: 0 });
  return mashbill!.id;
}

/** Thrown inside a transaction to roll it back when the label isn't the caller's. */
export class NotOwned extends Error {}

/** A validated label's columns: only its category's sections, and a slug. */
export async function labelValues(input: ExpressionInput, ownerId: number, id: number | null) {
  const group = await fieldGroupForCategory(input.categoryId);
  const kind = (await categoryKindsById())[input.categoryId] ?? "other";
  const allowed = writableFields(group);
  if (kind !== "tequila") allowed.delete("tequilaClass");
  if (!["cognac", "armagnac", "calvados"].includes(kind)) allowed.delete("brandyGrade");
  if (kind !== "gin") allowed.delete("ginStyle");
  if (kind === "tequila" || kind === "mezcal") {
    allowed.delete("barrelFilledOn"); allowed.delete("bottledOn"); allowed.delete("isNas");
  }
  if (kind === "tequila") allowed.delete("ageStatement");
  const slug = await resolveSlug({
    table: expressions,
    column: expressions.slug,
    idColumn: expressions.id,
    scope: { column: expressions.ownerId, value: ownerId },
    requested: input.slug,
    fallbackFrom: `${input.name}${input.batch ? ` ${input.batch}` : ""}`,
    ...(id !== null ? { excludeId: id } : {}),
  });
  const values = valuesForGroup(input, allowed, slug);
  if (kind === "tequila" || kind === "mezcal") {
    delete values.barrelFilledOn; delete values.bottledOn; delete values.isNas;
  }
  if (kind !== "tequila") delete values.tequilaClass;
  if (!["cognac", "armagnac", "calvados"].includes(kind)) delete values.brandyGrade;
  if (kind !== "gin") delete values.ginStyle;
  if (!isGinKind(kind)) delete values.isAgedGin;
  if (isGinKind(kind)) {
    values.barrelFilledOn = null; values.bottledOn = null; values.ageStatement = null;
  }
  if (kind === "tequila") {
    values.ageStatement = input.tequilaClass ? TEQUILA_CLASS_LABELS[input.tequilaClass as TequilaClass] : null;
    values.isNas = false;
  }
  if (["cognac", "armagnac", "calvados"].includes(kind) && input.brandyGrade) values.ageStatement = input.brandyGrade;
  if (kind === "tequila" && input.tequilaClass === "blanco") {
    values.ageYears = null; values.ageMonths = null; values.ageDays = null;
  }
  return values;
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
  const [category] = await tx.select({ slug: categories.slug }).from(categories).where(eq(categories.id, Number(values.categoryId))).limit(1);
  if (isSingleMaltCategory(category?.slug)) {
    links = { ...links, mashbills: [{ id: await singleMaltMashbillId(tx, ownerId), amount: null }] };
  }
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
