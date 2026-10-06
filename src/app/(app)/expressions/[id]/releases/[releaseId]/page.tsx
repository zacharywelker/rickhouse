import type { Metadata } from "next";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Polaroid } from "@/components/ui/polaroid";
import { StatStrip } from "@/components/ui/stat-strip";
import { FillGauge } from "@/components/bottles/fill-gauge";
import { StatusMark } from "@/components/bottles/status-mark";
import { LabelPhotoControls } from "@/components/expressions/label-photo-controls";
import { Spec } from "@/components/expressions/label-specs";
import { DeleteReleaseButton, ReleaseForm } from "@/components/expressions/release-form";
import { requireSession } from "@/lib/auth";
import { getCurrency } from "@/lib/preferences";
import { categoryBackdropClass, categoryTextClass } from "@/lib/bottles/category-color";
import { ageLabel } from "@/lib/expressions/display";
import { bottlesOfLabel, getExpression, tastingNotesForLabel } from "@/lib/expressions/queries";
import { releaseLabel, releaseRow } from "@/lib/releases";
import { releaseById, releaseRemovalImpact } from "@/lib/releases-store";
import { cn, formatDate, formatMoney, formatNumeric } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function load(params: Promise<{ id: string; releaseId: string }>) {
  const { id, releaseId } = await params;
  const user = await requireSession();
  const expressionId = Number(id);
  const rid = Number(releaseId);
  if (!Number.isInteger(expressionId) || !Number.isInteger(rid)) return null;
  // Owned through its label, and has to be this label's.
  const release = await releaseById(rid, user.id);
  if (!release || release.expressionId !== expressionId) return null;
  const row = await getExpression(expressionId, user.id);
  return row ? { user, row, release } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; releaseId: string }> }): Promise<Metadata> {
  const loaded = await load(params);
  return { title: loaded ? `${loaded.row.brand.name} ${loaded.row.expression.name} — ${loaded.release.name}` : "Release" };
}

