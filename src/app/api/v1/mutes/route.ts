import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api/v1";
import { muteWindow, mutePresets } from "@/lib/tonight/rules";
import { listMutes, today } from "@/lib/tonight/queries";

export const dynamic = "force-dynamic";

/**
 * The caller's muted bottles that are still muted, the one coming back soonest first (Settings, Muted bottles), with
 * what a new mute may be: the `window` of end dates and the `presets` (1 week, 1 month, 3 months) as dates in the
 * server's calendar, so the phone does no date arithmetic of its own.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  const now = await today();
  return NextResponse.json({ mutes: await listMutes(user.id), window: muteWindow(now), presets: mutePresets(now) });
}
