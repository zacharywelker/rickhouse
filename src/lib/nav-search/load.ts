import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottleList, brands, distilleries, expressionDistilleries, expressions, groups } from "@/db/schema";
import { isOpenNow, isOwnedNow } from "@/lib/bottles/grid";
import { loadLabelDocs } from "@/lib/expressions/label-search-docs";
import type { NavSearchData } from "./search";

/**
 * Everything the nav search looks through, for one account. Always scoped by
 * owner. Counts of bottles are the ones on the shelf now (`isOwnedNow`), the
 * same meaning as the Collection's "Bottles".
 *
 * ponytail: loads every label, brand and distillery per query. A home
 * collection is hundreds to a few thousand rows, which this handles; cache the
 * result per account if it ever measures slow.
 */
export async function loadNavSearchData(ownerId: number): Promise<NavSearchData> {
  const [labels, ownedRows, brandRows, distilleryRows, links, groupRows] = await Promise.all([
    loadLabelDocs(ownerId),
    db
      .select({
        id: bottleList.id,
        expressionId: bottleList.expressionId,
        brandId: bottleList.brandId,
        brand: bottleList.brand,
        name: bottleList.expressionName,
        category: bottleList.category,
        proof: bottleList.proof,
        isOpen: sql<boolean>`${isOpenNow}`,
        fillPct: bottleList.fillPct,
      })
      .from(bottleList)
      .where(sql`${bottleList.ownerId} = ${ownerId} AND ${isOwnedNow}`)
      .orderBy(asc(bottleList.id)),
    db
      .select({ id: brands.id, name: brands.name, labels: sql<number>`count(${expressions.id})::int` })
      .from(brands)
      .leftJoin(expressions, eq(expressions.brandId, brands.id))
      .where(eq(brands.ownerId, ownerId))
      .groupBy(brands.id, brands.name)
      .orderBy(asc(brands.name)),
    db
      .select({
        id: distilleries.id,
        name: distilleries.name,
        place: sql<string | null>`NULLIF(concat_ws(', ', ${distilleries.city}, ${distilleries.state}), '')`,
      })
      .from(distilleries)
      .where(eq(distilleries.ownerId, ownerId))
      .orderBy(asc(distilleries.name)),
    db
      .select({ expressionId: expressionDistilleries.expressionId, distilleryId: expressionDistilleries.distilleryId })
      .from(expressionDistilleries)
      .innerJoin(distilleries, eq(distilleries.id, expressionDistilleries.distilleryId))
      .where(eq(distilleries.ownerId, ownerId)),
    db
      .select({ id: groups.id, name: groups.name, filterQuery: groups.filterQuery })
      .from(groups)
      .where(eq(groups.ownerId, ownerId))
      .orderBy(asc(groups.name)),
  ]);

  // Counts are done here, from plain queries: correlated subqueries written through Drizzle's column
  // objects render unqualified names and silently correlate to the wrong table.
  const ownedByBrand = new Map<number, number>();
  const ownedByLabel = new Map<number, number>();
  for (const bottle of ownedRows) {
    ownedByBrand.set(bottle.brandId, (ownedByBrand.get(bottle.brandId) ?? 0) + 1);
    ownedByLabel.set(bottle.expressionId, (ownedByLabel.get(bottle.expressionId) ?? 0) + 1);
  }
  const labelsByDistillery = new Map<number, number[]>();
  for (const link of links) {
    labelsByDistillery.set(link.distilleryId, [...(labelsByDistillery.get(link.distilleryId) ?? []), link.expressionId]);
  }

  return {
    labels,
    ownedBottles: ownedRows.map(({ brandId: _brandId, ...bottle }) => bottle),
    brands: brandRows.map((brand) => ({ ...brand, bottles: ownedByBrand.get(brand.id) ?? 0 })),
    distilleries: distilleryRows.map((distillery) => {
      const expressionIds = labelsByDistillery.get(distillery.id) ?? [];
      return {
        ...distillery,
        labels: expressionIds.length,
        bottles: expressionIds.reduce((sum, id) => sum + (ownedByLabel.get(id) ?? 0), 0),
      };
    }),
    groups: groupRows,
  };
}
