import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, expressions } from "@/db/schema";
import { findOrCreateBrand } from "./brand";
import { replaceLinks, type Links } from "./save";
import { expressionSchema } from "./schema";

/**
 * Editing a label from the phone (spec 2026-10-08-edit-facts-design.md, sections 1 and 2): any of the facts
 * below, partially, validated by the same field rules as the web form. A label is unique by brand and name
 * (the name compared without regard to case), so a change that would collide is stopped and reports the
 * label it collides with, which is what the merge offers to resolve.
 */
export const labelFactsSchema = expressionSchema.pick({
  brandId: true,
  categoryId: true,
  name: true,
  proof: true,
  ageYears: true,
  ageStatement: true,
  sizeMl: true,
  msrp: true,
  upc: true,
});

export type LabelFacts = Partial<ReturnType<typeof labelFactsSchema.parse>>;

export type LabelPatch = {
  facts: LabelFacts;
  /** A brand by name: found (any case) or created, in the same transaction as the label. Instead of `facts.brandId`. */
  brand?: string;
  /** The three ordered lists together, as `replaceLinks` rewrites them. */
  links?: Links;
};

export type LabelPatchResult =
  | { ok: true }
  | { ok: false; kind: "gone" }
  | { ok: false; kind: "invalid"; field: string; message: string }
  | { ok: false; kind: "name_taken"; existing: { id: number; title: string } };

/** Postgres's error code, found through drizzle's wrapper the way mapDbError does. */
function pgCode(error: unknown): string | null {
  let cursor: unknown = error;
  for (let depth = 0; depth < 5 && typeof cursor === "object" && cursor !== null; depth += 1) {
    const candidate = cursor as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") return candidate.code;
    cursor = candidate.cause;
  }
  return null;
}

async function labelCalled(ownerId: number, brandId: number, name: string, exceptId: number) {
  const [row] = await db
    .select({ id: expressions.id, name: expressions.name, brand: brands.name })
    .from(expressions)
    .innerJoin(brands, eq(brands.id, expressions.brandId))
    .where(and(eq(expressions.ownerId, ownerId), eq(expressions.brandId, brandId), eq(expressions.name, name), ne(expressions.id, exceptId)))
    .limit(1);
  return row ? { id: row.id, title: `${row.brand} ${row.name}` } : null;
}

export async function patchLabel(ownerId: number, id: number, patch: LabelPatch): Promise<LabelPatchResult> {
  try {
    return await db.transaction(async (tx): Promise<LabelPatchResult> => {
      const [current] = await tx
        .select({ brandId: expressions.brandId, name: expressions.name })
        .from(expressions)
        .where(and(eq(expressions.id, id), eq(expressions.ownerId, ownerId)))
        .for("update")
        .limit(1);
      if (!current) return { ok: false, kind: "gone" };

      const { facts } = patch;
      if (facts.categoryId !== undefined && (await tx.$count(categories, eq(categories.id, facts.categoryId))) === 0) {
        return { ok: false, kind: "invalid", field: "categoryId", message: "Choose a category." };
      }

      // Which brand the label ends up under. A brand named but not yet existing is created only after the clash check.
      let brandId = current.brandId;
      let newBrandName: string | null = null;
      if (facts.brandId !== undefined) {
        if ((await tx.$count(brands, and(eq(brands.id, facts.brandId), eq(brands.ownerId, ownerId)))) === 0) {
          return { ok: false, kind: "invalid", field: "brandId", message: "Choose one of your brands." };
        }
        brandId = facts.brandId;
      } else if (patch.brand !== undefined) {
        const [found] = await tx
          .select({ id: brands.id })
          .from(brands)
          .where(and(eq(brands.ownerId, ownerId), eq(brands.name, patch.brand)))
          .limit(1);
        if (found) brandId = found.id;
        else newBrandName = patch.brand;
      }

      const name = facts.name ?? current.name;
      if (newBrandName === null && (brandId !== current.brandId || name.toLowerCase() !== current.name.toLowerCase())) {
        const taken = await labelCalled(ownerId, brandId, name, id);
        if (taken) return { ok: false, kind: "name_taken", existing: taken };
      }
      if (newBrandName !== null) brandId = await findOrCreateBrand(tx, ownerId, newBrandName);

      const { brandId: _ignored, ...columns } = facts;
      const set = { ...columns, ...(brandId !== current.brandId ? { brandId } : {}) };
      if (Object.keys(set).length > 0) {
        await tx.update(expressions).set(set).where(and(eq(expressions.id, id), eq(expressions.ownerId, ownerId)));
      }
      if (patch.links) await replaceLinks(tx, ownerId, id, patch.links);
      return { ok: true };
    });
  } catch (error: unknown) {
    // Two phones (or the web) renamed to the same name at once: the database has the last word.
    const code = pgCode(error);
    // A link to a row that is not the caller's (a trigger) or does not exist (a foreign key).
    if (patch.links && (code === "23514" || code === "23503")) {
      return { ok: false, kind: "invalid", field: "distilleries", message: "Choose from your own distilleries, mashbills and finishes." };
    }
    if (code === "23505") {
      const [current] = await db.select({ brandId: expressions.brandId, name: expressions.name }).from(expressions).where(and(eq(expressions.id, id), eq(expressions.ownerId, ownerId))).limit(1);
      const brandId = patch.facts.brandId ?? current?.brandId;
      const taken = brandId !== undefined ? await labelCalled(ownerId, brandId, patch.facts.name ?? current?.name ?? "", id) : null;
      if (taken) return { ok: false, kind: "name_taken", existing: taken };
    }
    throw error;
  }
}
