import type { Metadata } from "next";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Polaroid } from "@/components/ui/polaroid";
import { StatStrip } from "@/components/ui/stat-strip";
import { BottleStamps, StampDesignations, type StampSpec } from "@/components/bottles/bottle-stamp";
import { FillGauge } from "@/components/bottles/fill-gauge";
import { StatusMark } from "@/components/bottles/status-mark";
import { ColaApprovals } from "@/components/expressions/cola-approvals";
import { DeleteExpressionButton } from "@/components/expressions/delete-expression-button";
import { Chips, Mashbills, Spec } from "@/components/expressions/label-specs";
import { T8keHint } from "@/components/expressions/t8ke-hint";
import { CHAR_LEVEL_LABELS, type CharLevel } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { categoryBackdropClass, categoryTextClass } from "@/lib/bottles/category-color";
import { colaLookupEnabled, colasForExpression, distilleriesByPermit } from "@/lib/cola/store";
import { ageLabel } from "@/lib/expressions/display";
import { bottlesOfLabel, expressionLinks, getExpression, tastingNotesForLabel } from "@/lib/expressions/queries";
import { cn, formatDate, formatMoney, formatNumeric, humanise } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const [{ id }, user] = await Promise.all([params, requireSession()]);
  const row = Number.isInteger(Number(id)) ? await getExpression(Number(id), user.id) : null;
  return { title: row ? `${row.brand.name} ${row.expression.name}` : "Label" };
}

/** A tristate column as it reads: Yes, No, or nothing when unknown. */
function yesNo(value: boolean | null): string | null {
  return value === null ? null : value ? "Yes" : "No";
}

/** What tells one bottle of this label from another, in a few words. */
function releaseOf(bottle: Awaited<ReturnType<typeof bottlesOfLabel>>[number]): string {
  const parts = [
    bottle.pickName ? `“${bottle.pickName}”` : null,
    bottle.pickedBy ? `picked by ${bottle.pickedBy}` : bottle.isSingleBarrelPick ? "private selection" : null,
    bottle.barrelNumber ? `barrel ${bottle.barrelNumber}` : bottle.isSingleBarrel ? "single barrel" : null,
    bottle.batch ? `batch ${bottle.batch}` : null,
    bottle.releaseYear ? String(bottle.releaseYear) : null,
  ].filter(Boolean);
  if (parts.length === 0) return "Standard release";
  const text = parts.join(", ");
  return text[0]!.toUpperCase() + text.slice(1);
}

/**
 * A label's own page: the product, read rather than edited. Labels are the
 * reference library and the collection is what you own (DESIGN.md §15), so
 * this is the label's specs and approvals with every bottle of it you have
 * alongside — which, for single barrels and picks, is a side-by-side of every
 * barrel. Laid out like a bottle's page, so the two read as one world.
 */
