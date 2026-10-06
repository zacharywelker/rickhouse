import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { brands, categories, expressions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

const LIMIT = 30;

/** Label search for the add-bottle picker: every word typed has to appear in the brand or the name. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const words = (request.nextUrl.searchParams.get("q") ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 8);
  const clauses = [
    eq(expressions.ownerId, user.id),
    ...words.map((word) => {
      const like = `%${word.replace(/[\\%_]/g, "\\$&")}%`;
      return or(ilike(brands.name, like), ilike(expressions.name, like), ilike(categories.name, like))!;
    }),
  ];

  const rows = await db
    .select({
      id: expressions.id,
      name: expressions.name,
      brand: brands.name,
      category: categories.name,
      proof: expressions.proof,
      ageStatement: expressions.ageStatement,
      thumbPath: expressions.photoThumbPath,
    })
    .from(expressions)
    .innerJoin(brands, eq(brands.id, expressions.brandId))
    .innerJoin(categories, eq(categories.id, expressions.categoryId))
    .where(and(...clauses))
    .orderBy(asc(brands.name), asc(expressions.name))
    .limit(LIMIT);

  return NextResponse.json({ expressions: rows });
}
