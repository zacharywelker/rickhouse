import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, parseId, readJsonObject } from "@/lib/api/v1";
import { releaseBodySchema } from "@/lib/api/releases";
import { saveRelease } from "@/lib/releases-store";

export const dynamic = "force-dynamic";

/** Adds a known release to one of your labels. The name is required; the rest can be left blank. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const id = parseId((await params).id);
  if (id === null) return apiError(404, "not_found", "That label is gone.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  const parsed = releaseBodySchema.safeParse(read.body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }

  const saved = await saveRelease(user.id, id, null, parsed.data);
  if (!saved.ok) return apiError(saved.status, saved.code, saved.message);
  revalidatePath(`/expressions/${id}`);
  return NextResponse.json(saved.release, { status: 201 });
}
