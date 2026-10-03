import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { bottles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { apiError, paramsRecord } from "@/lib/api/v1";
import { mapDbError } from "@/lib/db-errors";
import { queryBottles, summariseBottles } from "@/lib/bottles/grid";
import { parseFilters } from "@/lib/bottles/filters";
import { bottleSchema } from "@/lib/expressions/schema";

export const dynamic = "force-dynamic";

/**
 * The collection, with the web grid's own filters and sort (`q`, `status`,
 * `sort`, `desc`, `page`, `size`, …) and the same default of what is on the
 * shelf. Photos are paths for `/api/images/<path>`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const filters = parseFilters(paramsRecord(request.nextUrl.searchParams));
  const [{ rows, total, pageCount, page }, summary] = await Promise.all([
    queryBottles(filters, user.id),
    summariseBottles(filters, user.id),
  ]);

  return NextResponse.json({
    page,
    pageCount,
    total,
    summary,
    bottles: rows.map((r) => ({
      id: r.id,
      brand: r.brand,
      name: r.expressionName,
      category: r.category,
      status: r.status,
      isOpen: r.isOpen,
      isFavorite: r.isFavorite,
      fillPct: r.fillPct,
      proof: r.proof,
      ageStatement: r.ageStatement,
      ageYears: r.ageYears,
      pricePaid: r.pricePaid,
      msrp: r.msrp,
      store: r.store,
      dateAcquired: r.dateAcquired,
      avgRating: r.avgRating,
      thumbPath: r.thumbPath,
    })),
  });
}

/** Adds a bottle of an existing label. The body is the web form's fields as JSON; only `expressionId` is required. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return apiError(400, "bad_request", "Send a JSON object.");
  }
  const input = { acquisition: "purchase", status: "owned", ...body };

  const parsed = bottleSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !(key in fields)) fields[key] = issue.message;
    }
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", fields);
  }

  try {
    const [row] = await db
      .insert(bottles)
      .values({ ...parsed.data, ownerId: user.id })
      .returning({ id: bottles.id });
    revalidatePath("/bottles");
    revalidatePath("/");
    return NextResponse.json({ id: row!.id }, { status: 201 });
  } catch (error: unknown) {
    const shaped = mapDbError(error, { singular: "Bottle" });
    return apiError(422, "invalid", shaped.ok ? "Could not save this bottle." : shaped.error);
  }
}
