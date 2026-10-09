import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { apiError, issueFields, parseId, readJsonObject } from "@/lib/api/v1";
import { setFill } from "@/lib/bottles/state";
import { releaseById } from "@/lib/releases-store";
import { categoryWheels } from "@/lib/tasting-wheel-for";
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
    expressionId: expression.id,
    // The flavor wheel its label uses (null where the family has none), for logging a tasting on this bottle.
    wheel: (await categoryWheels()).get(expression.categoryId) ?? null,
    brand: row.brand.name,
    name: expression.name,
    category: row.category.name,
    status: bottle.status,
    isOpen: bottle.isOpen,
    isFavorite: bottle.isFavorite,
    // Set while the bottle is muted from tonight's picks (a date in the future); null otherwise.
    mutedUntil: bottle.mutedUntil,
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
    // No photo of its own: the release's, then the label's, stands in (id 0 — it isn't a bottle photo).
    images:
      images.length === 0 && (release?.photoPath ?? expression.photoPath)
        ? [
            release?.photoPath
              ? { id: 0, path: release.photoPath, thumbPath: release.photoThumbPath, isPrimary: true, caption: null }
              : { id: 0, path: expression.photoPath!, thumbPath: expression.photoThumbPath, isPrimary: true, caption: null },
          ]
        : images.map((i) => ({
            id: i.id,
            path: i.filePath,
            thumbPath: i.thumbPath,
            isPrimary: i.isPrimary,
            caption: i.caption,
          })),
    tastingNotes: notes.map((n) => ({
      id: n.id,
      source: n.source,
      tastedAt: n.tastedAt,
      tags: n.tags,
      tastedOn: n.tastedOn,
      rating: n.rating,
      nose: n.nose,
      palate: n.palate,
      finish: n.finish,
      overall: n.overall,
    })),
  });
}

/** Only these fields can change here; anything else is refused rather than quietly ignored. */
const patchSchema = z.object({ fillPct: z.number().int().min(0).max(100) }).strict();

/**
 * Sets the fill level, with the web app's rules: below full opens a sealed
 * bottle. The answer says what else changed, so the app doesn't have to guess.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const id = parseId((await params).id);
  if (id === null) return apiError(404, "not_found", "That bottle is gone.");

  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  const parsed = patchSchema.safeParse(read.body);
  if (!parsed.success) {
    return apiError(422, "invalid", parsed.error.issues[0]?.message ?? "Check the fields.", issueFields(parsed.error.issues));
  }

  const result = await setFill(id, user.id, parsed.data.fillPct);
  if (!result) return apiError(404, "not_found", "That bottle is gone.");
  revalidatePath(`/bottles/${id}`);
  revalidatePath("/bottles");
  revalidatePath("/");
  return NextResponse.json(result);
}
