import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { BOTTLE_STATUSES, bottleImages, bottles, brands, categories, expressions, stores } from "@/db/schema";
import { newBottleValues } from "@/lib/bottles/new-bottle";
import { statusUpdate } from "@/lib/bottles/status-rules";
import { bottlePatchSchema } from "@/lib/bottles/patch-schema";
import { updateBottle } from "@/lib/bottles/state";
import { colaFilesForExpression, deleteColaFiles } from "@/lib/cola/store";
import { mapDbError, pgCode } from "@/lib/db-errors";
import { deleteStoredImage } from "@/lib/images";
import { deleteStoredPhotos, releasePhotosOfLabel } from "@/lib/releases-store";
import { ensureBrand } from "@/lib/expressions/brand";
import { patchLabel } from "@/lib/expressions/label-patch";
import { bulkLabelPatchBody } from "@/lib/expressions/label-patch-body";
import { categoryKindsById } from "@/lib/expressions/queries";
import type { CategoryKind } from "@/lib/expressions/rules";
import { expressionSchema } from "@/lib/expressions/schema";
import { fieldErrorsOf, flavorMissing, labelValues, LabelRejected, linksFrom, writeLabel, type Tx } from "@/lib/expressions/save";
import { derivedAge } from "./age-derive";
import { ensureCooperage, ensureStore, takeBack } from "./reference-rows";
import { fieldGroupForCategory } from "@/lib/expressions/queries";

/**
 * The server half of the bulk editor, one row at a time, in the signed-in account (`ownerId`). A row is a label, a
 * bottle, or a label with its first bottle. Three requests, and they do different things on purpose:
 *
 * - `createRow` makes a new label and/or bottle, creating the brand and label if they are new. Everything in one
 *   transaction: a row that fails leaves no stray brand or label behind.
 * - `patchBottleRow` changes only the bottle columns sent. It cannot carry a label's facts. Changing its label moves it.
 * - `patchLabelRow` changes only the label facts sent: the one way a label shared by several bottles changes.
 *
 * Nothing here trusts the browser. Every id is checked against `ownerId`, an unknown field is refused, and a
 * request that fails says which field failed.
 */

export type RowFailure = {
  ok: false;
  kind: "invalid" | "gone" | "name_taken";
  error: string;
  fieldErrors: Record<string, string>;
  /** For `name_taken`: the label the name collides with. */
  existing?: { id: number; title: string };
};

export type CreateOutcome =
  | {
      ok: true;
      brandId: number;
      labelId: number;
      bottleId: number | null;
      created: { brand: boolean; label: boolean; bottle: boolean };
      /** The label already existed, so the label facts sent with this row were not used. */
      labelFactsIgnored: boolean;
    }
  | RowFailure;

export type PatchOutcome = { ok: true } | RowFailure;

const failure = (kind: RowFailure["kind"], error: string, fieldErrors: Record<string, string> = {}): RowFailure => ({ ok: false, kind, error, fieldErrors });
const invalidField = (field: string, message: string) => failure("invalid", message, { [field]: message });

/**
 * A store or cooperage can be named in a cell instead of picked (`storeName`, `cooperageName`): it is found, or made if
 * it is new. A name next to the id it would replace is a mistake in the request, not a choice to make for it.
 */
const newName = z.string().trim().min(1, "Enter a name.").max(120, "Keep this under 120 characters.");
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Takes `key` (a name) out of `body` and returns the cleaned name, or a failure. Undefined when it was not sent. */
function takeName(body: Record<string, unknown>, key: string, idKey: string): { name?: string; failure?: RowFailure } {
  if (!(key in body)) return {};
  const raw = body[key];
  delete body[key];
  const parsed = newName.safeParse(raw);
  if (!parsed.success) return { failure: invalidField(key, parsed.error.issues[0]?.message ?? "Enter a name.") };
  if (body[idKey] !== undefined) return { failure: invalidField(key, `Send ${idKey} or ${key}, not both.`) };
  return { name: parsed.data };
}

