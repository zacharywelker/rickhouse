import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

const parent = alias(categories, "category_parent");

/** The categories a label can have, shared by every account, in the order the web form lists them. `parent` names the group a category sits in, or is null. */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const rows = await db
    .select({ id: categories.id, name: categories.name, parent: parent.name })
    .from(categories)
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .orderBy(asc(parent.name), asc(categories.sortOrder), asc(categories.name));

  return NextResponse.json({ categories: rows });
}
