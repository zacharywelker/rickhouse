import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api/v1";
import { optionsFor } from "@/lib/tonight/build";
import { loadTonight } from "@/lib/tonight/queries";
import { idList } from "@/lib/tonight/params";

export const dynamic = "force-dynamic";

/**
 * What each step of What to drink tonight shows for the choices so far (`category=1,2`, `sealed=1`): the spirits
 * with their counts, whether the proof step applies and its bands, whether flavors apply and which, or the
 * "time to open a new bottle" fallback. Phone only; the web has its own Spin the Bottle.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const params = request.nextUrl.searchParams;
  const data = await loadTonight(user.id);
  return NextResponse.json(optionsFor(data, { categories: idList(params.get("category")), sealed: params.get("sealed") === "1" }));
}
