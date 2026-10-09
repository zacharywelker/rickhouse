import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, parseId } from "@/lib/api/v1";
import { setPrimaryImageAction } from "@/app/(app)/bottles/actions";

export const dynamic = "force-dynamic";

/** Makes one of your bottle photos the bottle's hero shot. */
export async function PUT(_request: Request, { params }: { params: Promise<{ imageId: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  const id = parseId((await params).imageId);
  if (id === null) return apiError(404, "not_found", "That photo is gone.");
  const result = await setPrimaryImageAction(id);
  if (!result.ok) return apiError(404, "not_found", result.error);
  return NextResponse.json({ id, isPrimary: true });
}
