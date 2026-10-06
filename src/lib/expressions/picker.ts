import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, expressions } from "@/db/schema";

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
};

/** One of the caller's labels in the picker's shape. */
export async function pickerLabel(id: number, ownerId: number) {
  const [row] = await db
    .select(labelColumns)
    .from(expressions)
    .innerJoin(brands, eq(brands.id, expressions.brandId))
    .innerJoin(categories, eq(categories.id, expressions.categoryId))
    .where(and(eq(expressions.id, id), eq(expressions.ownerId, ownerId)))
    .limit(1);
  return row;
}
