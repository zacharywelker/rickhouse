import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, readJsonObject } from "@/lib/api/v1";
import { CREATABLE_KINDS, LOOKUP_KINDS, createLookup, listLookup, type CreatableKind, type LookupKind } from "@/lib/lookups";

export const dynamic = "force-dynamic";

const isKind = (value: string): value is LookupKind => (LOOKUP_KINDS as readonly string[]).includes(value);
const isCreatable = (value: string): value is CreatableKind => (CREATABLE_KINDS as readonly string[]).includes(value);

/** The caller's own brands, distilleries, mashbills, finishes or stores, by name, with an optional `q` to narrow. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  const { kind } = await params;
  if (!isKind(kind)) return apiError(404, "not_found", "There is no such list.");
  return NextResponse.json({ items: await listLookup(kind, user.id, request.nextUrl.searchParams.get("q")) });
}

const createBody = z.object({ name: z.string().trim().min(1, "Enter a name.").max(120, "Keep this under 120 characters.") }).strict();

/** Makes a brand, distillery or finish by name, or returns the one already under that name. Mashbills and stores are made on the web. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  const { kind } = await params;
  if (!isKind(kind)) return apiError(404, "not_found", "There is no such list.");
  if (!isCreatable(kind)) return apiError(405, "not_creatable", "Add these on the web.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  const parsed = createBody.safeParse(read.body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }
  const made = await createLookup(kind, user.id, parsed.data.name);
  if (made.created) revalidatePath("/expressions");
  return NextResponse.json({ id: made.id, name: made.name, created: made.created }, { status: made.created ? 201 : 200 });
}
