import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AcquisitionMix, CategoryShare, SealedByYear, SpendByMonth } from "@/components/dashboard/charts";
import { buildNumbers, type Chapter, type Finding } from "@/lib/dashboard/findings";
import { acquiring, money, shelf, stockpile } from "@/lib/dashboard/numbers";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Numbers" };
export const dynamic = "force-dynamic";

/**
 * Numbers as a chapter of the collector's own field guide (surface brief:
 * .impeccable/surfaces/src-app-app-numbers-page-tsx.md). One surprising
 * finding at display scale, then four chapters that each open on a finding,
 * prove it with one chart, and end at the bottles behind it. Not a dashboard:
 * no tiles, no cards, rules and type only.
 */
export default async function NumbersPage() {
  const user = await requireSession();
  const [stock, spend, arrivals, onShelf] = await Promise.all([
    stockpile(user.id),
    money(user.id),
    acquiring(user.id),
    shelf(user.id),
  ]);
  // The server's own calendar day (the container's TZ), which is what "this year" means here.
  const today = new Date().toLocaleDateString("en-CA");
  const { lead, chapters } = buildNumbers({ today, stockpile: stock, money: spend, acquiring: arrivals, shelf: onShelf });

  const charts: Record<Chapter["id"], React.ReactNode> = {
    stockpile: stock.sealedByYear.length > 0 ? <SealedByYear data={stock.sealedByYear} /> : null,
    money: spend.months.some((m) => m.spend > 0) ? <SpendByMonth data={spend.months} /> : null,
    acquiring: arrivals.mix.length > 0 ? <AcquisitionMix data={arrivals.mix} /> : null,
    shelf: onShelf.categories.length > 0 ? <CategoryShare data={onShelf.categories} /> : null,
  };

  if (!lead && stock.onShelf === 0 && spend.acquired === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl">Numbers</h1>
        <section className="max-w-prose border-t border-foreground pt-4">
          <p className="text-2xl leading-snug">Nothing to count yet.</p>
          <p className="mt-2 text-muted-foreground">
            Numbers reads your own records. Add a bottle and the first findings appear here.
          </p>
          <Link href="/bottles/new" className="mt-4 inline-flex items-center gap-1.5 underline underline-offset-4">
            Add a bottle
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <h1 className="text-xl">Numbers</h1>

      {lead ? (
        <section aria-label="Lead finding" className="mt-6 border-t-2 border-foreground pb-10 pt-6 sm:pb-14">
          <p className="max-w-[34ch] text-2xl leading-snug sm:text-3xl">
            <span className="block text-[clamp(4.5rem,15vw,6rem)] font-bold leading-[0.9] tracking-[-0.04em] tabular-nums">
              {lead.figure}
            </span>
            <span className="mt-3 block text-balance">{lead.sentence}</span>
          </p>
          <BottlesLink href={lead.href} className="mt-5 text-base" />
        </section>
      ) : null}

      <nav
        aria-label="Chapters"
        className="sticky top-0 z-10 -mx-4 overflow-x-auto border-y border-foreground bg-background px-4 sm:-mx-6 sm:px-6"
      >
        <ol className="flex min-w-max gap-6 py-2.5 text-sm">
          {chapters.map((chapter) => (
            <li key={chapter.id}>
              <a href={`#${chapter.id}`} className="hover:underline hover:underline-offset-4">
                <span className="mr-1.5 tabular-nums text-muted-foreground">{chapter.number}</span>
                {chapter.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {chapters.map((chapter) => (
        <ChapterSection key={chapter.id} chapter={chapter} chart={charts[chapter.id]} />
      ))}
    </div>
  );
}

function BottlesLink({ href, className }: { href: Route; className?: string }) {
  // A link to one bottle's page, not a filtered list.
  const single = /^\/bottles\/\d+$/.test(href);
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 underline decoration-1 underline-offset-4 hover:decoration-2 ${className ?? ""}`}
    >
      {single ? "See this bottle" : "See these bottles"}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

function ChapterSection({ chapter, chart }: { chapter: Chapter; chart: React.ReactNode }) {
  const [opening, ...rest] = chapter.findings;
  const headingId = `${chapter.id}-heading`;

  return (
    <section id={chapter.id} aria-labelledby={headingId} className="scroll-mt-14 pt-10 sm:pt-14">
      <h2 id={headingId} className="flex items-baseline gap-3 border-t-2 border-foreground pt-3 text-2xl tracking-tight">
        <span className="tabular-nums text-muted-foreground">{chapter.number}</span>
        {chapter.title}
      </h2>

      {chapter.findings.length === 0 && (chapter.thin || !chart) ? (
        <p className="mt-4 max-w-prose text-muted-foreground">Not enough bottles here yet to say anything.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
          {opening ? (
            <div className="lg:col-span-5">
              <p className="text-xl leading-snug">
                <span className="block text-5xl font-bold leading-none tracking-[-0.03em] tabular-nums sm:text-6xl">
                  {opening.figure}
                </span>
                <span className="mt-3 block text-balance">{opening.sentence}</span>
              </p>
              <BottlesLink href={opening.href} className="mt-4 text-sm" />
            </div>
          ) : null}

          {chart && !chapter.thin ? (
            <div className={opening ? "lg:col-span-7" : "lg:col-span-12"}>
              {chart}
              {chapter.coverage ? <p className="mt-2 text-sm text-muted-foreground">{chapter.coverage}</p> : null}
            </div>
          ) : chapter.thin ? (
            <p className="text-muted-foreground lg:col-span-7">
              Too few bottles with this information for a chart yet.
              {chapter.coverage ? ` ${chapter.coverage}` : ""}
            </p>
          ) : null}
        </div>
      )}

      {rest.length > 0 ? (
        <ul className="mt-8 divide-y divide-border border-t border-border">
          {rest.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li>
      <Link
        href={finding.href}
        className="group grid grid-cols-[minmax(5.5rem,auto)_1fr_auto] items-baseline gap-x-4 py-3 hover:bg-muted/50 focus-visible:bg-muted/50"
      >
        <span className="text-2xl font-bold tabular-nums tracking-tight">{finding.figure}</span>
        <span className="text-pretty">{finding.sentence}</span>
        <ArrowRight
          className="size-4 translate-y-0.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
