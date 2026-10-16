import { type NextRequest, type NextResponse } from "next/server";
import { emptySchema } from "@/lib/tournaments/api-schemas";
import { authed, failed, ids, isHalt, json, parsed } from "@/lib/tournaments/http";
import { startTournament } from "@/lib/tournaments/lifecycle";

export const dynamic = "force-dynamic";

/** Locks the field and starts the tournament, making round 1 if the draft has no preview. Needs two entries. Send an empty JSON object. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, "That tournament is gone.");
  if (isHalt(path)) return path.response;
  const body = await parsed(request, emptySchema);
  if (isHalt(body)) return body.response;
  const result = await startTournament(auth.userId, path.id);
  return result.ok ? json(result.view) : failed(result);
}
