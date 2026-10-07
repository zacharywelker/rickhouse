import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { expressions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, parseId, readJsonObject } from "@/lib/api/v1";
import { attachBarcodeSchema, upcCandidates } from "@/lib/api/labels";
import { pickerLabel } from "@/lib/expressions/picker";
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

  return NextResponse.json({
    id: expression.id,
    brand: row.brand.name,
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
