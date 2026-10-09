import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, parseId } from "@/lib/api/v1";
import { deleteBottleImageAction } from "@/app/(app)/bottles/actions";

export const dynamic = "force-dynamic";

/** Deletes one of your bottle photos; if it was the hero, the next photo takes over. Same rules as the web page. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ imageId: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  const id = parseId((await params).imageId);
  if (id === null) return apiError(404, "not_found", "That photo is gone.");
  const result = await deleteBottleImageAction(id);
  if (!result.ok) return apiError(404, "not_found", result.error);
  return NextResponse.json({ id });
}
