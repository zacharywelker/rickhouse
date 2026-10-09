import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, parseId, readJsonObject } from "@/lib/api/v1";
import { KEEPABLE_FACTS, MergeError, mergeLabels } from "@/lib/expressions/merge";
import { pickerLabel } from "@/lib/expressions/picker";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    into: z.number().int().positive("Choose the label to merge into."),
    keepMine: z.array(z.enum(KEEPABLE_FACTS)).max(KEEPABLE_FACTS.length).default([]),
  })
  .strict();

/**
 * Merges this label into another of the caller's: its bottles and tastings move across, the other
 * label's facts win unless `keepMine` names a fact to carry over, and this label is removed. It cannot
 * be undone. Answers with the surviving label and what moved.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const id = parseId((await params).id);
  if (id === null) return apiError(404, "not_found", "That label is gone.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  const parsed = bodySchema.safeParse(read.body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }

  try {
    const moved = await mergeLabels(user.id, id, parsed.data.into, parsed.data.keepMine);
    const label = await pickerLabel(moved.intoId, user.id);
    revalidatePath("/expressions");
    revalidatePath("/bottles");
    revalidatePath("/");
    return NextResponse.json({ label, bottles: moved.bottles, tastings: moved.tastings });
  } catch (error: unknown) {
    if (error instanceof MergeError) {
      return error.code === "same"
        ? apiError(422, "invalid", "A label cannot be merged into itself.", { into: "Choose a different label." })
        : apiError(404, "not_found", "That label is gone.");
    }
    throw error;
  }
}
