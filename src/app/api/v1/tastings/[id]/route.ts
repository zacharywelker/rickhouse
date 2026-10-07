import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, parseId, readJsonObject } from "@/lib/api/v1";
import { mapDbError } from "@/lib/db-errors";
import { tastingEditSchema } from "@/lib/expressions/schema";
import { deleteTasting, updateTasting } from "@/lib/tastings";

export const dynamic = "force-dynamic";

/**
 * Replaces what a tasting says: send every field, as for a note (a field left out is cleared). Its label and bottle
 * stay as they are. Someone else's tasting is simply not found.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const id = parseId((await params).id);
  if (id === null) return apiError(404, "not_found", "That tasting is gone.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  const parsed = tastingEditSchema.safeParse(read.body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }

  try {
    const result = await updateTasting(user.id, id, parsed.data);
    if (!result.ok) return apiError(result.status, result.status === 404 ? "not_found" : "invalid", result.message, result.fields);
    revalidatePath("/bottles");
    return NextResponse.json({ id: result.id });
  } catch (error: unknown) {
    const shaped = mapDbError(error, { singular: "Tasting" });
    return apiError(422, "invalid", shaped.ok ? "Could not save this tasting." : shaped.error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const id = parseId((await params).id);
  if (id === null || !(await deleteTasting(user.id, id))) return apiError(404, "not_found", "That tasting is gone.");
  revalidatePath("/bottles");
  return new NextResponse(null, { status: 204 });
}
