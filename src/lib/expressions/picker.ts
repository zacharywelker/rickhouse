import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, expressions } from "@/db/schema";
import { categoryWheels } from "@/lib/tasting-wheel-for";

/** The columns a label shows in the add-bottle picker. */
export const labelColumns = {
  id: expressions.id,
  name: expressions.name,
  brand: brands.name,
  category: categories.name,
  proof: expressions.proof,
  ageStatement: expressions.ageStatement,
  upc: expressions.upc,
  thumbPath: expressions.photoThumbPath,
  categoryId: expressions.categoryId,
};

/**
 * Labels as the picker sends them: the flavor wheel their category uses (null where the family has none) replaces the
 * category id, so the app knows which wheel to show without matching category names.
 */
export async function withWheels<T extends { categoryId: number }>(rows: T[]): Promise<Array<Omit<T, "categoryId"> & { wheel: string | null }>> {
  if (rows.length === 0) return [];
  const wheels = await categoryWheels();
  return rows.map(({ categoryId, ...rest }) => ({ ...rest, wheel: wheels.get(categoryId) ?? null }));
}

/** One of the caller's labels in the picker's shape. */
export async function pickerLabel(id: number, ownerId: number) {
  const [row] = await db
    .select(labelColumns)
    .from(expressions)
    .innerJoin(brands, eq(brands.id, expressions.brandId))
    .innerJoin(categories, eq(categories.id, expressions.categoryId))
    .where(and(eq(expressions.id, id), eq(expressions.ownerId, ownerId)))
    .limit(1);
  return row ? (await withWheels([row]))[0] : undefined;
}
