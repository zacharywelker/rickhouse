import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottleList } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatStrip } from "@/components/ui/stat-strip";
import { formatMoney, formatNumeric } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Summary = { bottles: number; open: number; spend: string | null };

async function loadSummary(): Promise<Summary> {
  const [row] = await db
    .select({
      bottles: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${bottleList.isOpen})::int`,
      spend: sql<string | null>`coalesce(sum(${bottleList.pricePaid}), 0)::text`,
    })
    .from(bottleList);
  return row ?? { bottles: 0, open: 0, spend: "0" };
}

export default async function HomePage() {
  const [summary, recent] = await Promise.all([
    loadSummary(),
    db
      .select({
        id: bottleList.id,
        brand: bottleList.brand,
        name: bottleList.expressionName,
        category: bottleList.category,
        proof: bottleList.proof,
        distilleries: bottleList.distilleries,
        finishes: bottleList.finishes,
        pricePaid: bottleList.pricePaid,
        dateAcquired: bottleList.dateAcquired,
      })
      .from(bottleList)
      .orderBy(desc(bottleList.dateAcquired))
      .limit(10),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl text-accent">Rickhouse</h1>
        <p className="text-sm text-muted-foreground">Your shelf, catalogued.</p>
      </div>

      <StatStrip
        items={[
          { label: "Bottles", value: summary.bottles },
          { label: "Open", value: summary.open },
          { label: "Total spend", value: formatMoney(summary.spend) },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recently acquired</CardTitle>
          <CardDescription>
            Each bottle has its own page. The sortable, filterable grid and the fill gauge arrive in the next
            milestone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing on the shelf yet.{" "}
              <Link href="/expressions/new" className="text-primary hover:underline">
                Create a label
              </Link>{" "}
              for the product, then add the bottle you actually own.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {recent.map((bottle) => (
                <li key={bottle.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/bottles/${bottle.id}`} className="font-medium hover:underline">
                      {bottle.brand} <span className="text-accent">{bottle.name}</span>
                    </Link>
                    <span className="text-sm text-muted-foreground">
                      {formatNumeric(bottle.proof)} proof · {formatMoney(bottle.pricePaid)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {bottle.category}
                    {bottle.distilleries ? ` · ${bottle.distilleries}` : ""}
                    {bottle.finishes ? ` · finished in ${bottle.finishes}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <footer className="mt-auto text-xs text-muted-foreground">
        <Link href="/api/health" className="hover:text-accent">
          Health check
        </Link>
      </footer>
    </div>
  );
}
