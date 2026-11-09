import { ingredientHref } from "@/lib/expressions/ingredient-rules";
import { STRENGTH_TIER_LABELS, strengthTier } from "@/lib/expressions/rules";
import { formatSize } from "@/lib/expressions/sizes";
import type { Metadata } from "next";
import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Polaroid } from "@/components/ui/polaroid";
import { BottleImages } from "@/components/expressions/bottle-images";
import { BottleGroups } from "@/components/bottles/bottle-groups";
import { BottleStamps, StampDesignations, type StampSpec } from "@/components/bottles/bottle-stamp";
import { DeleteBottleButton } from "@/components/bottles/delete-bottle-button";
import { FavoriteToggle } from "@/components/bottles/favorite-toggle";
import { FillControl } from "@/components/bottles/fill-control";
import { FillNudgeProvider } from "@/components/bottles/fill-nudge";
import { TastingNotes } from "@/components/expressions/tasting-notes";
import { CharLevelSpec, Chips, Mashbills, Spec } from "@/components/expressions/label-specs";
import { ColaApprovals } from "@/components/expressions/cola-approvals";
import { Tape } from "@/components/ui/tape";
import { categoryBackdropClass, categoryTextClass } from "@/lib/bottles/category-color";
import { bottleImagesFor, categoryKindsById, expressionLinks, getBottle, tastingNotesFor } from "@/lib/expressions/queries";
import { allGroupOptions, groupsForBottle } from "@/lib/groups/queries";
import { requireSession } from "@/lib/auth";
import { nameWithYears } from "@/lib/other-names";
import { expressionOtherNames } from "@/lib/other-names-store";
import { releaseLabel } from "@/lib/releases";
import { releaseById } from "@/lib/releases-store";
import { getCurrency } from "@/lib/preferences";
import { colaLookupEnabled, colasForExpression, distilleriesByPermit } from "@/lib/cola/store";
import { describeMarkup, markup } from "@/lib/bottles/markup";
import { seededRandom } from "@/lib/seeded-random";
import { TAPE_FONTS } from "@/lib/tape-fonts";
import { effectiveBottleStatus, releaseUnit } from "@/lib/bottles/terminology";
import { ageLabel } from "@/lib/expressions/display";
import { hidesWarehouse, isAgaveKind, spiritAgeLabel, whiskeyCategoryGrains } from "@/lib/expressions/spirit-details";
import { isGinKind } from "@/lib/expressions/gin-details";
import { whiskeyAge } from "@/lib/expressions/whiskey-age";
import { cn, formatMoney, formatNumeric, humanise, formatDate, timeSince } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const [{ id }, user] = await Promise.all([params, requireSession()]);
  const row = Number.isInteger(Number(id)) ? await getBottle(Number(id), user.id) : null;
  return { title: row ? `${row.brand.name} ${row.expression.name}` : "Bottle" };
}

