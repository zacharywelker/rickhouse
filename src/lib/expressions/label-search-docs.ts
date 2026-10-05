import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bottles,
  brands,
  categories,
  distilleries,
  distilleryNames,
  expressionColas,
  expressionDistilleries,
  expressionFinishes,
  expressionNames,
  expressions,
  finishes,
} from "@/db/schema";
import type { LabelDoc } from "./label-search";

/**
 * Every label the account owns, shaped for `searchLabels`. One query for the
 * labels with their names and links folded in, one for the category tree
 * (shared and small), and the category paths are walked here.
 */
export async function loadLabelDocs(ownerId: number): Promise<LabelDoc[]> {
  const [rows, tree] = await Promise.all([
    db
      .select({
        id: expressions.id,
        brand: brands.name,
        name: expressions.name,
        categoryId: expressions.categoryId,
        upc: expressions.upc,
        proof: expressions.proof,
        otherNames: sql<string[]>`coalesce((
          select array_agg(${expressionNames.name}::text order by ${expressionNames.position})
          from ${expressionNames}
          where ${expressionNames.expressionId} = ${expressions.id}
        ), '{}')`,
        // A distillery is found under its older names too.
        distilleries: sql<string[]>`coalesce((
          select array_agg(n order by pos, ord)
          from (
            select ${distilleries.name}::text as n, ${expressionDistilleries.position} as pos, 0 as ord
            from ${expressionDistilleries}
            join ${distilleries} on ${distilleries.id} = ${expressionDistilleries.distilleryId}
            where ${expressionDistilleries.expressionId} = ${expressions.id}
            union all
            select ${distilleryNames.name}::text, ${expressionDistilleries.position}, 1 + ${distilleryNames.position}
            from ${expressionDistilleries}
            join ${distilleryNames} on ${distilleryNames.distilleryId} = ${expressionDistilleries.distilleryId}
            where ${expressionDistilleries.expressionId} = ${expressions.id}
          ) names
        ), '{}')`,
        finishes: sql<string[]>`coalesce((
          select array_agg(${finishes.name}::text order by ${expressionFinishes.position})
          from ${expressionFinishes}
          join ${finishes} on ${finishes.id} = ${expressionFinishes.finishId}
          where ${expressionFinishes.expressionId} = ${expressions.id}
        ), '{}')`,
        ttbIds: sql<string[]>`coalesce((
          select array_agg(${expressionColas.ttbId}) from ${expressionColas}
          where ${expressionColas.expressionId} = ${expressions.id}
        ), '{}')`,
        bottles: sql<number>`(select count(*)::int from ${bottles} where ${bottles.expressionId} = ${expressions.id})`,
      })
      .from(expressions)
      .innerJoin(brands, eq(expressions.brandId, brands.id))
      .where(eq(expressions.ownerId, ownerId))
      .orderBy(asc(expressions.id)),
    db.select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories),
  ]);

  const byId = new Map(tree.map((c) => [c.id, c]));
  const paths = new Map<number, Array<{ id: number; name: string }>>();
  const pathOf = (id: number) => {
    const cached = paths.get(id);
    if (cached) return cached;
    const path: Array<{ id: number; name: string }> = [];
    const seen = new Set<number>();
    for (let node = byId.get(id); node && !seen.has(node.id); node = node.parentId === null ? undefined : byId.get(node.parentId)) {
      seen.add(node.id);
      path.push({ id: node.id, name: node.name });
    }
    paths.set(id, path);
    return path;
  };

  return rows.map((row) => {
    const path = pathOf(row.categoryId);
    return {
      ...row,
      category: path[0]?.name ?? "",
      categoryPath: path,
    };
  });
}
