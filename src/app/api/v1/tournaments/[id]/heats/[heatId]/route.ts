import { type NextRequest, type NextResponse } from "next/server";
import { renameSchema } from "@/lib/tournaments/api-schemas";
import { renameHeat } from "@/lib/tournaments/heats";
import { authed, failed, ids, isHalt, json, parsed } from "@/lib/tournaments/http";

export const dynamic = "force-dynamic";

/** Names a flight (`label`, up to 80 characters), or clears its name with null or an empty string. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; heatId: string }> }): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, "That flight is gone.");
  if (isHalt(path)) return path.response;
  const body = await parsed(request, renameSchema);
  if (isHalt(body)) return body.response;
  const result = await renameHeat(auth.userId, path.id, path.heatId, body.data.label);
  return result.ok ? json(result.view) : failed(result);
}
