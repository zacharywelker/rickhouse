import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Acquisitions, CategoryShare, ProofDistribution, TopDistilleries } from "@/components/dashboard/charts";
import {
  acquisitionsOverTime,
  categoryShare,
  headline,
  longHeldCount,
  longestHeldBottle,
  mostExpensiveBottle,
  proofDistribution,
  topDistilleries,
  topFinish,
  topMashbill,
} from "@/lib/dashboard/queries";
import { buildObservations, type Observation } from "@/lib/dashboard/observations";

export const metadata: Metadata = { title: "Numbers" };
export const dynamic = "force-dynamic";

const LONG_HELD_YEARS = 5;

export default async function NumbersPage() {
  const [stats, categories, proof, acquisitions, distilleries, mashbill, finish, expensive, longestHeld, longHeld] =
    await Promise.all([
      headline(),
      categoryShare(),
      proofDistribution(),
      acquisitionsOverTime(),
      topDistilleries(),
      topMashbill(),
      topFinish(),
      mostExpensiveBottle(),
      longestHeldBottle(),
      longHeldCount(LONG_HELD_YEARS),
    ]);

  const items = buildObservations({
    stats,
    categories,
    proof,
    distilleries,
    expensive,
    longestHeld,
    longHeldYears: LONG_HELD_YEARS,
    longHeldCount: longHeld,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Numbers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What the collection actually looks like, rather than what you remember buying.
        </p>
      </div>

      {items.length > 0 ? (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ObservationCard key={item.id} item={item} />
          ))}
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryShare data={categories} />
        <Card>
          <CardContent className="flex h-full flex-col justify-center gap-5 p-6">
            <Leader
              label="Most-used mashbill"
              value={mashbill?.label ?? null}
              count={mashbill?.count}
              href={mashbill ? (`/mashbills/${mashbill.id}` as Route) : null}
            />
            <Leader
              label="Most-used finish"
              value={finish?.label ?? null}
              count={finish?.count}
              href={finish ? (`/finishes/${finish.slug}` as Route) : null}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProofDistribution data={proof} />
        <Acquisitions data={acquisitions} />
      </section>

      <TopDistilleries data={distilleries} />
    </div>
  );
}

/**
 * Curiosity before dashboards (DESIGN-BRIEF.MD §22): a short claim about the
 * collection, pointing straight at the bottles behind it.
 */
function ObservationCard({ item }: { item: Observation }) {
  const body = (
    <CardContent className="p-4">
      <p className="text-sm text-foreground">{item.text}</p>
      {item.detail ? <p className="mt-1 text-2xl tabular-nums text-accent">{item.detail}</p> : null}
    </CardContent>
  );

  if (!item.href) {
    return <Card>{body}</Card>;
  }

  return (
    <Link href={item.href} className="block">
      <Card className="h-full transition-colors hover:border-accent">{body}</Card>
    </Link>
  );
}

/** A single winner is a stat, not a one-bar chart. */
function Leader({
  label,
  value,
  count,
  href,
}: {
  label: string;
  value: string | null;
  count?: number;
  href: Route | null;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {value === null ? (
        <p className="text-xl text-muted-foreground">Nothing yet</p>
      ) : (
        <p className="text-xl">
          {href ? (
            <Link href={href} className="hover:text-accent">
              {value}
            </Link>
          ) : (
            value
          )}
          {count !== undefined ? (
            <span className="ml-2 text-sm tabular-nums text-muted-foreground">
              {count} bottle{count === 1 ? "" : "s"}
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}
