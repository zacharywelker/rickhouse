import { type NextRequest, type NextResponse } from "next/server";
import { glassSchema } from "@/lib/tournaments/api-schemas";
import { setGlasses } from "@/lib/tournaments/heats";
import { authed, failed, ids, isHalt, json, parsed } from "@/lib/tournaments/http";

export const dynamic = "force-dynamic";

/** Sets which glass letter each entry of a pending flight is poured into (the solo flow): `{ assign: [{ entryId, glass }] }`. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; heatId: string }> }): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, "That flight is gone.");
  if (isHalt(path)) return path.response;
  const body = await parsed(request, glassSchema);
  if (isHalt(body)) return body.response;
  const result = await setGlasses(auth.userId, path.id, path.heatId, body.data.assign);
  return result.ok ? json(result.view) : failed(result);
}
