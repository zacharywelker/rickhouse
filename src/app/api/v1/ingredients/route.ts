import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ingredients } from "@/db/schema";
import { isIngredientKind } from "@/lib/expressions/ingredient-rules";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  const kind = request.nextUrl.searchParams.get("kind");
  if (!isIngredientKind(kind)) return apiError(422, "invalid", "Choose an ingredient kind.");
  const rows = await db.select({ name: ingredients.name, family: ingredients.family, kind: ingredients.kind })
    .from(ingredients)
    .where(and(eq(ingredients.ownerId, user.id), eq(ingredients.kind, kind)))
    .orderBy(asc(ingredients.name));
  return NextResponse.json({ ingredients: rows });
}
