import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api/v1";
import { categoryWheels } from "@/lib/tasting-wheel-for";
import { categoryKinds } from "@/lib/expressions/rules";

export const dynamic = "force-dynamic";

const parent = alias(categories, "category_parent");

/**
 * The categories a label can have, shared by every account, in the order the web form lists them. `parent` names
 * the group a category sits in, or is null. `wheel` is the flavor wheel a label of the category uses (see
 * `GET /api/v1/tasting-wheels`), or null when its family has none yet. `group` (whiskey, rum, gin, vodka…) and
 * `kind` (american, scotch, other) are what the label form's rules go by (`src/lib/expressions/rules.ts`).
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const rows = await db
    .select({ id: categories.id, name: categories.name, parent: parent.name, group: categories.fieldGroup, slug: categories.slug, parentId: categories.parentId })
    .from(categories)
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .orderBy(asc(parent.name), asc(categories.sortOrder), asc(categories.name));

  const wheels = await categoryWheels();
  const kinds = categoryKinds(rows);
  return NextResponse.json({
    categories: rows.map(({ slug: _slug, parentId: _parentId, ...row }) => ({ ...row, kind: kinds[row.id] ?? "other", wheel: wheels.get(row.id) ?? null })),
  });
}
