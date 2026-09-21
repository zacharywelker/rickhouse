import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BottleImages } from "@/components/expressions/bottle-images";
import { FillControl } from "@/components/bottles/fill-control";
import { TastingNotes } from "@/components/expressions/tasting-notes";
import { bottleImagesFor, expressionLinks, getBottle, tastingNotesFor } from "@/lib/expressions/queries";
import { formatMoney, formatNumeric, humanise } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = Number.isInteger(Number(id)) ? await getBottle(Number(id)) : null;
  return { title: row ? `${row.brand.name} ${row.expression.name}` : "Bottle" };
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "" || value === "—") return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function Chips({ label, items }: { label: string; items: Array<{ id: number; name: string; amount: string | null }> }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            {/* Entity pages arrive in Milestone 5; these become links then. */}
            <Badge className="border-border bg-muted text-foreground">
              {item.name}
              {item.amount !== null ? (
                <span className="ml-1 text-muted-foreground">{Number(item.amount)}%</span>
              ) : null}
            </Badge>
          </li>
        ))}
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

  const [images, notes, links] = await Promise.all([
    bottleImagesFor(bottleId),
    tastingNotesFor(bottleId),
    expressionLinks(row.expression.id),
  ]);

  const hero = images.find((image) => image.isPrimary) ?? images[0] ?? null;
  const e = row.expression;
  const group = row.category.fieldGroup;

  const age =
    e.ageStatement ??
    [e.ageYears ? `${Number(e.ageYears)}y` : null, e.ageMonths ? `${e.ageMonths}m` : null, e.ageDays ? `${e.ageDays}d` : null]
      .filter(Boolean)
      .join(" ") ??
    null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/bottles" className="hover:text-rye-gold">
              Bottles
            </Link>
            {" · "}
            {row.category.name}
          </p>
          <h1 className="font-display text-3xl">
            {row.brand.name} <span className="text-rye-gold">{e.name}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {e.batch ? <Badge>{e.batch}</Badge> : null}
            {e.isSingleBarrel ? <Badge className="border-primary/40 text-primary">Single barrel</Badge> : null}
            {e.isSingleBarrelPick ? <Badge className="border-primary/40 text-primary">Private selection</Badge> : null}
            {e.isCaskStrength ? <Badge>Cask strength</Badge> : null}
            {e.isBottledInBond ? <Badge>Bottled in bond</Badge> : null}
            {row.bottle.isFavorite ? <Badge className="border-rye-gold/40 text-rye-gold">Favourite</Badge> : null}
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/bottles/${bottleId}/edit`}>
            <Pencil className="size-4" />
            Edit bottle
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          {hero ? (
            <Image
              src={`/api/images/${hero.filePath}`}
              alt={`${row.brand.name} ${e.name}`}
              width={640}
              height={640}
              unoptimized
              className="w-full rounded-lg border border-border bg-muted object-contain"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              No photo yet
            </div>
          )}
          <FillControl
            bottleId={bottleId}
            fillPct={row.bottle.fillPct}
            isOpen={row.bottle.isOpen}
            status={row.bottle.status}
            dateOpened={row.bottle.dateOpened}
            dateKilled={row.bottle.dateKilled}
          />
          <BottleImages bottleId={bottleId} images={images} />
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
              <Spec label="Proof" value={formatNumeric(e.proof)} />
              <Spec label="ABV" value={e.abv ? `${formatNumeric(e.abv)}%` : null} />
              <Spec label="Age" value={age} />
              <Spec label="Size" value={`${e.sizeMl} ml`} />
              <Spec label="MSRP" value={e.msrp ? formatMoney(e.msrp) : null} />
              <Spec label="Paid" value={row.bottle.pricePaid ? formatMoney(row.bottle.pricePaid) : null} />
              <Spec label="Store" value={row.store?.name ?? null} />
              <Spec label="Acquired" value={row.bottle.dateAcquired} />
              <Spec label="How" value={humanise(row.bottle.acquisition)} />
              <Spec label="Status" value={humanise(row.bottle.status)} />
              <Spec label="Where" value={row.bottle.location} />
              <Spec label="UPC" value={e.upc} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4 p-5">
              <Chips label="Distilleries" items={links.distilleries} />
              <Chips label="Mashbills" items={links.mashbills} />
              <Chips label="Finishes" items={links.finishes} />
              {e.pickName || e.pickedBy || e.barrelNumber || e.warehouse ? (
                <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
                  <Spec label="Pick" value={e.pickName} />
                  <Spec label="Picked by" value={e.pickedBy} />
                  <Spec label="Barrel" value={e.barrelNumber} />
                  <Spec label="Warehouse" value={e.warehouse} />
                  <Spec label="Rick / floor" value={e.rickFloor} />
                  <Spec label="Filled" value={e.barrelFilledOn} />
                  <Spec label="Bottled" value={e.bottledOn} />
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
                Specs belong to the expression.{" "}
                <Link href={`/expressions/${e.id}/edit`} className="text-primary hover:underline">
                  Edit the expression
                </Link>{" "}
                to change them for every bottle of it.
              </p>
            </CardContent>
          </Card>

          {e.description || row.bottle.notes ? (
            <Card>
              <CardContent className="flex flex-col gap-3 p-5">
                {e.description ? <p className="text-sm">{e.description}</p> : null}
                {row.bottle.notes ? (
                  <p className="text-sm text-muted-foreground">{row.bottle.notes}</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <TastingNotes bottleId={bottleId} notes={notes} />
        </div>
      </div>
    </div>
  );
}
