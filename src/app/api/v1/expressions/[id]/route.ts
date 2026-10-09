import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { expressions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, parseId, readJsonObject } from "@/lib/api/v1";
import { attachBarcodeSchema, upcCandidates } from "@/lib/api/labels";
import { pickerLabel } from "@/lib/expressions/picker";
import { labelFactsSchema, patchLabel } from "@/lib/expressions/label-patch";
import { linkRowSchema } from "@/lib/expressions/schema";
import { categoryWheels } from "@/lib/tasting-wheel-for";
import { bottlesOfLabel, expressionLinks, getExpression, tastingNotesForLabel } from "@/lib/expressions/queries";
import { expressionReleaseList } from "@/lib/releases-store";

export const dynamic = "force-dynamic";

/**
 * One label, read rather than edited: its specs and photo, its known releases, the caller's bottles of it
 * and the tastings on those bottles. Someone else's label is simply not found.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const id = parseId((await params).id);
  const row = id === null ? null : await getExpression(id, user.id);
  if (!row) return apiError(404, "not_found", "That label is gone.");

  const [links, releases, owned, tastings] = await Promise.all([
    expressionLinks(row.expression.id),
    expressionReleaseList(row.expression.id),
    bottlesOfLabel(row.expression.id, user.id),
    tastingNotesForLabel(row.expression.id, user.id),
  ]);
  const { expression } = row;
  const wheel = (await categoryWheels()).get(expression.categoryId) ?? null;

  return NextResponse.json({
    id: expression.id,
    wheel,
    brand: row.brand.name,
    brandId: expression.brandId,
    name: expression.name,
    category: row.category.name,
    upc: expression.upc,
    proof: expression.proof,
    ageStatement: expression.ageStatement,
    ageYears: expression.ageYears,
    sizeMl: expression.sizeMl,
    msrp: expression.msrp,
    photoPath: expression.photoPath,
    photoThumbPath: expression.photoThumbPath,
    // What the edit sends back: ids and shares, in order. Names alone cannot be saved.
    links: {
      distilleries: links.distilleries.map((d) => ({ id: d.id, name: d.name, amount: d.amount === null ? null : Number(d.amount), inferred: d.inferred === true })),
      mashbills: links.mashbills.map((m) => ({ id: m.id, name: m.name, amount: m.amount === null ? null : Number(m.amount), distilleryId: m.distilleryId ?? null })),
      finishes: links.finishes.map((f) => ({ id: f.id, name: f.name, amount: f.amount === null ? null : Number(f.amount) })),
    },
    distilleries: links.distilleries.map((d) => d.name),
    finishes: links.finishes.map((f) => f.name),
    mashbills: links.mashbills.map((m) => m.recipe),
    releases: releases.map((r) => ({
      id: r.id,
      name: r.name,
      releaseYear: r.releaseYear,
      proof: r.proof,
      ageStatement: r.ageStatement,
      msrp: r.msrp,
      photoThumbPath: r.photoThumbPath,
    })),
    bottles: owned.map((b) => ({
      id: b.id,
      status: b.status,
      isOpen: b.isOpen,
      fillPct: b.fillPct,
      release: b.releaseName ?? (b.batch ? `batch ${b.batch}` : null),
      releaseYear: b.releaseYear,
      pickName: b.pickName,
      barrelNumber: b.barrelNumber,
      pricePaid: b.pricePaid,
      dateAcquired: b.dateAcquired,
      store: b.store?.name ?? null,
      thumbPath: b.thumbPath,
    })),
    tastings: tastings.map((t) => ({
      id: t.id,
      bottleId: t.bottleId,
      source: t.source,
      tastedAt: t.tastedAt,
      tags: t.tags,
      tastedOn: t.tastedOn,
      rating: t.rating,
      nose: t.nose,
      palate: t.palate,
      finish: t.finish,
      overall: t.overall,
    })),
  });
}

/** A share the app read as null comes back as null; the web form's rule wants it blank. */
const linkRow = z.preprocess(
  (row) => (typeof row === "object" && row !== null && (row as { amount?: unknown }).amount === null ? { ...row, amount: "" } : row),
  linkRowSchema,
);
/** Duplicates would break the join table's key, and an order is what was sent. */
const linkList = z.array(linkRow).max(50).refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, "A row appears twice.");

