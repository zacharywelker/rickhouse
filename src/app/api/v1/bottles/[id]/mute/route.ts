import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, parseId, readJsonObject } from "@/lib/api/v1";
import { checkMuteUntil } from "@/lib/tonight/rules";
import { setMute, today } from "@/lib/tonight/queries";

export const dynamic = "force-dynamic";

/**
 * Mutes one of your bottles: it stays out of What to drink tonight and Roulette until `until` (YYYY-MM-DD), which
 * must be after today and no more than three months away. Muting again changes the date. Someone else's bottle is
 * simply not found.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const id = parseId((await params).id);
  if (id === null) return apiError(404, "not_found", "That bottle is gone.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  const check = checkMuteUntil(read.body.until, await today());
  if (!check.ok) return apiError(422, "invalid", check.message, { until: check.message });

  if (!(await setMute(user.id, id, read.body.until as string))) return apiError(404, "not_found", "That bottle is gone.");
  return NextResponse.json({ id, mutedUntil: read.body.until });
}

/** Clears a bottle's mute. Clearing one that is not muted is fine. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const id = parseId((await params).id);
  if (id === null || !(await setMute(user.id, id, null))) return apiError(404, "not_found", "That bottle is gone.");
  return NextResponse.json({ id, mutedUntil: null });
}
