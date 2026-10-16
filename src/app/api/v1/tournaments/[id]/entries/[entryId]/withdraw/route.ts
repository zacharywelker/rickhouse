import { type NextRequest, type NextResponse } from "next/server";
import { emptySchema } from "@/lib/tournaments/api-schemas";
import { withdrawEntry } from "@/lib/tournaments/heats";
import { authed, failed, ids, isHalt, json, parsed } from "@/lib/tournaments/http";

export const dynamic = "force-dynamic";

/** Takes an entry out of a running tournament (a bottle ran out). Its decided flights stand; it plays no more. Send an empty JSON object. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, "That entry is gone.");
  if (isHalt(path)) return path.response;
  const body = await parsed(request, emptySchema);
  if (isHalt(body)) return body.response;
  const result = await withdrawEntry(auth.userId, path.id, path.entryId);
  return result.ok ? json(result.view) : failed(result);
}
