import "server-only";
import { and, asc, count, eq, isNull, notExists, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottles, bottleImages, brands, categories, expressions, expressionReleases } from "@/db/schema";
import type { PhotoTab } from "@/lib/housekeeping/photo-params";

export type MissingPhoto = {
  key: string;
  name: string;
  meta: string;
  seed: number;
  target:
    | { kind: "label"; expressionId: number }
    | { kind: "vintage"; expressionId: number; vintageId: number }
    | { kind: "barrel"; bottleId: number };
};

function missingBarrel(ownerId: number) {
  return and(
    eq(bottles.ownerId, ownerId),
    or(eq(bottles.isSingleBarrel, true), eq(bottles.isSingleBarrelPick, true)),
    notExists(db.select({ id: bottleImages.id }).from(bottleImages).where(eq(bottleImages.bottleId, bottles.id))),
  );
}

export async function countMissingPhotos(ownerId: number): Promise<Record<PhotoTab, number>> {
  const [[labels], [barrels], [vintages]] = await Promise.all([
    db.select({ total: count() }).from(expressions)
      .where(and(eq(expressions.ownerId, ownerId), isNull(expressions.photoPath))),
    db.select({ total: count() }).from(bottles).where(missingBarrel(ownerId)),
    db.select({ total: count() }).from(expressionReleases)
      .innerJoin(expressions, eq(expressionReleases.expressionId, expressions.id))
      .where(and(eq(expressions.ownerId, ownerId), isNull(expressionReleases.photoPath))),
  ]);
  return { labels: labels!.total, barrels: barrels!.total, vintages: vintages!.total };
}

export async function listMissingPhotos(ownerId: number, tab: PhotoTab, offset: number, limit: number): Promise<MissingPhoto[]> {
  if (tab === "labels") {
    const rows = await db.select({
      id: expressions.id,
      brand: brands.name,
      name: expressions.name,
      category: categories.name,
      bottleCount: sql<number>`(select count(*)::int from ${bottles}
        where ${bottles.expressionId} = ${expressions.id} and ${bottles.ownerId} = ${ownerId})`,
    }).from(expressions)
      .innerJoin(brands, eq(expressions.brandId, brands.id))
      .innerJoin(categories, eq(expressions.categoryId, categories.id))
      .where(and(eq(expressions.ownerId, ownerId), isNull(expressions.photoPath)))
      .orderBy(asc(brands.name), asc(expressions.name), asc(expressions.id))
      .offset(offset).limit(limit);
    return rows.map((row) => ({
      key: `label:${row.id}`,
      name: `${row.brand} ${row.name}`,
      meta: `${row.category} · ${row.bottleCount} ${row.bottleCount === 1 ? "bottle" : "bottles"}`,
      seed: row.id,
      target: { kind: "label", expressionId: row.id },
    }));
  }

  if (tab === "barrels") {
    const rows = await db.select({
      id: bottles.id,
      brand: brands.name,
      name: expressions.name,
      category: categories.name,
      barrelNumber: bottles.barrelNumber,
    }).from(bottles)
      .innerJoin(expressions, eq(bottles.expressionId, expressions.id))
      .innerJoin(brands, eq(expressions.brandId, brands.id))
      .innerJoin(categories, eq(expressions.categoryId, categories.id))
      .where(and(missingBarrel(ownerId), eq(expressions.ownerId, ownerId)))
      .orderBy(asc(brands.name), asc(expressions.name), asc(bottles.id))
      .offset(offset).limit(limit);
    return rows.map((row) => ({
      key: `barrel:${row.id}`,
      name: `${row.brand} ${row.name}`,
      meta: [row.category, row.barrelNumber ? `Barrel ${row.barrelNumber}` : null].filter(Boolean).join(" · "),
      seed: row.id,
      target: { kind: "barrel", bottleId: row.id },
    }));
  }

  const rows = await db.select({
    id: expressionReleases.id,
    expressionId: expressions.id,
    brand: brands.name,
    name: expressions.name,
    vintage: expressionReleases.name,
    year: expressionReleases.releaseYear,
  }).from(expressionReleases)
    .innerJoin(expressions, eq(expressionReleases.expressionId, expressions.id))
    .innerJoin(brands, eq(expressions.brandId, brands.id))
    .where(and(eq(expressions.ownerId, ownerId), isNull(expressionReleases.photoPath)))
    .orderBy(asc(brands.name), asc(expressions.name), asc(expressionReleases.name), asc(expressionReleases.id))
    .offset(offset).limit(limit);
  return rows.map((row) => ({
    key: `vintage:${row.id}`,
    name: `${row.brand} ${row.name}`,
    meta: [row.vintage, row.year].filter((value) => value !== null).join(" · "),
    seed: row.id,
    target: { kind: "vintage", expressionId: row.expressionId, vintageId: row.id },
  }));
}
