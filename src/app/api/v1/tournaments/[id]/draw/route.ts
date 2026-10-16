import { type NextRequest, type NextResponse } from "next/server";
import { drawSchema } from "@/lib/tournaments/api-schemas";
import { drawHeat } from "@/lib/tournaments/heats";
import { authed, failed, ids, isHalt, json, parsed } from "@/lib/tournaments/http";

export const dynamic = "force-dynamic";

/**
 * For a pourer: picks a pending flight of the current round at random, labels its glasses at random and keeps the
 * letters. The answer names what is in each glass, so it is for the pourer's eyes; the tournament itself keeps showing
 * the taster only the letters. Send an empty JSON object, or `{ "heatId" }` to open that pending flight of the current round instead.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, "That tournament is gone.");
  if (isHalt(path)) return path.response;
  const body = await parsed(request, drawSchema);
  if (isHalt(body)) return body.response;
  const result = await drawHeat(auth.userId, path.id, body.data.heatId);
  return result.ok ? json(result.heat) : failed(result);
}
