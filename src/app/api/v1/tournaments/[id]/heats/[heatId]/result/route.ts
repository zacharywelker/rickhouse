import { type NextRequest, type NextResponse } from "next/server";
import { resultSchema } from "@/lib/tournaments/api-schemas";
import { recordHeat, undoHeat } from "@/lib/tournaments/heats";
import { authed, failed, ids, isHalt, json, parsed } from "@/lib/tournaments/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; heatId: string }> };

/**
 * Records a flight's result: `{ ranking: [entryId, ...] }` best first, or for a flight poured blind
 * `{ glasses: ["B", "A", ...] }` best first. Every entry must appear once. A finished round makes the next round, or
 * finishes the tournament.
 */
export async function POST(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, "That flight is gone.");
  if (isHalt(path)) return path.response;
  const body = await parsed(request, resultSchema);
  if (isHalt(body)) return body.response;
  const result = await recordHeat(auth.userId, path.id, path.heatId, body.data, auth.userId);
  return result.ok ? json(result.view) : failed(result);
}

/** Takes the result back, until a flight of the next round has one. The next round is discarded; a finished tournament runs again. */
export async function DELETE(_request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, "That flight is gone.");
  if (isHalt(path)) return path.response;
  const result = await undoHeat(auth.userId, path.id, path.heatId);
  return result.ok ? json(result.view) : failed(result);
}