export default async function LabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const expressionId = Number(id);
  if (!Number.isInteger(expressionId)) notFound();

  const user = await requireSession();
  // Someone else's label is simply not found.
  const row = await getExpression(expressionId, user.id);
  if (!row) notFound();

  const [links, owned, notes, colas] = await Promise.all([
    expressionLinks(expressionId),
    bottlesOfLabel(expressionId, user.id),
    tastingNotesForLabel(expressionId, user.id),
    colasForExpression(expressionId, user.id),
  ]);
  const distilleryMatches = await distilleriesByPermit(
    user.id,
    colas.map((cola) => cola.permitNumber),
  );

  const e = row.expression;
  const group = row.category.fieldGroup;
  const title = `${row.brand.name} ${e.name}`;
  const hero = owned.find((bottle) => bottle.filePath !== null) ?? null;

  const onShelf = owned.filter((bottle) => bottle.status === "owned" || bottle.status === "open");
  const paid = owned.map((bottle) => (bottle.pricePaid === null ? null : Number(bottle.pricePaid))).filter((v): v is number => v !== null);
  const averagePaid = paid.length > 0 ? paid.reduce((sum, v) => sum + v, 0) / paid.length : null;
  const ratings = notes.map((note) => (note.rating === null ? null : Number(note.rating))).filter((v): v is number => v !== null);
  const averageRating = ratings.length > 0 ? ratings.reduce((sum, v) => sum + v, 0) / ratings.length : null;

  const stamps: StampSpec[] = [
    { kind: "bottled-in-bond", ownerId: e.id, active: e.isBottledInBond },
    { kind: "cask-strength", ownerId: e.id, active: e.isCaskStrength, detail: e.proof ? `${formatNumeric(e.proof)}°` : undefined },
    { kind: "straight", ownerId: e.id, active: e.isStraight },
    { kind: "nas", ownerId: e.id, active: e.isNas },
  ];

  return (
    <div className="relative flex flex-col gap-8">
      <BottleStamps stamps={stamps} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/expressions" className="hover:text-accent">
              Labels
            </Link>
            {" · "}
            <span className={cn("font-medium", categoryTextClass(group))}>{row.category.name}</span>
          </p>
          <h1 className="text-3xl">
            <Link href={`/brands/${row.brand.slug}` as Route} className="hover:underline">
              {row.brand.name}
            </Link>{" "}
            <span className="text-accent">{e.name}</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/bottles/new?expression=${expressionId}`}>Add a bottle of this</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/expressions/${expressionId}/edit`}>Edit label</Link>
          </Button>
          <DeleteExpressionButton expressionId={expressionId} name={title} />
        </div>
      </div>

      <StatStrip
        items={[
          { label: owned.length === 1 ? "Bottle" : "Bottles", value: owned.length },
          { label: "On the shelf", value: onShelf.length },
          { label: "Average paid", value: averagePaid === null ? "—" : formatMoney(String(averagePaid)) },
          { label: "MSRP", value: e.msrp ? formatMoney(e.msrp) : "—" },
        ]}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Polaroid seed={expressionId} backdropClassName={categoryBackdropClass(group)} caption={row.brand.name}>
            <div className="flex size-full items-center justify-center p-6">
              {hero?.filePath ? (
                <Image
                  src={`/api/images/${hero.filePath}`}
                  alt={title}
                  width={640}
                  height={640}
                  unoptimized
                  className="size-full object-contain"
                />
              ) : (
                <FillGauge value={100} readOnly decorative fieldGroup={group} height={220} label={`${e.name}`} />
              )}
            </div>
          </Polaroid>
        </div>

        <div className="flex flex-col gap-6 pb-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 py-2 sm:grid-cols-3">
            <Spec label="Proof" value={formatNumeric(e.proof)} />
            <Spec label="ABV" value={e.abv ? `${formatNumeric(e.abv)}%` : null} />
            <Spec label="Age" value={ageLabel(e)} />
            <Spec label="Size" value={`${e.sizeMl} ml`} />
            <Spec label="UPC" value={e.upc} />
            <Spec label="Entry Proof" value={e.entryProof ? formatNumeric(e.entryProof) : null} />
            <Spec label="Chill Filtered" value={yesNo(e.isChillFiltered)} />
            <Spec label="Colour Added" value={yesNo(e.colorAdded)} />
            <Spec label="Char Level" value={e.charLevel ? (CHAR_LEVEL_LABELS[e.charLevel as CharLevel] ?? e.charLevel) : null} />
          </dl>
          <StampDesignations stamps={stamps} />

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
          </div>

          {e.description ? <p className="border-t border-border pt-6 text-sm">{e.description}</p> : null}

          <section className="flex flex-col gap-3 border-t border-border pt-6" aria-labelledby="label-bottles">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="label-bottles" className="text-xl">
                Your bottles of this
              </h2>
              <Link href={`/bottles/new?expression=${expressionId}`} className="text-sm text-primary hover:underline">
                Add another
              </Link>
            </div>
            {owned.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None yet. The label is here for reference until one is on the shelf.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-foreground text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-1.5 pr-3 font-semibold">
                        <span className="sr-only">Fill</span>
                      </th>
                      <th className="py-1.5 pr-4 font-semibold">Release</th>
                      <th className="py-1.5 pr-4 font-semibold">Proof</th>
                      <th className="py-1.5 pr-4 font-semibold">Store</th>
                      <th className="py-1.5 pr-4 font-semibold">Acquired</th>
                      <th className="py-1.5 pr-4 text-right font-semibold">Paid</th>
                      <th className="py-1.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {owned.map((bottle) => (
                      <tr key={bottle.id} className="border-b border-border align-middle">
                        <td className="py-2 pr-3">
                          <FillGauge value={bottle.fillPct} readOnly fieldGroup={group} height={36} label={`Fill ${bottle.fillPct}%`} />
                        </td>
                        <td className="py-2 pr-4">
                          <Link href={`/bottles/${bottle.id}`} className="font-medium hover:text-accent hover:underline">
                            {releaseOf(bottle)}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 tabular-nums">
                          {bottle.proof ? (
                            formatNumeric(bottle.proof)
                          ) : (
                            <span className="text-muted-foreground" title="As the label">
                              {formatNumeric(e.proof)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          {bottle.store?.slug ? (
                            <Link href={`/stores/${bottle.store.slug}` as Route} className="hover:text-accent">
                              {bottle.store.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">{bottle.dateAcquired ? formatDate(bottle.dateAcquired) : "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {bottle.pricePaid ? formatMoney(bottle.pricePaid) : "—"}
                        </td>
                        <td className="py-2">
                          <StatusMark status={bottle.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <ColaApprovals
            mode="label"
            className="border-t border-border pt-6"
            expressionId={expressionId}
            brandName={row.brand.name}
            colas={colas}
            lookupEnabled={colaLookupEnabled()}
            distilleryMatches={distilleryMatches}
          />

          <section className="flex flex-col gap-3 border-t border-border pt-6" aria-labelledby="label-notes">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="label-notes" className="text-xl">
                Tasting notes
              </h2>
              {averageRating !== null ? (
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  Average {formatNumeric(String(Math.round(averageRating * 10) / 10))} across {ratings.length}
                  <T8keHint />
                </p>
              ) : null}
            </div>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing tasted yet. Notes are added on a bottle&rsquo;s page, and every bottle&rsquo;s show here.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {notes.map((note) => (
                  <li key={note.id} className="flex flex-col gap-1 py-3 first:pt-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <Link href={`/bottles/${note.bottleId}`} className="font-medium hover:text-accent hover:underline">
                        {formatDate(note.tastedOn)}
                        {note.pickName || note.barrelNumber || note.batch ? (
                          <span className="font-normal text-muted-foreground">
                            {" · "}
                            {note.pickName ?? (note.barrelNumber ? `barrel ${note.barrelNumber}` : `batch ${note.batch}`)}
                          </span>
                        ) : null}
                      </Link>
                      {note.rating !== null ? <span className="tabular-nums">{formatNumeric(note.rating)} / 10</span> : null}
                    </div>
                    {[
                      ["Nose", note.nose],
                      ["Palate", note.palate],
                      ["Finish", note.finish],
                      ["Overall", note.overall],
                    ]
                      .filter(([, text]) => text)
                      .map(([heading, text]) => (
                        <p key={heading} className="text-sm">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">{heading}</span> {text}
                        </p>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
