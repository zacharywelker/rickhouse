import { type NextRequest, type NextResponse } from "next/server";
import { moveHeatSchema } from "@/lib/tournaments/api-schemas";
import { moveHeat } from "@/lib/tournaments/heats";
import { authed, failed, ids, isHalt, json, parsed } from "@/lib/tournaments/http";

export const dynamic = "force-dynamic";

/** Moves an undecided flight to place `toSlot` among the round's flights (the others shift; slots stay 1..n). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; heatId: string }> }): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, "That flight is gone.");
  if (isHalt(path)) return path.response;
  const body = await parsed(request, moveHeatSchema);
  if (isHalt(body)) return body.response;
  const result = await moveHeat(auth.userId, path.id, path.heatId, body.data.toSlot);
  return result.ok ? json(result.view) : failed(result);
}
