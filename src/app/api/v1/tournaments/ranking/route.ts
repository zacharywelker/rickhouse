import { type NextRequest, type NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api/v1";
import { authed, isHalt, json } from "@/lib/tournaments/http";
import { rankingFor } from "@/lib/tournaments/ranking-query";

export const dynamic = "force-dynamic";

/**
 * The long-term ranking across all your tournaments, and where it disagrees with your 0 to 10 ratings (`audit`).
 * `?categoryId=` ranks only bottles whose label is in that category or below it. Outside entries are never ranked.
 * Each competitor has a `group`: only competitors in the same group can be compared.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const raw = request.nextUrl.searchParams.get("categoryId");
  const categoryId = raw === null ? null : parseId(raw);
  if (raw !== null && categoryId === null) return apiError(422, "invalid", "categoryId must be a category id.", { categoryId: "Not a category id." });
  return json(await rankingFor(auth.userId, categoryId));
}
