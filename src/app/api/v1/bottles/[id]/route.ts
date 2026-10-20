import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { strengthTier } from "@/lib/expressions/rules";
import { apiError, issueFields, parseId, readJsonObject } from "@/lib/api/v1";
import { updateBottle } from "@/lib/bottles/state";
import { deleteBottleAction } from "@/app/(app)/bottles/actions";
import { bottleBase } from "@/lib/expressions/schema";
import { expressionReleaseList, releaseById } from "@/lib/releases-store";
import { categoryWheels } from "@/lib/tasting-wheel-for";
import { bottleImagesFor, categoryKindForExpression, expressionLinks, getBottle, tastingNotesFor } from "@/lib/expressions/queries";

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
    categoryGroup: row.category.fieldGroup,
    categoryKind: await categoryKindForExpression(expression.id),
    status: bottle.status,
    isOpen: bottle.isOpen,
    isFavorite: bottle.isFavorite,
    // Set while the bottle is muted from tonight's picks (a date in the future); null otherwise.
    mutedUntil: bottle.mutedUntil,
    fillPct: bottle.fillPct,
    // The bottle's own value when it overrides the label, otherwise the label's.
    proof: bottle.proof ?? release?.proof ?? expression.proof,
    // Navy Strength / Overproof, derived from that proof; null when neither.
    strength: strengthTier(row.category.fieldGroup, bottle.proof ?? release?.proof ?? expression.proof),
    ageStatement: bottle.ageStatement ?? ageSource.ageStatement,
    tequilaClass: bottle.tequilaClass ?? expression.tequilaClass,
    labelTequilaClass: expression.tequilaClass,
    brandyGrade: bottle.brandyGrade ?? expression.brandyGrade,
    isAgedGin: expression.isAgedGin,
    ginStyle: expression.ginStyle,
    ginIsNas: bottle.ginIsNas ?? expression.isNas,
    labelGinIsNas: expression.isNas,
    ageYears: bottle.ageYears ?? ageSource.ageYears,
    ageMonths: bottle.ageMonths ?? ageSource.ageMonths,
    ageDays: bottle.ageDays ?? ageSource.ageDays,
    sizeMl: bottle.sizeMl ?? expression.sizeMl,
    msrp: release?.msrp ?? expression.msrp,
    pricePaid: bottle.pricePaid,
    store: row.store?.name ?? null,
    storeId: bottle.storeId,
    dateAcquired: bottle.dateAcquired,
    dateOpened: bottle.dateOpened,
    // The bottle's own dates (null: it goes by the label's), and the label's for it to show.
    barrelFilledOn: bottle.barrelFilledOn,
    bottledOn: bottle.bottledOn,
    labelBarrelFilledOn: expression.barrelFilledOn,
    labelBottledOn: expression.bottledOn,
    acquisition: bottle.acquisition,
    releaseId: bottle.releaseId,
    batch: release?.name ?? bottle.batch,
    releaseYear: release?.releaseYear ?? bottle.releaseYear,
    isSingleBarrel: bottle.isSingleBarrel,
    isSingleBarrelPick: bottle.isSingleBarrelPick,
    pickedBy: bottle.pickedBy,
    warehouse: bottle.warehouse,
    rickFloor: bottle.rickFloor,
    bottleCount: bottle.bottleCount,
    // What this bottle says for itself, apart from the release and label it falls back on above (null: it goes by theirs).
    own: {
      proof: bottle.proof,
      ageYears: bottle.ageYears,
      ageMonths: bottle.ageMonths,
      ageDays: bottle.ageDays,
      ageStatement: bottle.ageStatement,
      tequilaClass: bottle.tequilaClass,
      brandyGrade: bottle.brandyGrade,
      ginIsNas: bottle.ginIsNas,
      sizeMl: bottle.sizeMl,
    },
    // The label's known releases, for the Release choice.
    releases: (await expressionReleaseList(expression.id)).map((r) => ({ id: r.id, name: r.name, releaseYear: r.releaseYear })),
    barrelNumber: bottle.barrelNumber,
    pickName: bottle.pickName,
    location: bottle.location,
    notes: bottle.notes,
    distilleries: links.distilleries.map((d) => d.name),
    finishes: links.finishes.map((f) => f.name),
    mashbills: links.mashbills.map((m) => m.recipe),
    ingredients: links.ingredients.map((i) => i.name),
    botanicals: links.ingredients.filter((i) => i.kind === "botanical").map((i) => i.name),
    ginBases: links.ingredients.filter((i) => i.kind === "gin_base").map((i) => i.name),
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

/**
 * What can change here. A field that is not listed is refused rather than quietly ignored, and a field sent
 * as `null` clears it. Status is never set directly: it follows the level and the Opened date.
 */
const patchSchema = bottleBase
  .pick({
    pricePaid: true, storeId: true, dateAcquired: true, location: true, notes: true, batch: true, releaseYear: true, barrelNumber: true,
    pickName: true, barrelFilledOn: true, bottledOn: true,
    expressionId: true, releaseId: true, acquisition: true, isSingleBarrel: true, isSingleBarrelPick: true, pickedBy: true,
    warehouse: true, rickFloor: true, bottleCount: true, sizeMl: true, proof: true, ageYears: true, ageMonths: true, ageDays: true,
    ageStatement: true, tequilaClass: true, brandyGrade: true, ginIsNas: true,
  })
  .extend({
    fillPct: z.number().int().min(0).max(100),
    dateOpened: z.string().nullable(),
    ifOpenedCleared: z.enum(["keep_open", "seal"]),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Send at least one field to change.");

/**
 * Changes a bottle: its level (with the web app's rules: below full opens a sealed bottle), its Opened date
 * (clearing it on an open bottle needs `ifOpenedCleared`: "keep_open" or "seal", which sets the level to full)
 * and its own facts. The answer says what else changed, so the app doesn't have to guess.
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

  const { fillPct, dateOpened, ifOpenedCleared, ...columns } = parsed.data;
  const outcome = await updateBottle(id, user.id, { fillPct, dateOpened, ifOpenedCleared, columns });
  if (!outcome) return apiError(404, "not_found", "That bottle is gone.");
  if (!outcome.ok) {
    return apiError(422, outcome.code, outcome.message, outcome.field ? { [outcome.field]: outcome.message } : outcome.code === "opened_cleared" ? { dateOpened: outcome.message } : undefined);
  }
  revalidatePath(`/bottles/${id}`);
  revalidatePath("/bottles");
  revalidatePath("/");
  return NextResponse.json(outcome.result);
}

/** Deletes one of your bottles and its photos. Its tastings stay on the label. Someone else's bottle is simply not found. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  const id = parseId((await params).id);
  if (id === null) return apiError(404, "not_found", "That bottle is gone.");
  const result = await deleteBottleAction(id);
  if (!result.ok) return apiError(404, "not_found", result.error);
  return NextResponse.json({ id });
}
