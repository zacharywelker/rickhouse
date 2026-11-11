import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bottleImages, bottles, brands, categories, expressions, stores } from "@/db/schema";
import { newBottleValues } from "@/lib/bottles/new-bottle";
import { bottlePatchSchema } from "@/lib/bottles/patch-schema";
import { updateBottle } from "@/lib/bottles/state";
import { colaFilesForExpression, deleteColaFiles } from "@/lib/cola/store";
import { mapDbError, pgCode } from "@/lib/db-errors";
import { deleteStoredImage } from "@/lib/images";
import { deleteStoredPhotos, releasePhotosOfLabel } from "@/lib/releases-store";
import { ensureBrand } from "@/lib/expressions/brand";
import { patchLabel } from "@/lib/expressions/label-patch";
import { labelPatchBody } from "@/lib/expressions/label-patch-body";
import { categoryKindsById } from "@/lib/expressions/queries";
import type { CategoryKind } from "@/lib/expressions/rules";
import { expressionSchema } from "@/lib/expressions/schema";
import { fieldErrorsOf, flavorMissing, labelValues, LabelRejected, linksFrom, writeLabel, type Tx } from "@/lib/expressions/save";

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

  // Everything that can be checked without writing is checked first.
  let links: ReturnType<typeof linksFrom> | null = null;
  if ("name" in label) {
    if ((await db.$count(categories, eq(categories.id, label.categoryId))) === 0) return invalidField("categoryId", "Choose a category.");
    const facts = label.facts ?? {};
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
        const made = await ensureLabel(tx, ownerId, brandId, label.name, label.categoryId, label.facts ?? {}, links!);
        labelId = made.id;
        createdLabel = made.created;
        labelFactsIgnored = !made.created && Object.keys(label.facts ?? {}).length > 0;
        spirit = { kind: (await categoryKindsById())[made.categoryId] ?? "other", ginAged: made.isAgedGin };
      }

      // The bottle.
      let bottleId: number | null = null;
      if (bottle) {
        const made = await newBottleValues(bottle, labelId, spirit);
        if (!made.ok) throw new Rejected(failure("invalid", made.error, made.fieldErrors));
        if (made.values.storeId != null && (await tx.$count(stores, and(eq(stores.id, made.values.storeId), eq(stores.ownerId, ownerId)))) === 0) {
          throw new Rejected(invalidField("storeId", "Choose one of your stores."));
        }
        const [inserted] = await tx.insert(bottles).values({ ...made.values, ownerId }).returning({ id: bottles.id });
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

/**
 * Changes a bottle: only the columns sent, nothing else touched, so a sheet that is out of date cannot undo what was
 * changed elsewhere. A label's own facts are refused. `expressionId` moves the bottle to another of the caller's labels,
 * and its tastings and tournament entries go with it.
 */
export async function patchBottleRow(ownerId: number, bottleId: number, raw: unknown): Promise<PatchOutcome> {
  if (!Number.isInteger(bottleId) || bottleId <= 0) return failure("gone", "That bottle is gone.");
  const parsed = bottlePatchSchema.safeParse(raw);
  if (!parsed.success) return invalidFrom(parsed.error.issues);
  const { fillPct, dateOpened, ifOpenedCleared, ...columns } = parsed.data;
  const outcome = await updateBottle(bottleId, ownerId, { fillPct, dateOpened, ifOpenedCleared, columns });
  if (!outcome) return failure("gone", "That bottle is gone.");
  if (!outcome.ok) {
    return failure("invalid", outcome.message, outcome.field ? { [outcome.field]: outcome.message } : outcome.code === "opened_cleared" ? { dateOpened: outcome.message } : {});
  }
  return { ok: true };
}

/**
 * Changes a label: only the facts sent. This is the one request that changes a label shared by several bottles, and
 * it is how a label is renamed or moved to another brand. A name that another of the caller's labels already has is
 * `name_taken`, carrying that label, and nothing is saved. Changing the category never clears stored facts: the
 * facts the new category does not use are simply left as they were.
 */
export async function patchLabelRow(ownerId: number, labelId: number, raw: unknown): Promise<PatchOutcome> {
  if (!Number.isInteger(labelId) || labelId <= 0) return failure("gone", "That label is gone.");
  const parsed = labelPatchBody.safeParse(raw);
  if (!parsed.success) return invalidFrom(parsed.error.issues);
  const { brand, distilleries, mashbills, finishes, ingredients, otherNames, ...facts } = parsed.data;
  const outcome = await patchLabel(ownerId, labelId, {
    facts,
    ...(brand !== undefined ? { brand } : {}),
    ...(distilleries && mashbills && finishes ? { links: { distilleries, mashbills, finishes, ingredients } } : {}),
    ...(ingredients !== undefined ? { ingredients } : {}),
    ...(otherNames !== undefined ? { otherNames } : {}),
  });
  if (outcome.ok) return { ok: true };
  if (outcome.kind === "gone") return failure("gone", "That label is gone.");
  if (outcome.kind === "invalid") return invalidField(outcome.field, outcome.message);
  return { ...failure("name_taken", `You already have ${outcome.existing.title}.`, { name: "Already taken." }), existing: outcome.existing };
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
