import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, parseId, readJsonObject } from "@/lib/api/v1";
import { releaseBodySchema } from "@/lib/api/releases";
import { removeRelease, saveRelease } from "@/lib/releases-store";

export const dynamic = "force-dynamic";

/** Changes one known release of one of your labels; only what is sent changes, and a blank clears it. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const { id: rawId, releaseId: rawRelease } = await params;
  const id = parseId(rawId);
  const releaseId = parseId(rawRelease);
  if (id === null || releaseId === null) return apiError(404, "not_found", "That release is gone.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  const parsed = releaseBodySchema
    .refine((value) => Object.keys(value).length > 0, "Send at least one field to change.")
    .safeParse(read.body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }

  const saved = await saveRelease(user.id, id, releaseId, parsed.data);
  if (!saved.ok) return apiError(saved.status, saved.code, saved.message);
  revalidatePath(`/expressions/${id}`);
  return NextResponse.json(saved.release);
}

/**
 * Removes one known release of one of your labels, with its photo and notes. Its bottles and their tastings stay but
 * lose the release; `bottles` says how many. It cannot be undone: the label read gives each release a `removal` line
 * saying what it would take with it, for the app to show first.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const { id: rawId, releaseId: rawRelease } = await params;
  const id = parseId(rawId);
  const releaseId = parseId(rawRelease);
  if (id === null || releaseId === null) return apiError(404, "not_found", "That release is gone.");

  const removed = await removeRelease(user.id, id, releaseId);
  if (!removed.ok) return apiError(removed.status, removed.code, removed.message);
  revalidatePath(`/expressions/${id}`);
  revalidatePath("/bottles");
  return NextResponse.json({ id: releaseId, bottles: removed.bottles });
}
