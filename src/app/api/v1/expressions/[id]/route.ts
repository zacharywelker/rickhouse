import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { expressions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, parseId, readJsonObject } from "@/lib/api/v1";
import { attachBarcodeSchema, upcCandidates } from "@/lib/api/labels";
import { pickerLabel } from "@/lib/expressions/picker";

export const dynamic = "force-dynamic";

/**
 * Saves a scanned barcode onto a label that has none, so the next scan finds
 * it. It never overwrites: a label that already has a different code is a 409
 * `has_barcode` and is left alone; the same code again is a no-op. Answers with
 * the label. Someone else's label is simply not found.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const id = parseId((await params).id);
  if (id === null) return apiError(404, "not_found", "That label is gone.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  const parsed = attachBarcodeSchema.safeParse(read.body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }

  // One conditional update, so two phones can't both win and a code is never overwritten.
  const set = await db
    .update(expressions)
    .set({ upc: parsed.data.upc })
    .where(and(eq(expressions.id, id), eq(expressions.ownerId, user.id), isNull(expressions.upc)))
    .returning({ id: expressions.id });
  if (set.length > 0) revalidatePath("/expressions");

  const label = await pickerLabel(id, user.id);
  if (!label) return apiError(404, "not_found", "That label is gone.");
  if (set.length === 0 && !(label.upc !== null && upcCandidates(parsed.data.upc).includes(label.upc))) {
    return NextResponse.json(
      { error: { code: "has_barcode", message: "That label already has a different barcode." }, existing: label },
      { status: 409 },
    );
  }
  return NextResponse.json(label);
}
