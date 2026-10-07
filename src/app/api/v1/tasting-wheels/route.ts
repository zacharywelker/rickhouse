import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api/v1";
import { WHEELS, WHEEL_IDS, wheelForApi } from "@/lib/tasting-wheels";

export const dynamic = "force-dynamic";

/**
 * The flavor wheels a tasting's descriptors come from: each a list of categories, then subcategories (`name` is null
 * on a wheel without a middle ring), then descriptors with the `key` a tasting stores. Which wheel a label uses is
 * `wheel` on its category (`GET /api/v1/categories`); null means that family has no wheel yet.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  return NextResponse.json({ wheels: WHEEL_IDS.map((id) => wheelForApi(WHEELS[id])) });
}