export default async function BottlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photos?: string }>;
}) {
  const [{ id }, { photos }] = await Promise.all([params, searchParams]);
  const bottleId = Number(id);
  if (!Number.isInteger(bottleId)) notFound();

  const user = await requireSession();
  const currency = await getCurrency();
  // Someone else's bottle is simply not found.
  const row = await getBottle(bottleId, user.id);
  if (!row) notFound();

  const [images, notes, links, memberOf, allGroups, colas] = await Promise.all([
    bottleImagesFor(bottleId),
    tastingNotesFor(bottleId),
    expressionLinks(row.expression.id),
    groupsForBottle(bottleId),
    allGroupOptions(user.id),
    colasForExpression(row.expression.id, user.id),
  ]);

  const distilleryMatches = await distilleriesByPermit(
    user.id,
    colas.map((cola) => cola.permitNumber),
  );

  // The older name of the label this bottle was sold under, if one was chosen.
  const version =
    row.bottle.expressionNameId === null
      ? null
      : ((await expressionOtherNames(row.expression.id)).find((name) => name.id === row.bottle.expressionNameId) ?? null);

  // The known release this bottle is, if one was chosen. Its proof, age and
  // MSRP sit between the bottle's own and the label's, as in bottle_list.
  const release = row.bottle.releaseId === null ? null : await releaseById(row.bottle.releaseId, user.id);
  const releaseHasAge =
    release !== null &&
    (release.ageYears !== null || release.ageMonths !== null || release.ageDays !== null || release.ageStatement !== null);
  const ageSource = releaseHasAge ? release : row.expression;

  const ownHero = images.find((image) => image.isPrimary) ?? images[0] ?? null;
  // No photo of its own: show the release's, then the label's.
  const fallbackPath = release?.photoPath ?? row.expression.photoPath;
  const hero = ownHero ?? (fallbackPath ? { filePath: fallbackPath } : null);
  const e = row.expression;
  const b = row.bottle;
  const group = row.category.fieldGroup;
  const categoryKinds = await categoryKindsById();
  const kind = categoryKinds[row.category.id] ?? "other";
  const releaseUnitName = releaseUnit(group, kind);
  const releaseUnitTitle = releaseUnitName[0]!.toUpperCase() + releaseUnitName.slice(1);
  const proof = group === "amaro" || group === "liqueur" ? e.proof : b.proof ?? release?.proof ?? e.proof;
  // Worked out from this bottle's own proof, which can differ from its label's.
  const tier = strengthTier(group, proof);
  const msrp = release?.msrp ?? e.msrp;
  const batch = ["vodka", "amaro", "liqueur"].includes(group) ? null : release ? releaseLabel(release) : b.batch;
  const paidVsMsrp = markup(b.pricePaid, msrp);
  // A bottle goes by its label's dates unless it has its own.
  const filledOn = b.barrelFilledOn ?? e.barrelFilledOn;
  const bottledOn = b.bottledOn ?? e.bottledOn;

  // The bottle's own age where it has one, then the release's or the label's
  // — the same inheritance as bottle_list.
  const bottleHasAge = b.ageYears !== null || b.ageMonths !== null || b.ageDays !== null || b.ageStatement !== null;
  const ageFacts = group === "amaro" || group === "liqueur" ? e : bottleHasAge ? b : ageSource;
  const whiskeyAgeInfo = group === "whiskey" ? whiskeyAge({ ...ageFacts, isStraight: e.isStraight, isNas: e.isNas, isBottledInBond: e.isBottledInBond }, kind) : null;
  const age = whiskeyAgeInfo?.text ?? (group === "vodka" || ((group === "amaro" || group === "liqueur") && !e.isAged) ? null : isGinKind(kind) && !e.isAgedGin ? null : isGinKind(kind) && (b.ginIsNas ?? e.isNas) ? "NAS" : spiritAgeLabel(kind, b.tequilaClass ?? e.tequilaClass, b.brandyGrade ?? e.brandyGrade,
    ageLabel({ ...ageFacts, ageStatement: null })) ?? ageLabel(ageFacts) ?? ((b.ginIsNas ?? e.isNas) ? "NAS" : null));

  // The pen this bottle's entry was "filled in" with — one hand for the
  // whole page, not a different marker per field.
  const handFont = TAPE_FONTS[Math.floor(seededRandom(bottleId)() * TAPE_FONTS.length)]?.className;

  const stamps: StampSpec[] = [
    { kind: "bottled-in-bond", ownerId: e.id, active: kind === "american" && e.isBottledInBond },
    { kind: "cask-strength", ownerId: e.id, active: !["vodka", "amaro", "liqueur"].includes(group) && e.isCaskStrength, detail: proof ? `${formatNumeric(proof)}°` : undefined },
    { kind: "straight", ownerId: e.id, active: kind === "american" && e.isStraight },
    { kind: "nas", ownerId: e.id, active: group === "whiskey" ? e.isNas : isGinKind(kind) ? e.isAgedGin && (b.ginIsNas ?? e.isNas) : (group === "amaro" || group === "liqueur") && e.isAged && e.isNas },
    {
      kind: "single-barrel",
      ownerId: bottleId,
      active: b.isSingleBarrel && !["vodka", "amaro", "liqueur"].includes(group) && (!isGinKind(kind) || e.isAgedGin),
      detail: b.barrelNumber ? `No. ${b.barrelNumber}` : undefined,
      unit: releaseUnitName,
    },
    {
      kind: "private-selection",
      ownerId: bottleId,
      active: b.isSingleBarrelPick && !["vodka", "amaro", "liqueur"].includes(group) && (!isGinKind(kind) || e.isAgedGin),
      detail: b.pickedBy ? `Picked by ${b.pickedBy}` : undefined,
    },
  ];

  return (
    <FillNudgeProvider>
    <div className="relative flex flex-col gap-8">
      <BottleStamps stamps={stamps} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/bottles" className="hover:text-accent">
              Collection
            </Link>
            {" · "}
            <span className={cn("font-medium", categoryTextClass(group))}>{row.category.name}</span>
          </p>
          <h1 className="flex items-center gap-2 text-3xl">
            <Link href={`/brands/${row.brand.slug}` as Route} className="hover:underline">
              {row.brand.name}
            </Link>{" "}
            <Link href={`/expressions/${e.id}`} className="text-accent hover:underline">
              {e.name}
            </Link>
            <FavoriteToggle bottleId={bottleId} isFavorite={row.bottle.isFavorite} />
          </h1>
          {version ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Sold as</span> {nameWithYears(version)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/bottles/${bottleId}/edit`}>
              Edit bottle
            </Link>
          </Button>
          <Button variant="outline" asChild><Link href={`/bottles/new?duplicate=${bottleId}`}>Duplicate bottle</Link></Button>
          <DeleteBottleButton bottleId={bottleId} name={`${row.brand.name} ${e.name}`} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <div className="relative w-full">
            {/*
             * The Polaroid frame clips the photo to its own shape (clean or
             * torn), but not this wrapper — so a corner tape flag can hang
             * slightly over the frame's edge instead of sitting neatly
             * inside it, the way a real piece of tape crosses over whatever
             * it's stuck to rather than stopping at its border.
             */}
            {b.acquisition === "gift" ? (
              <Tape color="pink" className="absolute -top-2 -left-3 z-10">
                Gift
              </Tape>
            ) : null}
            <Polaroid
              seed={bottleId}
              backdropClassName={categoryBackdropClass(group)}
              caption={batch ? `${row.brand.name} — ${batch}` : row.brand.name}
            >
              <div className="flex size-full items-center justify-center p-6">
                {hero ? (
                  <Image
                    src={`/api/images/${hero.filePath}`}
                    alt={`${row.brand.name} ${e.name}`}
                    width={640}
                    height={640}
                    unoptimized
                    className="size-full object-contain"
                  />
                ) : (
<p className="text-sm text-muted-foreground">No photo yet</p>
                )}
              </div>
            </Polaroid>
          </div>
          <FillControl
            bottleId={bottleId}
            fillPct={row.bottle.fillPct}
            fieldGroup={group}
            isOpen={row.bottle.isOpen}
            status={row.bottle.status}
            dateOpened={row.bottle.dateOpened}
            dateKilled={row.bottle.dateKilled}
          />
          <BottleImages
            bottleId={bottleId}
            images={images}
            initialError={photos === "failed" ? "The bottle saved, but its photos didn't upload. Add them again here." : null}
          />
        </div>

        <div className="flex flex-col gap-6 pb-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 py-2 sm:grid-cols-3">
            <Spec label="Proof" value={formatNumeric(proof)} />
            {tier ? <Spec label="Strength" value={STRENGTH_TIER_LABELS[tier]} /> : null}
            <Spec label="ABV" value={proof ? `${formatNumeric((Number(proof) / 2).toFixed(2))}%` : null} />
            <Spec label="Age" value={whiskeyAgeInfo?.inferred ? <abbr tabIndex={0} title={whiskeyAgeInfo.explanation ?? undefined} className="cursor-help italic no-underline">{age}</abbr> : age} />
            {isGinKind(kind) ? <Spec label="Aged" value={e.isAgedGin ? "Yes" : "No"} /> : null}
            {kind === "gin" ? <Spec label="Style" value={e.ginStyle} /> : null}
            {group === "amaro" ? <Spec label="Style" value={e.amaroStyle} /> : null}
            {group === "amaro" || group === "liqueur" ? <Spec label="Aged" value={e.isAged ? "Yes" : null} /> : null}
            {group === "amaro" || group === "liqueur" ? <Spec label="Country" value={e.originCountry} /> : null}
            {group === "amaro" || group === "liqueur" ? <Spec label="Region" value={e.originRegion} /> : null}
            {group === "liqueur" && ["liqueur", "chocolate-liqueur", "cream-liqueur"].includes(kind) ? <Spec label="Dairy" value={e.dairyStatus === "unknown" ? null : e.dairyStatus} /> : null}
            {(kind === "irish" || kind === "scotch") && e.peatStatus !== "unknown" ? <Spec label="Peat" value={e.peatStatus} /> : null}
            <Spec label="Size" value={formatSize(row.bottle.sizeMl ?? e.sizeMl)} />
            <Spec label="MSRP" value={msrp ? formatMoney(msrp, currency) : null} />
            <Spec
              label="Paid"
              value={
                row.bottle.pricePaid ? (
                  <>
                    {formatMoney(row.bottle.pricePaid, currency)}
                    {paidVsMsrp ? (
                      <span className="block text-xs text-muted-foreground">{describeMarkup(paidVsMsrp, currency)}</span>
                    ) : null}
                  </>
                ) : null
              }
            />
            <Spec
              label="Store"
              value={
                row.store ? (
                  <Link href={`/stores/${row.store.slug}` as Route} className="text-primary hover:underline">
                    {row.store.name}
                  </Link>
                ) : null
              }
            />
            <Spec
              label="Acquired"
              value={
                row.bottle.dateAcquired ? (
                  <>
                    {formatDate(row.bottle.dateAcquired)}
                    {timeSince(row.bottle.dateAcquired) ? (
                      <span className="block text-sm text-muted-foreground">{timeSince(row.bottle.dateAcquired)}</span>
                    ) : null}
                  </>
                ) : null
              }
            />
            <Spec label="How" value={humanise(row.bottle.acquisition)} />
            <Spec label="Status" value={humanise(effectiveBottleStatus(row.bottle))} />
            <Spec label="Where" value={row.bottle.location} />
            {!(["vodka", "amaro", "liqueur"].includes(group)) ? <Spec
              label={release ? "Release" : "Batch"}
              value={
                release ? (
                  <Link href={`/expressions/${e.id}/releases/${release.id}` as Route} className="text-primary hover:underline">
                    {batch}
                  </Link>
                ) : (
                  batch
                )
              }
            /> : null}
            <Spec label="UPC" value={e.upc} />
            {group === "whiskey" && kind !== "scotch" ? <Spec label="Cooperage" value={row.cooperage} /> : null}
          </dl>
          {group !== "whiskey" ? <CharLevelSpec value={e.charLevel} /> : null}
          <StampDesignations stamps={stamps} />

          <div className="border-t border-border pt-6">
            <BottleGroups bottleId={bottleId} memberOf={memberOf} allGroups={allGroups} />
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-6">
            <Chips
              label={group === "rum" ? "Distilleries / Estates" : "Distilleries"}
              items={links.distilleries}
              hrefFor={(item) => (item.slug ? (`/distilleries/${item.slug}` as Route) : null)}
            />
            {group === "gin" ? <>
                <Chips label="Botanicals" items={links.ingredients.filter((item) => item.kind === "botanical")} hrefFor={ingredientHref} />
                <Chips label="Base spirits" items={links.ingredients.filter((item) => item.kind === "gin_base")} hrefFor={ingredientHref} />
              </> : group === "vodka" || group === "amaro" || group === "liqueur" ? <>
                {group === "vodka" ? <Chips label="Base Ingredients" items={links.ingredients.filter((item) => item.kind === "vodka_base")} hrefFor={ingredientHref} /> : null}
                {group === "amaro" ? <Chips label="Botanicals" items={links.ingredients.filter((item) => item.kind === "botanical")} hrefFor={ingredientHref} /> : null}
                {group === "liqueur" ? <Chips label="Base Ingredients" items={links.ingredients.filter((item) => item.kind === "liqueur_base")} hrefFor={ingredientHref} /> : null}
                {group === "liqueur" || kind === "flavored-vodka" ? <Chips label="Flavors" items={links.ingredients.filter((item) => item.kind === "flavor")} hrefFor={ingredientHref} /> : null}
              </> : group === "rum" || group === "agave" || group === "brandy"
              ? <Chips label={group === "agave" ? "Magueys" : group === "brandy" ? "Distillate" : "Base"} items={links.ingredients} hrefFor={ingredientHref} />
              : <>{whiskeyCategoryGrains(row.category.slug) ? <dl><Spec label="Category grains" value={whiskeyCategoryGrains(row.category.slug)} /></dl> : null}<Mashbills items={links.mashbills} /></>}
            {(group !== "gin" || e.isAgedGin) && group !== "vodka" && ((group !== "amaro" && group !== "liqueur") || e.isAged) ? <Chips
              label={["canadian", "irish", "scotch", "amaro", "liqueur", "chocolate-liqueur", "cream-liqueur"].includes(kind) ? "Cask Types" : "Finishes"}
              items={links.finishes}
              hrefFor={(item) => (item.slug ? (`/finishes/${item.slug}` as Route) : null)}
            /> : null}
            {!(["vodka", "amaro", "liqueur"].includes(group)) && (group !== "gin" || e.isAgedGin) && (b.pickName || b.pickedBy || b.barrelNumber || (!hidesWarehouse(group, kind) && b.warehouse) || (!isAgaveKind(kind) && !isGinKind(kind) && (filledOn || bottledOn))) ? (
              <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
                <Spec label="Pick" value={b.pickName} />
                <Spec label="Picked By" value={b.pickedBy} />
                <Spec label={`${releaseUnitTitle} number`} value={b.barrelNumber} />
                {!hidesWarehouse(group, kind) ? <Spec label="Warehouse" value={b.warehouse} /> : null}
                {!hidesWarehouse(group, kind) ? <Spec label="Rick / Floor" value={b.rickFloor} /> : null}
                {!isAgaveKind(kind) && !isGinKind(kind) ? <Spec label="Filled" value={filledOn ? formatDate(filledOn) : null} /> : null}
                {!isAgaveKind(kind) && !isGinKind(kind) ? <Spec label="Bottled" value={bottledOn ? formatDate(bottledOn) : null} /> : null}
              </dl>
            ) : null}
            {group === "rum" ? (
              <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
                <Spec label="Still" value={humanise(e.stillType)} />
                <Spec label="Marque" value={e.marque} />
                <Spec label="Esters" value={e.esterGl ? `${Number(e.esterGl)} g/hLAA` : null} />
                <Spec label="Added sugar" value={e.sugarGPerL ? `${Number(e.sugarGPerL)} g/L` : null} />
              </dl>
            ) : null}
            {group === "agave" ? (
              <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
                <Spec label="Cooking" value={humanise(e.cookingMethod)} />
                <Spec label="Extraction" value={humanise(e.extraction)} />
              </dl>
            ) : null}
            <p className="border-t border-border pt-4 text-xs text-muted-foreground">
              Specs belong to the label.{" "}
              <Link href={`/expressions/${e.id}`} className="text-primary underline underline-offset-2 hover:no-underline">
                Open the label
              </Link>{" "}
              to see every bottle of it, or{" "}
              <Link href={`/expressions/${e.id}/edit`} className="text-primary underline underline-offset-2 hover:no-underline">
                edit it
              </Link>{" "}
              to change them for all of them.
            </p>
          </div>

          {e.description || row.bottle.notes ? (
            <div className="flex flex-col gap-3 border-t border-border pt-6">
              {e.description ? <p className="text-sm">{e.description}</p> : null}
              {row.bottle.notes ? <p className={cn("text-lg text-accent", handFont)}>{row.bottle.notes}</p> : null}
            </div>
          ) : null}

          <ColaApprovals
            mode="bottle"
            className="border-t border-border pt-6"
            bottleId={bottleId}
            colas={colas}
            lookupEnabled={colaLookupEnabled()}
            distilleryMatches={distilleryMatches}
          />

          <div className="border-t border-border pt-6">
            <TastingNotes bottleId={bottleId} notes={notes} />
          </div>
        </div>
      </div>
    </div>
    </FillNudgeProvider>
  );
}