/** Thrown inside a transaction to roll it back with a failure the person can fix. */
class Rejected extends Error {
  constructor(readonly outcome: RowFailure) {
    super(outcome.error);
  }
}

function invalidFrom(issues: ReadonlyArray<{ code?: string; path: PropertyKey[]; message: string }>): RowFailure {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const [first, second] = issue.path;
    // A choice that matched neither shape (an id, or a name) reads as the one thing it was for.
    let key = typeof first === "string" ? first : "";
    if (first === "label" && second === "name") key = "label";
    if (first === "label" && second === "categoryId") key = "categoryId";
    if (key && !(key in fieldErrors)) {
      fieldErrors[key] = issue.code === "invalid_union" ? (key === "brand" ? "Choose a brand or enter a new one." : "Choose a label or enter a new one.") : issue.message;
    }
  }
  const message = Object.values(fieldErrors)[0] ?? issues[0]?.message ?? "Please check the highlighted fields.";
  return failure("invalid", message, fieldErrors);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const posInt = z.number().int().positive();
const newRowSchema = z
  .object({
    brand: z.union([
      z.object({ id: posInt }).strict(),
      z.object({ name: z.string().trim().min(1, "Enter a brand.").max(120, "Keep this under 120 characters.") }).strict(),
    ]),
    label: z.union([
      z.object({ id: posInt }).strict(),
      z
        .object({
          name: z.string().trim().min(1, "Enter a label name.").max(160, "Keep this under 160 characters."),
          categoryId: posInt,
          facts: z.record(z.string(), z.unknown()).optional(),
        })
        .strict(),
    ]),
    bottle: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

type Spirit = { kind: CategoryKind; ginAged: boolean };

/**
 * A new row: a label (chosen, or named and created) under a brand (chosen, or named and created), and a bottle on it
 * if `bottle` is sent. A label that is chosen by id takes no facts; one that is named and already exists under the
 * brand is used as it is (`labelFactsIgnored` says so), which is how two rows for the same new label end up on one.
 */
export async function createRow(ownerId: number, raw: unknown): Promise<CreateOutcome> {
  const parsed = newRowSchema.safeParse(raw);
  if (!parsed.success) return invalidFrom(parsed.error.issues);
  const { brand, label, bottle } = parsed.data;
  // A new store or cooperage is named in the row; it is made inside the transaction below, with the label and bottle.
  const bottleBody = bottle ? { ...bottle } : undefined;
  const storeNamed = bottleBody ? takeName(bottleBody, "storeName", "storeId") : {};
  if (storeNamed.failure) return storeNamed.failure;
  const labelFacts = "name" in label && label.facts ? { ...label.facts } : undefined;
  const cooperageNamed = labelFacts ? takeName(labelFacts, "cooperageName", "cooperageId") : {};
  if (cooperageNamed.failure) return cooperageNamed.failure;

  // A whiskey's age statement fills the years in, as the forms do (and an entered age is never replaced).
  if (labelFacts && "name" in label) Object.assign(labelFacts, derivedAge(null, labelFacts, (await fieldGroupForCategory(label.categoryId)) === "whiskey"));

  // Everything that can be checked without writing is checked first.
  let links: ReturnType<typeof linksFrom> | null = null;
  if ("name" in label) {
    if ((await db.$count(categories, eq(categories.id, label.categoryId))) === 0) return invalidField("categoryId", "Choose a category.");
    const facts: Record<string, unknown> = { ...(labelFacts ?? {}), ...(cooperageNamed.name !== undefined ? { cooperageId: 1 } : {}) };
    // The brand is not known until it is found or created; its id is not what is being checked here.
    const checked = expressionSchema.safeParse({ ...facts, brandId: 1, categoryId: label.categoryId, name: label.name });
    if (!checked.success) return failure("invalid", checked.error.issues[0]?.message ?? "Please check the highlighted fields.", fieldErrorsOf(checked.error.issues));
    links = linksFrom(facts);
    const kind = (await categoryKindsById())[label.categoryId] ?? "other";
    if (await flavorMissing(label.categoryId, kind, links.ingredients)) return invalidField("ingredientLinks", "Add at least one flavor.");
  }

  try {
    return await db.transaction(async (tx): Promise<CreateOutcome> => {
      // The brand.
      let brandId: number;
      let createdBrand = false;
      if ("id" in brand) {
        if ((await tx.$count(brands, and(eq(brands.id, brand.id), eq(brands.ownerId, ownerId)))) === 0) {
          throw new Rejected(invalidField("brand", "Choose one of your brands."));
        }
        brandId = brand.id;
      } else {
        const made = await ensureBrand(tx, ownerId, brand.name);
        brandId = made.id;
        createdBrand = made.created;
      }

      // The label.
      let labelId: number;
      let spirit: Spirit;
      let createdLabel = false;
      let labelFactsIgnored = false;
      if ("id" in label) {
        const [row] = await tx
          .select({ id: expressions.id, brandId: expressions.brandId, categoryId: expressions.categoryId, isAgedGin: expressions.isAgedGin })
          .from(expressions)
          .where(and(eq(expressions.id, label.id), eq(expressions.ownerId, ownerId)))
          .limit(1);
        if (!row) throw new Rejected(invalidField("label", "Choose one of your labels."));
        if (row.brandId !== brandId) throw new Rejected(invalidField("label", "That label is not under this brand."));
        labelId = row.id;
        spirit = { kind: (await categoryKindsById())[row.categoryId] ?? "other", ginAged: row.isAgedGin };
      } else {
        const facts = { ...(labelFacts ?? {}) };
        if (cooperageNamed.name !== undefined) facts.cooperageId = (await ensureCooperage(tx, ownerId, cooperageNamed.name)).id;
        const made = await ensureLabel(tx, ownerId, brandId, label.name, label.categoryId, facts, links!);
        labelId = made.id;
        createdLabel = made.created;
        labelFactsIgnored = !made.created && Object.keys(labelFacts ?? {}).length + (cooperageNamed.name !== undefined ? 1 : 0) > 0;
        spirit = { kind: (await categoryKindsById())[made.categoryId] ?? "other", ginAged: made.isAgedGin };
      }

      // The bottle.
      let bottleId: number | null = null;
      if (bottleBody) {
        const [group] = await tx.select({ group: categories.fieldGroup }).from(expressions).innerJoin(categories, eq(categories.id, expressions.categoryId)).where(eq(expressions.id, labelId)).limit(1);
        Object.assign(bottleBody, derivedAge(null, bottleBody, group?.group === "whiskey"));
        if (storeNamed.name !== undefined) bottleBody.storeId = (await ensureStore(tx, ownerId, storeNamed.name)).id;
        const made = await newBottleValues(bottleBody, labelId, spirit);
        if (!made.ok) throw new Rejected(failure("invalid", made.error, made.fieldErrors));
        if (made.values.storeId != null && (await tx.$count(stores, and(eq(stores.id, made.values.storeId), eq(stores.ownerId, ownerId)))) === 0) {
          throw new Rejected(invalidField("storeId", "Choose one of your stores."));
        }
        // A status that is not simply owned or open is held to what it means (killed is empty, a wishlist bottle is sealed).
        const values = { ...made.values } as Record<string, unknown> & typeof made.values;
        if (values.status && values.status !== "owned" && values.status !== "open") {
          const asOwned = { isOpen: values.isOpen ?? false, dateOpened: values.dateOpened ?? null, dateKilled: values.dateKilled ?? null, fillPct: values.fillPct ?? 100, status: "owned" };
          const next = statusUpdate(asOwned, values.status, new Date().toISOString().slice(0, 10));
          if (!next.ok) throw new Rejected(invalidField("status", next.message));
          Object.assign(values, next.set);
        }
        const [inserted] = await tx.insert(bottles).values({ ...values, ownerId }).returning({ id: bottles.id });
        bottleId = inserted!.id;
      }

      return { ok: true, brandId, labelId, bottleId, created: { brand: createdBrand, label: createdLabel, bottle: bottleId !== null }, labelFactsIgnored };
    });
  } catch (error: unknown) {
    if (error instanceof Rejected) return error.outcome;
    if (error instanceof LabelRejected) return invalidField("ingredientLinks", error.message);
    const shaped = mapDbError(error, { singular: "Label" });
    return failure("invalid", shaped.ok ? "Could not save this row." : shaped.error, shaped.ok ? {} : (shaped.fieldErrors ?? {}));
  }
}

/**
 * The label of this name under the brand, created if it is new. Safe when two saves of the same new label run at
 * once: the loser's insert fails on the unique key, which is rolled back to a savepoint and followed by a look at
 * what the winner made.
 */
async function ensureLabel(
  tx: Tx,
  ownerId: number,
  brandId: number,
  name: string,
  categoryId: number,
  facts: Record<string, unknown>,
  links: ReturnType<typeof linksFrom>,
): Promise<{ id: number; created: boolean; categoryId: number; isAgedGin: boolean }> {
  const find = async () => {
    const [row] = await tx
      .select({ id: expressions.id, categoryId: expressions.categoryId, isAgedGin: expressions.isAgedGin })
      .from(expressions)
      .where(and(eq(expressions.ownerId, ownerId), eq(expressions.brandId, brandId), eq(expressions.name, name)))
      .limit(1);
    return row ?? null;
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await find();
    if (existing) return { ...existing, created: false };
    try {
      const made = await tx.transaction(async (savepoint) => {
        const input = expressionSchema.parse({ ...facts, brandId, categoryId, name });
        return { id: await writeLabel(savepoint, ownerId, null, await labelValues(input, ownerId, null), links), isAgedGin: input.isAgedGin };
      });
      return { id: made.id, created: true, categoryId, isAgedGin: made.isAgedGin };
    } catch (error: unknown) {
      // Lost the race for the name, or for the slug: look again, and try again if it was only the slug.
      if (pgCode(error) !== "23505") throw error;
    }
  }
  throw new Error(`Could not create the label "${name}".`);
}

// ---------------------------------------------------------------------------
// Patch
// ---------------------------------------------------------------------------

/** Where a bottle is in its life, which the phone's request cannot send: the bulk editor's own part of a bottle patch. */
const lifeSchema = z
  .object({
    status: z.enum(BOTTLE_STATUSES),
    isOpen: z.boolean(),
    dateKilled: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date.").nullable(),
    isFavorite: z.boolean(),
  })
  .partial()
  .strict();

/**
 * Changes a bottle: only the columns sent, nothing else touched, so a sheet that is out of date cannot undo what was
 * changed elsewhere. A label's own facts are refused. `expressionId` moves the bottle to another of the caller's labels,
 * and its tastings and tournament entries go with it.
 */
export async function patchBottleRow(ownerId: number, bottleId: number, raw: unknown): Promise<PatchOutcome> {
  if (!Number.isInteger(bottleId) || bottleId <= 0) return failure("gone", "That bottle is gone.");
  // Two things the phone's request does not take: a store named instead of picked, and which of the label's names the bottle shows.
  const body = isRecord(raw) ? { ...raw } : raw;
  let named: string | undefined;
  let version: number | null | undefined;
  let life: z.infer<typeof lifeSchema> = {};
  if (isRecord(body)) {
    const taken: Record<string, unknown> = {};
    for (const key of ["status", "isOpen", "dateKilled", "isFavorite"]) {
      if (key in body) {
        taken[key] = body[key];
        delete body[key];
      }
    }
    const parsedLife = lifeSchema.safeParse(taken);
    if (!parsedLife.success) {
      const issue = parsedLife.error.issues[0]!;
      return invalidField(String(issue.path[0] ?? "status"), issue.message);
    }
    life = parsedLife.data;
    const store = takeName(body, "storeName", "storeId");
    if (store.failure) return store.failure;
    named = store.name;
    if ("expressionNameId" in body) {
      const parsedVersion = posInt.nullable().safeParse(body.expressionNameId);
      if (!parsedVersion.success) return invalidField("expressionNameId", "Choose one of this label's names.");
      version = parsedVersion.data;
      delete body.expressionNameId;
    }
  }
  let source: "entered" | "derived" | undefined;
  if (isRecord(body) && ["ageYears", "ageMonths", "ageDays", "ageStatement"].some((key) => key in body)) {
    const [current] = await db
      .select({ ageYears: bottles.ageYears, ageMonths: bottles.ageMonths, ageDays: bottles.ageDays, ageStatement: bottles.ageStatement, ageYearsSource: bottles.ageYearsSource, group: categories.fieldGroup })
      .from(bottles)
      .innerJoin(expressions, eq(expressions.id, bottles.expressionId))
      .innerJoin(categories, eq(categories.id, expressions.categoryId))
      .where(and(eq(bottles.id, bottleId), eq(bottles.ownerId, ownerId)))
      .limit(1);
    if (current) {
      const { ageYearsSource, ...more } = derivedAge(current, { ...body }, current.group === "whiskey");
      Object.assign(body, more);
      source = ageYearsSource as typeof source;
    }
  }
  const made: { store?: number } = {};
  try {
    if (named !== undefined && isRecord(body)) {
      const store = await db.transaction((tx) => ensureStore(tx, ownerId, named!));
      body.storeId = store.id;
      if (store.created) made.store = store.id;
    }
    // A request that only names a label version has nothing else for the phone's schema to check.
    const onlyVersion = isRecord(body) && Object.keys(body).length === 0 && (version !== undefined || Object.keys(life).length > 0);
    const parsed = onlyVersion ? { success: true as const, data: {} as z.infer<typeof bottlePatchSchema> } : bottlePatchSchema.safeParse(body);
    if (!parsed.success) return await undo(made, invalidFrom(parsed.error.issues));
    const { fillPct, dateOpened, ifOpenedCleared, ...columns } = parsed.data;
    const { status, isOpen, ...own } = life;
    const outcome = await updateBottle(bottleId, ownerId, {
      fillPct, dateOpened, ifOpenedCleared,
      ...(status !== undefined ? { status } : {}),
      ...(isOpen !== undefined ? { isOpen } : {}),
      columns: { ...columns, ...own, ...(version !== undefined ? { expressionNameId: version } : {}), ...(source !== undefined ? { ageYearsSource: source } : {}) },
    });
    if (!outcome) return await undo(made, failure("gone", "That bottle is gone."));
    if (!outcome.ok) {
      return await undo(made, failure("invalid", outcome.message, outcome.field ? { [outcome.field]: outcome.message } : outcome.code === "opened_cleared" ? { dateOpened: outcome.message } : {}));
    }
    return { ok: true };
  } catch (error: unknown) {
    await undo(made, null);
    throw error;
  }
}

/** A failed patch gives back the store or cooperage it made for itself, then returns its failure. */
async function undo<T extends RowFailure | null>(made: { store?: number; cooperage?: number }, outcome: T): Promise<T> {
  if (made.store !== undefined || made.cooperage !== undefined) await db.transaction((tx) => takeBack(tx, made));
  return outcome;
}

/**
 * Changes a label: only the facts sent. This is the one request that changes a label shared by several bottles, and
 * it is how a label is renamed or moved to another brand. A name that another of the caller's labels already has is
 * `name_taken`, carrying that label, and nothing is saved. Changing the category never clears stored facts: the
 * facts the new category does not use are simply left as they were.
 */
export async function patchLabelRow(ownerId: number, labelId: number, raw: unknown): Promise<PatchOutcome> {
  if (!Number.isInteger(labelId) || labelId <= 0) return failure("gone", "That label is gone.");
  const body = isRecord(raw) ? { ...raw } : raw;
  let named: string | undefined;
  if (isRecord(body)) {
    const cooperage = takeName(body, "cooperageName", "cooperageId");
    if (cooperage.failure) return cooperage.failure;
    named = cooperage.name;
  }
  const made: { cooperage?: number } = {};
  if (isRecord(body) && ["ageYears", "ageMonths", "ageDays", "ageStatement"].some((key) => key in body)) {
    const [current] = await db
      .select({ ageYears: expressions.ageYears, ageMonths: expressions.ageMonths, ageDays: expressions.ageDays, ageStatement: expressions.ageStatement, ageYearsSource: expressions.ageYearsSource, group: categories.fieldGroup })
      .from(expressions)
      .innerJoin(categories, eq(categories.id, expressions.categoryId))
      .where(and(eq(expressions.id, labelId), eq(expressions.ownerId, ownerId)))
      .limit(1);
    if (current) Object.assign(body, derivedAge(current, { ...body }, current.group === "whiskey"));
  }
  if (named !== undefined && isRecord(body)) {
    const cooperage = await db.transaction((tx) => ensureCooperage(tx, ownerId, named!));
    body.cooperageId = cooperage.id;
    if (cooperage.created) made.cooperage = cooperage.id;
  }
  try {
    return await patchLabelWith(ownerId, labelId, body, made);
  } catch (error: unknown) {
    await undo(made, null);
    throw error;
  }
}

async function patchLabelWith(ownerId: number, labelId: number, body: unknown, made: { cooperage?: number }): Promise<PatchOutcome> {
  const parsed = bulkLabelPatchBody.safeParse(body);
  if (!parsed.success) return undo(made, invalidFrom(parsed.error.issues));
  const { brand, distilleries, mashbills, finishes, ingredients, otherNames, ...facts } = parsed.data;
  const outcome = await patchLabel(ownerId, labelId, {
    facts,
    ...(brand !== undefined ? { brand } : {}),
    ...(distilleries && mashbills && finishes ? { links: { distilleries, mashbills, finishes, ingredients } } : {}),
    ...(ingredients !== undefined ? { ingredients } : {}),
    ...(otherNames !== undefined ? { otherNames } : {}),
  });
  if (outcome.ok) return { ok: true };
  if (outcome.kind === "gone") return undo(made, failure("gone", "That label is gone."));
  if (outcome.kind === "invalid") return undo(made, invalidField(outcome.field, outcome.message));
  return undo(made, { ...failure("name_taken", `You already have ${outcome.existing.title}.`, { name: "Already taken." }), existing: outcome.existing });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * What deleting these rows would take with them, for the confirmation: how many of the labels are the caller's, how
 * many bottles are on those labels, and how many of the other chosen bottles are the caller's. A bottle that is on
 * one of the chosen labels is counted once, with its label. Someone else's id counts for nothing.
 */
export async function deleteImpact(ownerId: number, input: { labelIds: number[]; bottleIds: number[] }) {
  const unique = (ids: number[]) => [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  const labelIds = unique(input.labelIds);
  const bottleIds = unique(input.bottleIds);

  const ownedLabels = labelIds.length
    ? (await db.select({ id: expressions.id }).from(expressions).where(and(eq(expressions.ownerId, ownerId), inArray(expressions.id, labelIds)))).map((r) => r.id)
    : [];
  const bottlesOnLabels = ownedLabels.length
    ? await db.$count(bottles, and(eq(bottles.ownerId, ownerId), inArray(bottles.expressionId, ownedLabels)))
    : 0;
  const chosen = bottleIds.length
    ? await db.select({ expressionId: bottles.expressionId }).from(bottles).where(and(eq(bottles.ownerId, ownerId), inArray(bottles.id, bottleIds)))
    : [];
  const onChosenLabels = new Set(ownedLabels);
  return {
    labels: ownedLabels.length,
    bottlesOnLabels,
    bottles: chosen.filter((b) => !onChosenLabels.has(b.expressionId)).length,
  };
}

/**
 * What deleting did. A label goes with every bottle on it (all statuses, not only the ones on the shelf), a bottle on its
 * own leaves its label. Each label and each bottle is deleted on its own, so one that cannot be (something still holds
 * it) is reported and the rest still go.
 */
export type DeleteOutcome = {
  deletedLabels: number;
  /** Every bottle removed: those that went with a label, and those deleted alone. */
  deletedBottles: number;
  failed: Array<{ kind: "label" | "bottle"; id: number; error: string }>;
};

/**
 * Deletes rows, in the signed-in account only. Photos on disk are removed once the rows are gone from the database, so
 * a row that fails to delete keeps its photos. Another account's id is "gone", and nothing of it is touched.
 */
export async function deleteRows(ownerId: number, input: { labelIds: number[]; bottleIds: number[] }): Promise<DeleteOutcome> {
  const unique = (ids: number[]) => [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  const labelIds = unique(input.labelIds);
  const outcome: DeleteOutcome = { deletedLabels: 0, deletedBottles: 0, failed: [] };

  const owned = labelIds.length ? new Set((await db.select({ id: expressions.id }).from(expressions).where(and(eq(expressions.ownerId, ownerId), inArray(expressions.id, labelIds)))).map((r) => r.id)) : new Set<number>();
  for (const id of labelIds) if (!owned.has(id)) outcome.failed.push({ kind: "label", id, error: "That label is gone." });

  // A label with its bottles. The bottles must go first: a label still holding one cannot be deleted.
  const wentWithLabel = new Set<number>();
  for (const id of owned) {
    try {
      const onLabel = await db.select({ id: bottles.id }).from(bottles).where(and(eq(bottles.expressionId, id), eq(bottles.ownerId, ownerId)));
      const bottleIds = onLabel.map((b) => b.id);
      const images = bottleIds.length ? await db.select({ filePath: bottleImages.filePath, thumbPath: bottleImages.thumbPath }).from(bottleImages).where(inArray(bottleImages.bottleId, bottleIds)) : [];
      const colaFiles = await colaFilesForExpression(id);
      const releasePhotos = await releasePhotosOfLabel(id);
      const gone = await db.transaction(async (tx) => {
        await tx.delete(bottles).where(and(eq(bottles.expressionId, id), eq(bottles.ownerId, ownerId)));
        return tx.delete(expressions).where(and(eq(expressions.id, id), eq(expressions.ownerId, ownerId))).returning({ photoPath: expressions.photoPath, photoThumbPath: expressions.photoThumbPath });
      });
      if (gone.length === 0) {
        outcome.failed.push({ kind: "label", id, error: "That label is gone." });
        continue;
      }
      outcome.deletedLabels += 1;
      outcome.deletedBottles += bottleIds.length;
      for (const b of bottleIds) wentWithLabel.add(b);
      await Promise.all([
        ...images.map((image) => deleteStoredImage(image.filePath, image.thumbPath)),
        gone[0]?.photoPath ? deleteStoredImage(gone[0].photoPath, gone[0].photoThumbPath) : Promise.resolve(),
        deleteColaFiles(colaFiles),
        deleteStoredPhotos(releasePhotos),
      ]);
    } catch (error: unknown) {
      const shaped = mapDbError(error, { singular: "Label" });
      outcome.failed.push({ kind: "label", id, error: shaped.ok ? "Could not delete this label." : shaped.error });
    }
  }

  // Bottles on their own. One that sat on a label deleted above went with it, and is not counted twice or called gone.
  for (const id of unique(input.bottleIds)) {
    if (wentWithLabel.has(id)) continue;
    try {
      const [row] = await db.select({ expressionId: bottles.expressionId }).from(bottles).where(and(eq(bottles.id, id), eq(bottles.ownerId, ownerId))).limit(1);
      if (!row) {
        outcome.failed.push({ kind: "bottle", id, error: "That bottle is gone." });
        continue;
      }
      const images = await db.select({ filePath: bottleImages.filePath, thumbPath: bottleImages.thumbPath }).from(bottleImages).where(eq(bottleImages.bottleId, id));
      await db.delete(bottles).where(and(eq(bottles.id, id), eq(bottles.ownerId, ownerId)));
      outcome.deletedBottles += 1;
      await Promise.all(images.map((image) => deleteStoredImage(image.filePath, image.thumbPath)));
    } catch (error: unknown) {
      const shaped = mapDbError(error, { singular: "Bottle" });
      outcome.failed.push({ kind: "bottle", id, error: shaped.ok ? "Could not delete this bottle." : shaped.error });
    }
  }
  return outcome;
}
