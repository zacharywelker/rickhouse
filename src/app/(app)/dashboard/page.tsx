import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Acquisitions, CategoryShare, ProofDistribution, TopDistilleries } from "@/components/dashboard/charts";
import {
  acquisitionsOverTime,
  categoryShare,
  headline,
  proofDistribution,
  topDistilleries,
  topFinish,
  topMashbill,
} from "@/lib/dashboard/queries";
import { formatMoney, formatNumeric } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, categories, proof, acquisitions, distilleries, mashbill, finish] = await Promise.all([
    headline(),
    categoryShare(),
    proofDistribution(),
    acquisitionsOverTime(),
    topDistilleries(),
    topMashbill(),
    topFinish(),
  ]);

  const spend = Number(stats.spend);
  const msrp = Number(stats.msrp);
  // Only over bottles where a price was recorded, so gifts do not read as savings.
  const delta = msrp > 0 ? spend - msrp : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl text-rye-gold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What the collection actually looks like, rather than what you remember buying.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bottles" value={String(stats.bottles)} hint={`${stats.expressions} expressions`} />
        <Stat
          label="Open"
          value={String(stats.open)}
          hint={stats.killed > 0 ? `${stats.killed} killed` : undefined}
        />
        <Stat
          label="Total spend"
          value={formatMoney(stats.spend)}
          hint={
            delta === null
              ? undefined
              : delta === 0
                ? "Exactly MSRP"
                : delta > 0
                  ? `${formatMoney(String(delta))} over MSRP`
                  : `${formatMoney(String(Math.abs(delta)))} under MSRP`
          }
        />
        <Stat
          label="Average proof"
          value={formatNumeric(stats.avgProof)}
          hint={stats.avgRating ? `${Number(stats.avgRating)}/10 average rating` : undefined}
        />
      </section>

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
              label="Most represented distillery"
              value={distilleries[0]?.label ?? null}
              count={distilleries[0]?.count}
              href={distilleries[0]?.slug ? (`/distilleries/${distilleries[0].slug}` as Route) : null}
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-display text-3xl tabular-nums">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
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
        <p className="font-display text-xl text-muted-foreground">Nothing yet</p>
      ) : (
        <p className="font-display text-xl">
          {href ? (
            <Link href={href} className="hover:text-rye-gold">
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
