import { type NextRequest, type NextResponse } from "next/server";
import { promoteSchema } from "@/lib/tournaments/api-schemas";
import { promoteEntry } from "@/lib/tournaments/heats";
import { authed, failed, ids, isHalt, json, parsed } from "@/lib/tournaments/http";

export const dynamic = "force-dynamic";

/** Matches an outside entry to one of your bottles (`{ bottleId }`) or labels (`{ expressionId }`), so its flights count toward the ranking. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, "That entry is gone.");
  if (isHalt(path)) return path.response;
  const body = await parsed(request, promoteSchema);
  if (isHalt(body)) return body.response;
  const result = await promoteEntry(auth.userId, path.id, path.entryId, body.data);
  return result.ok ? json(result.view) : failed(result);
}
