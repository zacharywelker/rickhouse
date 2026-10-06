import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, parseId, readJsonObject } from "@/lib/api/v1";
import { addTastingNote } from "@/lib/bottles/state";
import { tastingNoteSchema } from "@/lib/expressions/schema";
import { mapDbError } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

/** Adds a tasting note to a bottle: `tastedOn` (defaults to today), `rating` 0 to 10, and the four texts. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const bottleId = parseId((await params).id);
  if (bottleId === null) return apiError(404, "not_found", "That bottle is gone.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  const parsed = tastingNoteSchema.safeParse(read.body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }

  try {
    const id = await addTastingNote(bottleId, user.id, parsed.data);
    if (id === null) return apiError(404, "not_found", "That bottle is gone.");
    revalidatePath(`/bottles/${bottleId}`);
    revalidatePath("/bottles");
    return NextResponse.json({ id }, { status: 201 });
  } catch (error: unknown) {
    const shaped = mapDbError(error, { singular: "Tasting note" });
    return apiError(422, "invalid", shaped.ok ? "Could not save this note." : shaped.error);
  }
}
