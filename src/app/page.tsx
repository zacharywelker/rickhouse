import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottleList } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  await requireSession();

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
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 p-6">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="font-display text-3xl text-rye-gold">Rickhouse</h1>
          <p className="text-sm text-muted-foreground">Your shelf, catalogued.</p>
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Bottles" value={String(summary.bottles)} />
        <Stat label="Open" value={String(summary.open)} />
        <Stat label="Total spend" value={formatMoney(summary.spend)} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recently acquired</CardTitle>
          <CardDescription>
            Milestone 1 is the foundation: database, login and health check. The sortable grid, bottle pages and fill
            gauge arrive in later milestones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing on the shelf yet. Once the taxonomy admin lands you will be able to add your first bottle here.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {recent.map((bottle) => (
                <li key={bottle.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {bottle.brand} <span className="text-rye-gold">{bottle.name}</span>
                    </span>
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
        <Link href="/api/health" className="hover:text-rye-gold">
          Health check
        </Link>
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-display text-3xl text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
