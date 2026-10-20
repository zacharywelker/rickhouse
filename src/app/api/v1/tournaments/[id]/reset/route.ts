import { type NextRequest, type NextResponse } from "next/server";
import { emptySchema } from "@/lib/tournaments/api-schemas";
import { authed, failed, ids, isHalt, json, parsed } from "@/lib/tournaments/http";
import { resetRound } from "@/lib/tournaments/transitions";

export const dynamic = "force-dynamic";

/** Regroups to the automatic choice: all of round 1 in a draft, or the entries of the current round's undecided flights once running. Clears the names of the flights it regroups. Send an empty JSON object. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, "That tournament is gone.");
  if (isHalt(path)) return path.response;
  const body = await parsed(request, emptySchema);
  if (isHalt(body)) return body.response;
  const result = await resetRound(auth.userId, path.id);
  return result.ok ? json(result.view) : failed(result);
}
