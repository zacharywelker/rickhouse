import type { Metadata } from "next";
import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Polaroid } from "@/components/ui/polaroid";
import { BottleImages } from "@/components/expressions/bottle-images";
import { BottleGroups } from "@/components/bottles/bottle-groups";
import { BottleStamps, type StampSpec } from "@/components/bottles/bottle-stamp";
import { DeleteBottleButton } from "@/components/bottles/delete-bottle-button";
import { FavoriteToggle } from "@/components/bottles/favorite-toggle";
import { FillControl } from "@/components/bottles/fill-control";
import { FillGauge } from "@/components/bottles/fill-gauge";
import { TastingNotes } from "@/components/expressions/tasting-notes";
import { Tape } from "@/components/ui/tape";
import { categoryColorVar, categoryTextClass, categoryTintClass } from "@/lib/bottles/category-color";
import { bottleImagesFor, expressionLinks, getBottle, tastingNotesFor } from "@/lib/expressions/queries";
import { allGroupOptions, groupsForBottle } from "@/lib/groups/queries";
import { seededRandom } from "@/lib/seeded-random";
import { TAPE_FONTS } from "@/lib/tape-fonts";
import { cn, formatMoney, formatNumeric, humanise } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = Number.isInteger(Number(id)) ? await getBottle(Number(id)) : null;
  return { title: row ? `${row.brand.name} ${row.expression.name}` : "Bottle" };
}

/**
 * Label facts (proof, ABV, size — printed on the bottle itself) and
 * bottle facts (what you paid, where, when — true of this one copy) get
 * two different inks: the label facts stay in the app's normal type, the
 * bottle facts render like they were filled in by hand after the fact.
 */
function Spec({
  label,
  value,
  handFont,
}: {
  label: string;
  value: React.ReactNode;
  /** A TAPE_FONTS className: renders the value like it was filled in by hand. */
  handFont?: string;
}) {
  if (value === null || value === undefined || value === "" || value === "—") return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm", handFont && cn("text-lg leading-tight text-accent", handFont))}>{value}</dd>
    </div>
  );
}

/**
 * Mashbills read as their recipe, not as a bare name, and on a blend each one
 * says whose it is (SPEC M7) — "78% Corn · 10% Rye · 12% Malted Barley" means
 * nothing on a three-distillery blend without knowing which distillery made
 * that part. On a single-distillery label the attribution is left off, because
 * there is only one possible answer.
 */
