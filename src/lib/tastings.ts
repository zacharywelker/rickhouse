import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { bottleImages, bottles, brands, categories, expressionReleases, expressions, tastingNotes } from "@/db/schema";
import type { tastingEditSchema, tastingSchema } from "@/lib/expressions/schema";
import { unknownTags, WHEELS, type WheelId } from "@/lib/tasting-wheels";
import { wheelOfLabel } from "@/lib/tasting-wheel-for";

/**
 * Every tasting the owner has logged, newest first, each with its label and (when it has one) its bottle. A
 * tasting belongs to a label, so a pour of a bottle the owner does not have is here too (SPEC M9).
 */
export async function queryTastings(ownerId: number, page: number, size: number) {
  const mine = eq(tastingNotes.ownerId, ownerId);
  const [counted] = await db.select({ total: count() }).from(tastingNotes).where(mine);
  const total = counted?.total ?? 0;

  const rows = await db
    .select({
      id: tastingNotes.id,
      bottleId: tastingNotes.bottleId,
      expressionId: expressions.id,
      brand: brands.name,
      name: expressions.name,
      category: categories.name,
      source: tastingNotes.source,
      tastedAt: tastingNotes.tastedAt,
      tastedOn: tastingNotes.tastedOn,
      rating: tastingNotes.rating,
      tags: tastingNotes.tags,
      nose: tastingNotes.nose,
      palate: tastingNotes.palate,
      finish: tastingNotes.finish,
      overall: tastingNotes.overall,
      // The bottle's own photo, then its release's, then its label's. A pour with no bottle uses the label's.
      thumbPath: sql<string | null>`coalesce((
        select coalesce(${bottleImages.thumbPath}, ${bottleImages.filePath}) from ${bottleImages}
        where ${bottleImages.bottleId} = ${bottles.id}
        order by ${bottleImages.isPrimary} desc, ${bottleImages.sortOrder}, ${bottleImages.id}
        limit 1
      ), ${expressionReleases.photoThumbPath}, ${expressionReleases.photoPath}, ${expressions.photoThumbPath}, ${expressions.photoPath})`,
    })
    .from(tastingNotes)
    .innerJoin(expressions, eq(expressions.id, tastingNotes.expressionId))
    .innerJoin(brands, eq(brands.id, expressions.brandId))
    .innerJoin(categories, eq(categories.id, expressions.categoryId))
    .leftJoin(bottles, eq(bottles.id, tastingNotes.bottleId))
    .leftJoin(expressionReleases, eq(expressionReleases.id, bottles.releaseId))
    .where(mine)
    .orderBy(desc(tastingNotes.tastedOn), desc(tastingNotes.id))
    .limit(size)
    .offset((page - 1) * size);

  return { total, pageCount: Math.max(1, Math.ceil(total / size)), rows };
}

export type TastingResult =
  | { ok: true; id: number }
  | { ok: false; status: 404 | 422; message: string; fields?: Record<string, string> };

const gone = (message: string): TastingResult => ({ ok: false, status: 404, message });

/** A 422 when a tasting's flavor keys are not on the label's wheel; with no wheel, any key is. */
function tagProblem(wheel: WheelId | null, tags: string[]): TastingResult | null {
  const bad = unknownTags(wheel, tags);
  if (bad.length === 0) return null;
  const message =
    wheel === null
      ? "There is no flavor list for this kind of spirit yet."
      : `Not a flavor on the ${WHEELS[wheel].name}: ${bad.slice(0, 3).join(", ")}.`;
  return { ok: false, status: 422, message, fields: { tags: message } };
}

/**
 * Logs a tasting of one of the owner's labels. A bottle, when given, must be the owner's bottle of that label, and
 * makes the source "owned". Flavors must be on the label's wheel.
 */
export async function createTasting(ownerId: number, input: z.infer<typeof tastingSchema>): Promise<TastingResult> {
  const label = await wheelOfLabel(input.expressionId, ownerId);
  if (!label) return gone("That label is gone.");

  if (input.bottleId !== null) {
    const own = await db.$count(
      bottles,
      and(eq(bottles.id, input.bottleId), eq(bottles.ownerId, ownerId), eq(bottles.expressionId, input.expressionId)),
    );
    if (own === 0) {
      const message = "That isn't one of your bottles of this label.";
      return { ok: false, status: 422, message, fields: { bottleId: message } };
    }
  }
  const problem = tagProblem(label.wheel, input.tags);
  if (problem) return problem;

  const { expressionId, bottleId, source, ...rest } = input;
  const [row] = await db
    .insert(tastingNotes)
    .values({ ownerId, expressionId, bottleId, source: bottleId === null ? source : "owned", ...rest })
    .returning({ id: tastingNotes.id });
  return { ok: true, id: row!.id };
}

/** Changes a tasting of the owner's. Its label and bottle stay; a note on a bottle stays "owned". */
export async function updateTasting(ownerId: number, id: number, input: z.infer<typeof tastingEditSchema>): Promise<TastingResult> {
  const [note] = await db
    .select({ expressionId: tastingNotes.expressionId, bottleId: tastingNotes.bottleId })
    .from(tastingNotes)
    .where(and(eq(tastingNotes.id, id), eq(tastingNotes.ownerId, ownerId)))
    .limit(1);
  if (!note) return gone("That tasting is gone.");

  const label = await wheelOfLabel(note.expressionId, ownerId);
  const problem = tagProblem(label?.wheel ?? null, input.tags);
  if (problem) return problem;

  const { source, ...rest } = input;
  await db
    .update(tastingNotes)
    .set({ ...rest, source: note.bottleId === null ? source : "owned" })
    .where(and(eq(tastingNotes.id, id), eq(tastingNotes.ownerId, ownerId)));
  return { ok: true, id };
}

/** False when the tasting is not the owner's. */
export async function deleteTasting(ownerId: number, id: number): Promise<boolean> {
  const rows = await db
    .delete(tastingNotes)
    .where(and(eq(tastingNotes.id, id), eq(tastingNotes.ownerId, ownerId)))
    .returning({ id: tastingNotes.id });
  return rows.length > 0;
}
