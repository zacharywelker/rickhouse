import { type NextRequest, type NextResponse } from "next/server";
import { moveSchema } from "@/lib/tournaments/api-schemas";
import { moveEntry } from "@/lib/tournaments/heats";
import { authed, failed, ids, isHalt, json, parsed } from "@/lib/tournaments/http";

export const dynamic = "force-dynamic";

/** Moves an entry to another undecided flight of the current round: `{ toHeatId }`. A flight that is full is a 409. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, "That entry is gone.");
  if (isHalt(path)) return path.response;
  const body = await parsed(request, moveSchema);
  if (isHalt(body)) return body.response;
  const result = await moveEntry(auth.userId, path.id, path.entryId, body.data.toHeatId);
  return result.ok ? json(result.view) : failed(result);
}