/** One known release of a label: its own photo and notes, specs over the label's, and the bottles of it. */
export default async function ReleasePage({ params }: { params: Promise<{ id: string; releaseId: string }> }) {
  const loaded = await load(params);
  if (!loaded) notFound();
  const { user, row, release } = loaded;
  const e = row.expression;
  const group = row.category.fieldGroup;
  const currency = await getCurrency();

  const [owned, notes, impact] = await Promise.all([
    bottlesOfLabel(e.id, user.id, release.id),
    tastingNotesForLabel(e.id, user.id, release.id),
    releaseRemovalImpact(e.id),
  ]);

  // The release's own value where it has one, the label's otherwise — the
  // same inheritance bottles of it get. Age is taken as a group.
  const proof = release.proof ?? e.proof;
  const releaseHasAge =
    release.ageYears !== null || release.ageMonths !== null || release.ageDays !== null || release.ageStatement !== null;
  const age = ageLabel(releaseHasAge ? release : e);
  const msrp = release.msrp ?? e.msrp;
  const heroPath = release.photoPath ?? e.photoPath;

  const paid = owned.map((b) => (b.pricePaid === null ? null : Number(b.pricePaid))).filter((v): v is number => v !== null);
  const averagePaid = paid.length > 0 ? paid.reduce((sum, v) => sum + v, 0) / paid.length : null;

  const inherited = (own: unknown) => (own === null ? "text-muted-foreground" : undefined);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/expressions" className="hover:text-accent">
              Labels
            </Link>
            {" · "}
            <Link href={`/expressions/${e.id}`} className={cn("font-medium hover:underline", categoryTextClass(group))}>
              {row.brand.name} {e.name}
            </Link>
          </p>
          <h1 className="text-3xl">
            <span className="text-accent">{releaseLabel(release)}</span>
          </h1>
        </div>
        <DeleteReleaseButton releaseId={release.id} expressionId={e.id} warning={impact[String(release.id)] ?? null} />
      </div>

      <StatStrip
        items={[
          { label: owned.length === 1 ? "Bottle" : "Bottles", value: owned.length },
          { label: "Average paid", value: averagePaid === null ? "—" : formatMoney(String(averagePaid), currency) },
          { label: "MSRP", value: msrp ? formatMoney(msrp, currency) : "—" },
        ]}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Polaroid seed={release.id} backdropClassName={categoryBackdropClass(group)} caption={release.name}>
            <div className="flex size-full items-center justify-center p-6">
              {heroPath ? (
                <Image
                  src={`/api/images/${heroPath}`}
                  alt={`${row.brand.name} ${e.name} ${release.name}`}
                  width={640}
                  height={640}
                  unoptimized
                  className={cn("size-full object-contain", release.photoPath === null && "opacity-60")}
                />
              ) : (
                <FillGauge value={100} readOnly decorative fieldGroup={group} height={220} label={release.name} />
              )}
            </div>
          </Polaroid>
          {release.photoPath === null && e.photoPath !== null ? (
            <p className="text-xs text-muted-foreground">Showing the label&rsquo;s photo until this release has its own.</p>
          ) : null}
          <LabelPhotoControls expressionId={e.id} releaseId={release.id} hasPhoto={release.photoPath !== null} />
        </div>

        <div className="flex flex-col gap-6 pb-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 py-2 sm:grid-cols-4">
            <Spec label="Proof" value={<span className={inherited(release.proof)}>{formatNumeric(proof)}</span>} />
            <Spec label="ABV" value={proof ? `${formatNumeric((Number(proof) / 2).toFixed(2))}%` : null} />
            <Spec label="Age" value={age ? <span className={releaseHasAge ? undefined : "text-muted-foreground"}>{age}</span> : null} />
            <Spec label="Year" value={release.releaseYear} />
          </dl>
          <p className="text-xs text-muted-foreground">Grey values come from the label; set them below to give this release its own.</p>

          {release.notes ? <p className="whitespace-pre-line border-t border-border pt-6 text-sm">{release.notes}</p> : null}

          <section className="flex flex-col gap-3 border-t border-border pt-6" aria-labelledby="release-bottles">
            <h2 id="release-bottles" className="text-xl">
              Your bottles of this release
            </h2>
            {owned.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None yet. Pick this release on a bottle of {row.brand.name} {e.name} and it shows here.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {owned.map((bottle) => (
                  <li key={bottle.id} className="flex items-center gap-3 py-2 text-sm">
                    <FillGauge value={bottle.fillPct} readOnly fieldGroup={group} height={36} label={`Fill ${bottle.fillPct}%`} />
                    <Link href={`/bottles/${bottle.id}`} className="font-medium hover:text-accent hover:underline">
                      {bottle.dateAcquired ? `Acquired ${formatDate(bottle.dateAcquired)}` : `Bottle #${bottle.id}`}
                    </Link>
                    {bottle.store?.slug ? (
                      <Link href={`/stores/${bottle.store.slug}` as Route} className="text-muted-foreground hover:text-accent">
                        {bottle.store.name}
                      </Link>
                    ) : null}
                    <span className="ml-auto tabular-nums">{bottle.pricePaid ? formatMoney(bottle.pricePaid, currency) : ""}</span>
                    <StatusMark status={bottle.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3 border-t border-border pt-6" aria-labelledby="release-tastings">
            <h2 id="release-tastings" className="text-xl">
              Tasting notes
            </h2>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing tasted from this release yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {notes.map((note) => (
                  <li key={note.id} className="flex flex-col gap-1 py-3 first:pt-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <Link href={`/bottles/${note.bottleId}`} className="font-medium hover:text-accent hover:underline">
                        {formatDate(note.tastedOn)}
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

          <section className="flex flex-col gap-3 border-t border-border pt-6" aria-labelledby="release-edit">
            <h2 id="release-edit" className="text-xl">
              Edit this release
            </h2>
            <p className="text-sm text-muted-foreground">
              The same release as its row on the label&rsquo;s edit form — changing it in either place changes both.
            </p>
            <ReleaseForm releaseId={release.id} initial={releaseRow(release)} notes={release.notes ?? ""} />
          </section>
        </div>
      </div>
    </div>
  );
}
