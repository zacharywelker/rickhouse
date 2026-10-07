import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, pageParams } from "@/lib/api/v1";
import { queryTastings } from "@/lib/tastings";

export const dynamic = "force-dynamic";

/**
 * The tasting history: every note on the caller's bottles, newest first, paged (`page`, `size`).
 * Each row names its label and bottle. Photos are paths for `/api/images/<path>`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const { page, size } = pageParams(request.nextUrl.searchParams);
  const { total, pageCount, rows } = await queryTastings(user.id, page, size);
  return NextResponse.json({ page, pageCount, total, tastings: rows });
}