function Mashbills({
  items,
}: {
  items: Array<{
    id: number;
    name: string;
    amount: string | null;
    recipe: string;
    attribution?: string;
    attributionSlug?: string | null;
  }>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">Mashbills</span>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
            <Link href={`/mashbills/${item.id}` as Route} className="font-medium hover:text-accent">
              {item.recipe}
            </Link>
            {item.amount !== null ? (
              <span className="text-muted-foreground">{Number(item.amount)}% of the blend</span>
            ) : null}
            {item.attribution ? (
              <span className="text-muted-foreground">
                from{" "}
                {item.attributionSlug ? (
                  <Link href={`/distilleries/${item.attributionSlug}` as Route} className="hover:text-accent">
                    {item.attribution}
                  </Link>
                ) : (
                  item.attribution
                )}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chips({
  label,
  items,
  hrefFor,
}: {
  label: string;
  items: Array<{ id: number; name: string; slug: string | null; amount: string | null }>;
  hrefFor: (item: { id: number; slug: string | null }) => Route | null;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const href = hrefFor(item);
          const chip = (
            <Badge
              className={cn(
                "border-border bg-muted text-foreground",
                href && "transition-colors hover:border-primary/50 hover:text-primary",
              )}
            >
              {item.name}
              {item.amount !== null ? (
                <span className="ml-1 text-muted-foreground">{Number(item.amount)}%</span>
              ) : null}
            </Badge>
          );
          return <li key={item.id}>{href ? <Link href={href}>{chip}</Link> : chip}</li>;
        })}
      </ul>
    </div>
  );
}

export default async function BottlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bottleId = Number(id);
  if (!Number.isInteger(bottleId)) notFound();

  const row = await getBottle(bottleId);
  if (!row) notFound();

  const [images, notes, links, memberOf, allGroups] = await Promise.all([
    bottleImagesFor(bottleId),
    tastingNotesFor(bottleId),
    expressionLinks(row.expression.id),
    groupsForBottle(bottleId),
    allGroupOptions(),
  ]);

  const hero = images.find((image) => image.isPrimary) ?? images[0] ?? null;
  const e = row.expression;
  const b = row.bottle;
  const group = row.category.fieldGroup;

  const age =
    e.ageStatement ??
    [e.ageYears ? `${Number(e.ageYears)}y` : null, e.ageMonths ? `${e.ageMonths}m` : null, e.ageDays ? `${e.ageDays}d` : null]
      .filter(Boolean)
      .join(" ") ??
    null;

  // The pen this bottle's entry was "filled in" with — one hand for the
  // whole page, not a different marker per field.
  const handFont = TAPE_FONTS[Math.floor(seededRandom(bottleId)() * TAPE_FONTS.length)]?.className;

  const stamps: StampSpec[] = [
    { kind: "bottled-in-bond", ownerId: e.id, active: e.isBottledInBond },
    { kind: "cask-strength", ownerId: e.id, active: e.isCaskStrength, detail: e.proof ? `${formatNumeric(e.proof)}°` : undefined },
    { kind: "straight", ownerId: e.id, active: e.isStraight },
    { kind: "nas", ownerId: e.id, active: e.isNas },
    { kind: "single-barrel", ownerId: bottleId, active: b.isSingleBarrel, detail: b.barrelNumber ? `No. ${b.barrelNumber}` : undefined },
    {
      kind: "private-selection",
      ownerId: bottleId,
      active: b.isSingleBarrelPick,
      detail: b.pickedBy ? `Picked by ${b.pickedBy}` : undefined,
    },
  ];

  return (
    <div className="relative flex flex-col gap-8">
      <BottleStamps color={categoryColorVar(group)} stamps={stamps} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/bottles" className="hover:text-accent">
              Bottles
            </Link>
            {" · "}
            <span className={cn("font-medium", categoryTextClass(group))}>{row.category.name}</span>
          </p>
          <h1 className="flex items-center gap-2 text-3xl">
            <Link href={`/brands/${row.brand.slug}` as Route} className="hover:underline">
              {row.brand.name}
            </Link>{" "}
            <span className="text-accent">{e.name}</span>
            <FavoriteToggle bottleId={bottleId} isFavorite={row.bottle.isFavorite} />
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/bottles/${bottleId}/edit`}>
              <Pencil className="size-4" />
              Edit bottle
            </Link>
          </Button>
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
            <Polaroid seed={bottleId} caption={b.batch ? `${row.brand.name} — ${b.batch}` : row.brand.name}>
              <div className={cn("flex size-full items-center justify-center p-6", categoryTintClass(group))}>
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
                  <FillGauge
                    value={row.bottle.fillPct}
                    readOnly
                    decorative
                    fieldGroup={group}
                    height={220}
                    label={`${e.name} fill`}
                  />
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
          <BottleImages bottleId={bottleId} images={images} />
        </div>

        <div className="flex flex-col gap-6">
          <dl
            className="grid grid-cols-2 gap-x-4 gap-y-4 bg-[repeating-linear-gradient(to_bottom,transparent,transparent_1.6rem,var(--color-border)_1.6rem,var(--color-border)_calc(1.6rem+1px))] py-2 sm:grid-cols-3"
          >
            <Spec label="Proof" value={formatNumeric(e.proof)} />
            <Spec label="ABV" value={e.abv ? `${formatNumeric(e.abv)}%` : null} />
            <Spec label="Age" value={age} />
            <Spec label="Size" value={`${e.sizeMl} ml`} />
            <Spec label="MSRP" value={e.msrp ? formatMoney(e.msrp) : null} />
            <Spec label="Paid" value={row.bottle.pricePaid ? formatMoney(row.bottle.pricePaid) : null} handFont={handFont} />
            <Spec
              label="Store"
              value={
                row.store ? (
                  <Link href={`/stores/${row.store.slug}` as Route} className="text-primary hover:underline">
                    {row.store.name}
                  </Link>
                ) : null
              }
              handFont={handFont}
            />
            <Spec label="Acquired" value={row.bottle.dateAcquired} handFont={handFont} />
            <Spec label="How" value={humanise(row.bottle.acquisition)} handFont={handFont} />
            <Spec label="Status" value={humanise(row.bottle.status)} handFont={handFont} />
            <Spec label="Where" value={row.bottle.location} handFont={handFont} />
            <Spec label="Batch" value={b.batch} handFont={handFont} />
            <Spec label="UPC" value={e.upc} />
          </dl>

          <div className="border-t border-border pt-6">
            <BottleGroups bottleId={bottleId} memberOf={memberOf} allGroups={allGroups} />
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-6">
            <Chips
              label="Distilleries"
              items={links.distilleries}
              hrefFor={(item) => (item.slug ? (`/distilleries/${item.slug}` as Route) : null)}
            />
            <Mashbills items={links.mashbills} />
            <Chips
              label="Finishes"
              items={links.finishes}
              hrefFor={(item) => (item.slug ? (`/finishes/${item.slug}` as Route) : null)}
            />
            {b.pickName || b.pickedBy || b.barrelNumber || b.warehouse || b.barrelFilledOn || b.bottledOn ? (
              <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
                <Spec label="Pick" value={b.pickName} />
                <Spec label="Picked By" value={b.pickedBy} />
                <Spec label="Barrel" value={b.barrelNumber} />
                <Spec label="Warehouse" value={b.warehouse} />
                <Spec label="Rick / Floor" value={b.rickFloor} />
                <Spec label="Filled" value={b.barrelFilledOn} />
                <Spec label="Bottled" value={b.bottledOn} />
              </dl>
            ) : null}
            {group === "rum" ? (
              <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
                <Spec label="Still" value={humanise(e.stillType)} />
                <Spec label="Estate" value={e.estate} />
                <Spec label="Marque" value={e.marque} />
                <Spec label="Esters" value={e.esterGl ? `${Number(e.esterGl)} g/hLAA` : null} />
                <Spec label="Added sugar" value={e.sugarGPerL ? `${Number(e.sugarGPerL)} g/L` : null} />
                <Spec label="Base" value={humanise(e.molassesOrCane)} />
              </dl>
            ) : null}
            {group === "agave" ? (
              <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
                <Spec label="Agave" value={e.agaveType} />
                <Spec label="Region" value={e.agaveRegion} />
                <Spec label="Cooking" value={humanise(e.cookingMethod)} />
                <Spec label="Extraction" value={humanise(e.extraction)} />
              </dl>
            ) : null}
            <p className="border-t border-border pt-4 text-xs text-muted-foreground">
              Specs belong to the label.{" "}
              <Link href={`/expressions/${e.id}/edit`} className="text-primary hover:underline">
                Edit the label
              </Link>{" "}
              to change them for every bottle of it.
            </p>
          </div>

          {e.description || row.bottle.notes ? (
            <div className="flex flex-col gap-3 border-t border-border pt-6">
              {e.description ? <p className="text-sm">{e.description}</p> : null}
              {row.bottle.notes ? <p className={cn("text-lg text-accent", handFont)}>{row.bottle.notes}</p> : null}
            </div>
          ) : null}

          <div className="border-t border-border pt-6">
            <TastingNotes bottleId={bottleId} notes={notes} />
          </div>
        </div>
      </div>
    </div>
  );
}
