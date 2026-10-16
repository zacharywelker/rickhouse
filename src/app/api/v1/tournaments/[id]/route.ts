import { type NextRequest, type NextResponse } from "next/server";
import { apiError } from "@/lib/api/v1";
import { patchSchema } from "@/lib/tournaments/api-schemas";
import { authed, failed, ids, isHalt, json, parsed } from "@/lib/tournaments/http";
import { deleteTournament, updateDraft } from "@/lib/tournaments/lifecycle";
import { getTournament } from "@/lib/tournaments/queries";

export const dynamic = "force-dynamic";
const GONE = "That tournament is gone.";
type Ctx = { params: Promise<{ id: string }> };

/**
 * One tournament: its settings, entries, rounds of flights with their entries and places, the plan, standings and
 * champion. In a running blind tournament a pending flight carries only its proof band and glass letters.
 */
export async function GET(_request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, GONE);
  if (isHalt(path)) return path.response;
  const view = await getTournament(auth.userId, path.id);
  return view ? json(view) : apiError(404, "not_found", GONE);
}

/** Changes a draft: any of `name`, `heatSize`, `seeding`, `groupOrder`, `blind`, `fieldNote`, and/or the whole `entries` list. */
export async function PATCH(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, GONE);
  if (isHalt(path)) return path.response;
  const body = await parsed(request, patchSchema);
  if (isHalt(body)) return body.response;
  const result = await updateDraft(auth.userId, path.id, body.data);
  return result.ok ? json(result.view) : failed(result);
}

/** Deletes a draft or a finished tournament; a running one is a 409. */
export async function DELETE(_request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const path = ids(await params, GONE);
  if (isHalt(path)) return path.response;
  const result = await deleteTournament(auth.userId, path.id);
  return result.ok ? json({ id: path.id }) : failed(result);
}
