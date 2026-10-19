import { type NextRequest, type NextResponse } from "next/server";
import { swapSchema } from "@/lib/tournaments/api-schemas";
import { swapEntries } from "@/lib/tournaments/heats";
import { authed, failed, ids, isHalt, json, parsed } from "@/lib/tournaments/http";

export const dynamic = "force-dynamic";

/** Swaps this entry with one in another undecided flight of the current round: `{ withEntryId }`. Both flights keep their size. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, "That entry is gone.");
  if (isHalt(path)) return path.response;
  const body = await parsed(request, swapSchema);
  if (isHalt(body)) return body.response;
  const result = await swapEntries(auth.userId, path.id, path.entryId, body.data.withEntryId);
  return result.ok ? json(result.view) : failed(result);
}
