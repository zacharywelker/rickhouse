import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, parseId, readJsonObject } from "@/lib/api/v1";
import { deleteTastingNote, updateTastingNote } from "@/lib/bottles/state";
import { tastingNoteSchema } from "@/lib/expressions/schema";
import { mapDbError } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; noteId: string }> };

/** Replaces a note's fields, as the web form does: send them all. */
export async function PATCH(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const { id, noteId } = await params;
  const bottleId = parseId(id);
  const note = parseId(noteId);
  if (bottleId === null || note === null) return apiError(404, "not_found", "That note is gone.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  const parsed = tastingNoteSchema.safeParse(read.body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }

  try {
    if (!(await updateTastingNote(bottleId, note, user.id, parsed.data))) {
      return apiError(404, "not_found", "That note is gone.");
    }
    revalidatePath(`/bottles/${bottleId}`);
    revalidatePath("/bottles");
    return NextResponse.json({ id: note });
  } catch (error: unknown) {
    const shaped = mapDbError(error, { singular: "Tasting note" });
    return apiError(422, "invalid", shaped.ok ? "Could not save this note." : shaped.error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Context): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const { id, noteId } = await params;
  const bottleId = parseId(id);
  const note = parseId(noteId);
  if (bottleId === null || note === null) return apiError(404, "not_found", "That note is gone.");

  if (!(await deleteTastingNote(bottleId, note, user.id))) return apiError(404, "not_found", "That note is gone.");
  revalidatePath(`/bottles/${bottleId}`);
  revalidatePath("/bottles");
  return new NextResponse(null, { status: 204 });
}
