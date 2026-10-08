import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, readJsonObject } from "@/lib/api/v1";
import { pickFor } from "@/lib/tonight/build";
import { bandArray, idArray, keyArray } from "@/lib/tonight/params";
import { loadTonight } from "@/lib/tonight/queries";

export const dynamic = "force-dynamic";

/**
 * Draws one bottle for tonight. `mode` is "flow" (the steps' choices: `categories`, `sealed`, `bands`, `flavors`) or
 * "roulette" (fully random over the shelf, obeying only `sealed`). `only` ("sealed" or "open") is the fallback's two
 * buttons. `exclude` is the bottle ids already shown, so "Not this one" never repeats. Muted bottles are never drawn.
 * The answer is `{ pick: { bottle, why, left } | null }`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  const body = read.body;

  if (body.mode !== "flow" && body.mode !== "roulette") return apiError(422, "invalid", 'mode is "flow" or "roulette".', { mode: "flow or roulette" });
  if (body.only !== undefined && body.only !== "sealed" && body.only !== "open") return apiError(422, "invalid", 'only is "sealed" or "open".', { only: "sealed or open" });

  const data = await loadTonight(user.id);
  const pick = pickFor(data, {
    mode: body.mode,
    only: body.only,
    categories: idArray(body.categories),
    sealed: body.sealed === true,
    bands: bandArray(body.bands),
    flavors: keyArray(body.flavors),
    exclude: idArray(body.exclude),
  });
  return NextResponse.json({ pick });
}
