import "server-only";
import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottleImages, bottles, brands, categories, expressionReleases, expressions, tastingNotes } from "@/db/schema";

/**
 * Every tasting note on the owner's bottles, newest first, each with the label and bottle it belongs to.
 * A note is stored against a bottle, so a pour of a bottle the owner doesn't have isn't here yet.
 */
export async function queryTastings(ownerId: number, page: number, size: number) {
  const mine = eq(bottles.ownerId, ownerId);
  const [counted] = await db
    .select({ total: count() })
    .from(tastingNotes)
    .innerJoin(bottles, eq(tastingNotes.bottleId, bottles.id))
    .where(mine);

  const total = counted?.total ?? 0;

  const rows = await db
    .select({
      id: tastingNotes.id,
      bottleId: tastingNotes.bottleId,
      expressionId: expressions.id,
      brand: brands.name,
      name: expressions.name,
      category: categories.name,
      tastedOn: tastingNotes.tastedOn,
      rating: tastingNotes.rating,
      nose: tastingNotes.nose,
      palate: tastingNotes.palate,
      finish: tastingNotes.finish,
      overall: tastingNotes.overall,
      // The bottle's own photo, then its release's, then its label's.
      thumbPath: sql<string | null>`coalesce((
        select coalesce(${bottleImages.thumbPath}, ${bottleImages.filePath}) from ${bottleImages}
        where ${bottleImages.bottleId} = ${bottles.id}
        order by ${bottleImages.isPrimary} desc, ${bottleImages.sortOrder}, ${bottleImages.id}
        limit 1
      ), ${expressionReleases.photoThumbPath}, ${expressionReleases.photoPath}, ${expressions.photoThumbPath}, ${expressions.photoPath})`,
    })
    .from(tastingNotes)
    .innerJoin(bottles, eq(tastingNotes.bottleId, bottles.id))
    .innerJoin(expressions, eq(expressions.id, bottles.expressionId))
    .innerJoin(brands, eq(brands.id, expressions.brandId))
    .innerJoin(categories, eq(categories.id, expressions.categoryId))
    .leftJoin(expressionReleases, eq(expressionReleases.id, bottles.releaseId))
    .where(mine)
    .orderBy(desc(tastingNotes.tastedOn), desc(tastingNotes.id))
    .limit(size)
    .offset((page - 1) * size);

  return { total, pageCount: Math.max(1, Math.ceil(total / size)), rows };
}
