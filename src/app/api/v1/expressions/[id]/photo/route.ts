import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, parseId } from "@/lib/api/v1";
import { removeLabelPhotoAction } from "@/app/(app)/expressions/photo-actions";

export const dynamic = "force-dynamic";

/** Removes your label's photo. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  const id = parseId((await params).id);
  if (id === null) return apiError(404, "not_found", "That label is gone.");
  const result = await removeLabelPhotoAction(id);
  if (!result.ok) return apiError(404, "not_found", result.error);
  return NextResponse.json({ id });
}