const patchBody = labelFactsSchema
  .partial()
  .extend({ brand: z.string().trim().min(1, "Enter a brand.").max(120, "Keep this under 120 characters."), distilleries: linkList, mashbills: linkList, finishes: linkList })
  .partial()
  .strict()
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) ctx.addIssue({ code: "custom", message: "Send at least one field to change." });
    if (value.brandId !== undefined && value.brand !== undefined) ctx.addIssue({ code: "custom", path: ["brand"], message: "Send brandId or brand, not both." });
    // Which distillery made each mashbill depends on the distillery list, so the three are rewritten together.
    const lists = [value.distilleries, value.mashbills, value.finishes].filter((list) => list !== undefined).length;
    if (lists !== 0 && lists !== 3) ctx.addIssue({ code: "custom", path: ["distilleries"], message: "Send distilleries, mashbills and finishes together." });
  });

/**
 * Changes a label. A body of only `upc` is the scanner's: it saves a barcode onto a label that has none and
 * never overwrites (below). Anything else is an edit of the label's facts, partially, with `null` clearing a
 * fact: see `patchLabel`. A brand and name that another of the caller's labels already has is a 409
 * `name_taken` carrying that label, and nothing is saved.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const id = parseId((await params).id);
  if (id === null) return apiError(404, "not_found", "That label is gone.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;

  const keys = Object.keys(read.body);
  if (keys.length === 1 && keys[0] === "upc") return attachBarcode(user.id, id, read.body);

  const parsed = patchBody.safeParse(read.body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }
  const { brand, distilleries, mashbills, finishes, ...facts } = parsed.data;
  const outcome = await patchLabel(user.id, id, {
    facts,
    ...(brand !== undefined ? { brand } : {}),
    ...(distilleries && mashbills && finishes ? { links: { distilleries, mashbills, finishes } } : {}),
  });
  if (!outcome.ok) {
    if (outcome.kind === "gone") return apiError(404, "not_found", "That label is gone.");
    if (outcome.kind === "invalid") return apiError(422, "invalid", outcome.message, { [outcome.field]: outcome.message });
    return NextResponse.json(
      { error: { code: "name_taken", message: `You already have ${outcome.existing.title}.`, fields: { name: "Already taken." } }, existing: outcome.existing },
      { status: 409 },
    );
  }
  revalidatePath("/expressions");
  revalidatePath("/bottles");
  revalidatePath("/");
  const label = await pickerLabel(id, user.id);
  return label ? NextResponse.json(label) : apiError(404, "not_found", "That label is gone.");
}

/**
 * Saves a scanned barcode onto a label that has none, so the next scan finds
 * it. It never overwrites: a label that already has a different code is a 409
 * `has_barcode` and is left alone; the same code again is a no-op. Answers with
 * the label. Someone else's label is simply not found.
 */
async function attachBarcode(userId: number, id: number, body: Record<string, unknown>): Promise<NextResponse> {
  const parsed = attachBarcodeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }

  // One conditional update, so two phones can't both win and a code is never overwritten.
  const set = await db
    .update(expressions)
    .set({ upc: parsed.data.upc })
    .where(and(eq(expressions.id, id), eq(expressions.ownerId, userId), isNull(expressions.upc)))
    .returning({ id: expressions.id });
  if (set.length > 0) revalidatePath("/expressions");

  const label = await pickerLabel(id, userId);
  if (!label) return apiError(404, "not_found", "That label is gone.");
  if (set.length === 0 && !(label.upc !== null && upcCandidates(parsed.data.upc).includes(label.upc))) {
    return NextResponse.json(
      { error: { code: "has_barcode", message: "That label already has a different barcode." }, existing: label },
      { status: 409 },
    );
  }
  return NextResponse.json(label);
}
