import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, readJsonObject } from "@/lib/api/v1";
import { distillerySchema, storeSchema } from "@/lib/admin/schemas";
import { RESOURCES, type SaveOutcome } from "@/lib/admin/registry";
import { CREATABLE_KINDS, LOOKUP_KINDS, createLookup, createStore, findDistilleryByName, getMashbillItem, listLookup, type CreatableKind, type LookupKind } from "@/lib/lookups";
import type { CategoryKind } from "@/lib/expressions/rules";

export const dynamic = "force-dynamic";

const isKind = (value: string): value is LookupKind => (LOOKUP_KINDS as readonly string[]).includes(value);
const isCreatable = (value: string): value is CreatableKind => (CREATABLE_KINDS as readonly string[]).includes(value);

/** The caller's own brands, distilleries, mashbills, finishes or stores, by name, with an optional `q` to narrow. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  const { kind } = await params;
  if (!isKind(kind)) return apiError(404, "not_found", "There is no such list.");
  const spiritKind = request.nextUrl.searchParams.get("spiritKind");
  const allowed: CategoryKind[] = ["tequila", "mezcal", "cognac", "armagnac", "calvados", "pisco"];
  const q = request.nextUrl.searchParams.get("q");
  return NextResponse.json({ items: await (allowed.includes(spiritKind as CategoryKind)
    ? listLookup(kind, user.id, q, spiritKind as CategoryKind)
    : listLookup(kind, user.id, q)) });
}

/** A store is its name and its place; the web's store rules, minus the website and notes that stay on the web. */
const storeBody = storeSchema.pick({ name: true, city: true, state: true, country: true, isOnline: true }).strict();

const createBody = z.object({ name: z.string().trim().min(1, "Enter a name.").max(120, "Keep this under 120 characters.") }).strict();

/** What the phone's "add with details" page may set on a distillery. Slug, company and older names stay on the web. */
const distilleryDetailsBody = distillerySchema.omit({ slug: true, companyId: true, otherNames: true }).strict();

/** A mashbill's flags, notes and recipe; the web's mashbill rules judge the combination. */
const mashbillBody = z.object({
  isSecret: z.boolean().optional(),
  isGeneric: z.boolean().optional(),
  isPartial: z.boolean().optional(),
  name: z.string().optional(),
  notes: z.string().optional(),
  grains: z.array(z.object({ grain: z.string(), percent: z.number() }).strict()).optional(),
}).strict();

const rejected = (outcome: Extract<SaveOutcome, { ok: false }>) =>
  apiError(422, "invalid", outcome.error, outcome.fieldErrors);

/** Makes a brand, distillery, finish or mashbill, or a store by name and place. A name alone returns the one already there; a distillery with details does too, and keeps what it has. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  const { kind } = await params;
  if (!isKind(kind)) return apiError(404, "not_found", "There is no such list.");
  if (kind !== "stores" && kind !== "mashbills" && !isCreatable(kind)) return apiError(405, "not_creatable", "Add these on the web.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  if (kind === "mashbills") {
    const body = mashbillBody.safeParse(read.body);
    if (!body.success) {
      return apiError(422, "invalid", body.error.issues[0]?.message ?? "Check the fields.", issueFields(body.error.issues));
    }
    const saved = await RESOURCES.mashbills.save({ ...body.data, grains: JSON.stringify(body.data.grains ?? []) }, null, user.id);
    if (!saved.ok) return rejected(saved);
    revalidatePath("/expressions");
    const item = await getMashbillItem(user.id, saved.id);
    return NextResponse.json({ id: saved.id, name: item?.name ?? "", created: true }, { status: 201 });
  }
  if (kind === "distilleries" && Object.keys(read.body).some((key) => key !== "name")) {
    const body = distilleryDetailsBody.safeParse(read.body);
    if (!body.success) {
      return apiError(422, "invalid", body.error.issues[0]?.message ?? "Check the fields.", issueFields(body.error.issues));
    }
    // Same as a name alone: one you already have under that name comes back untouched, never overwritten.
    const had = await findDistilleryByName(user.id, body.data.name);
    if (had) return NextResponse.json({ ...had, created: false });
    const saved = await RESOURCES.distilleries.save(read.body, null, user.id);
    if (!saved.ok) return rejected(saved);
    revalidatePath("/expressions");
    return NextResponse.json({ id: saved.id, name: body.data.name, created: true }, { status: 201 });
  }
  if (kind === "stores") {
    const store = storeBody.safeParse(read.body);
    if (!store.success) {
      return apiError(422, "invalid", store.error.issues[0]?.message ?? "Check the fields.", issueFields(store.error.issues));
    }
    const made = await createStore(user.id, store.data);
    if (made.created) revalidatePath("/stores");
    return NextResponse.json({ id: made.id, name: made.name, created: made.created }, { status: made.created ? 201 : 200 });
  }
  if (!isCreatable(kind)) return apiError(405, "not_creatable", "Add these on the web.");
  const parsed = createBody.safeParse(read.body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }
  const made = await createLookup(kind, user.id, parsed.data.name);
  if (made.created) revalidatePath("/expressions");
  return NextResponse.json({ id: made.id, name: made.name, created: made.created }, { status: made.created ? 201 : 200 });
}
