import { type NextRequest, type NextResponse } from "next/server";
import { createSchema } from "@/lib/tournaments/api-schemas";
import { authed, failed, isHalt, json, parsed } from "@/lib/tournaments/http";
import { createTournament } from "@/lib/tournaments/lifecycle";
import { listTournaments } from "@/lib/tournaments/queries";

export const dynamic = "force-dynamic";

/** The caller's tournaments, newest first, each with its round and how many flights are decided. */
export async function GET(): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  return json({ tournaments: await listTournaments(auth.userId) });
}

/**
 * Makes a draft tournament. `name` and `heatSize` (2 to 6) are required; `seeding` (similar or random), `groupOrder`
 * (the five keys proof, mashbill, distillery, age and finish, each once, highest priority first), `blind` and
 * `fieldNote` have defaults. `entries` is a list of `{ bottleId }`, `{ expressionId }` (a label with no bottle) or
 * `{ name }` (an outside entry), up to 500. Answers 201 with the new id.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const body = await parsed(request, createSchema);
  if (isHalt(body)) return body.response;
  const { entries, ...settings } = body.data;
  const result = await createTournament(auth.userId, settings, entries);
  return result.ok ? json({ id: result.id }, 201) : failed(result);
}
