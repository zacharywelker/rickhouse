import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, parseId } from "@/lib/api/v1";
import { releaseById } from "@/lib/releases-store";
import { bottleImagesFor, expressionLinks, getBottle, tastingNotesFor } from "@/lib/expressions/queries";

export const dynamic = "force-dynamic";

/** One bottle with its label's specs, photos and tasting notes. Someone else's bottle is simply not found. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const id = parseId((await params).id);
  const row = id === null ? null : await getBottle(id, user.id);
  if (!row) return apiError(404, "not_found", "That bottle is gone.");

  const [images, notes, links] = await Promise.all([
    bottleImagesFor(row.bottle.id),
    tastingNotesFor(row.bottle.id),
    expressionLinks(row.expression.id),
  ]);
  const { bottle, expression } = row;
  // A chosen release sits between the bottle and the label, as on the web.
  const release = bottle.releaseId === null ? null : await releaseById(bottle.releaseId, user.id);
  const ageSource =
    release && (release.ageYears ?? release.ageMonths ?? release.ageDays ?? release.ageStatement) !== null
      ? release
      : expression;

  return NextResponse.json({
    id: bottle.id,
    brand: row.brand.name,
    name: expression.name,
    category: row.category.name,
    status: bottle.status,
    isOpen: bottle.isOpen,
    isFavorite: bottle.isFavorite,
    fillPct: bottle.fillPct,
    // The bottle's own value when it overrides the label, otherwise the label's.
    proof: bottle.proof ?? release?.proof ?? expression.proof,
    ageStatement: bottle.ageStatement ?? ageSource.ageStatement,
    ageYears: bottle.ageYears ?? ageSource.ageYears,
    sizeMl: expression.sizeMl,
    msrp: release?.msrp ?? expression.msrp,
    pricePaid: bottle.pricePaid,
    store: row.store?.name ?? null,
    dateAcquired: bottle.dateAcquired,
    dateOpened: bottle.dateOpened,
    acquisition: bottle.acquisition,
    releaseId: bottle.releaseId,
    batch: release?.name ?? bottle.batch,
    releaseYear: release?.releaseYear ?? bottle.releaseYear,
    isSingleBarrel: bottle.isSingleBarrel,
    isSingleBarrelPick: bottle.isSingleBarrelPick,
    barrelNumber: bottle.barrelNumber,
    pickName: bottle.pickName,
    location: bottle.location,
    notes: bottle.notes,
    distilleries: links.distilleries.map((d) => d.name),
    finishes: links.finishes.map((f) => f.name),
    mashbills: links.mashbills.map((m) => m.recipe),
    images: images.map((i) => ({
      id: i.id,
      path: i.filePath,
      thumbPath: i.thumbPath,
      isPrimary: i.isPrimary,
      caption: i.caption,
    })),
    tastingNotes: notes.map((n) => ({
      id: n.id,
      tastedOn: n.tastedOn,
      rating: n.rating,
      nose: n.nose,
      palate: n.palate,
      finish: n.finish,
      overall: n.overall,
    })),
  });
}
