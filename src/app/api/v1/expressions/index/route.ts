import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api/v1";
import { labelIndex } from "@/lib/expressions/queries";

export const dynamic = "force-dynamic";

/** The phone's label index: every label of yours, A to Z by brand, with bottle and tasting counts and your average. */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  return NextResponse.json({ labels: await labelIndex(user.id) });
}
