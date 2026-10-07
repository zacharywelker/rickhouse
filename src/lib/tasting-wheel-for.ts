import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, expressions } from "@/db/schema";
import { categoryWheelMap, type WheelId } from "@/lib/tasting-wheels";

/** Which wheel each category uses, by category id (null where the family has no wheel yet). */
export async function categoryWheels(): Promise<Map<number, WheelId | null>> {
  const rows = await db
    .select({ id: categories.id, slug: categories.slug, parentId: categories.parentId, fieldGroup: categories.fieldGroup })
    .from(categories);
  return categoryWheelMap(rows);
}

/** The wheel of a label's category, or null when the label is not this account's. */
export async function wheelOfLabel(expressionId: number, ownerId: number): Promise<{ wheel: WheelId | null } | null> {
  const [label] = await db
    .select({ categoryId: expressions.categoryId })
    .from(expressions)
    .where(and(eq(expressions.id, expressionId), eq(expressions.ownerId, ownerId)))
    .limit(1);
  if (!label) return null;
  return { wheel: (await categoryWheels()).get(label.categoryId) ?? null };
}
