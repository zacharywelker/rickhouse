import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { apiError, issueFields, pageParams, readJsonObject } from "@/lib/api/v1";
import { mapDbError } from "@/lib/db-errors";
import { tastingSchema } from "@/lib/expressions/schema";
import { createTasting, queryTastings } from "@/lib/tastings";

export const dynamic = "force-dynamic";

/**
 * The tasting history: every note on the caller's bottles, newest first, paged (`page`, `size`).
 * Each row names its label, and its bottle when it has one (a pour of a bottle you don't own has none), with where
 * it was tasted and its flavor keys. Photos are paths for `/api/images/<path>`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const { page, size } = pageParams(request.nextUrl.searchParams);
  const { total, pageCount, rows } = await queryTastings(user.id, page, size);
  return NextResponse.json({ page, pageCount, total, tastings: rows });
}

/**
 * Logs a tasting of one of your labels (SPEC M9). `expressionId` is required; `bottleId` is optional and, when given,
 * must be your bottle of that label and makes the source "owned". Otherwise `source` is one of owned, bar,
 * bottle_share, sample or store_pour, with `tastedAt` for the place. `tags` are descriptor keys from the label's
 * flavor wheel (`GET /api/v1/tasting-wheels`). The rest is as for a note: `tastedOn`, `rating` and the four texts.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  const parsed = tastingSchema.safeParse(read.body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }

  try {
    const result = await createTasting(user.id, parsed.data);
    if (!result.ok) return apiError(result.status, result.status === 404 ? "not_found" : "invalid", result.message, result.fields);
    revalidatePath(`/expressions/${parsed.data.expressionId}`);
    revalidatePath("/bottles");
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error: unknown) {
    const shaped = mapDbError(error, { singular: "Tasting" });
    return apiError(422, "invalid", shaped.ok ? "Could not save this tasting." : shaped.error);
  }
}
