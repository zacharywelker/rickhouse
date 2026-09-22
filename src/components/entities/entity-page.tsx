import Link from "next/link";
import type { Route } from "next";
import { BottleGallery } from "@/components/bottles/bottle-gallery";
import { BottleTable } from "@/components/bottles/bottle-table";
import { GridPagination } from "@/components/bottles/grid-pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { parseFilters, type BottleFilters } from "@/lib/bottles/filters";
import { queryBottles, summariseBottles } from "@/lib/bottles/grid";
import { formatMoney, formatNumeric } from "@/lib/utils";

export type EntityMeta = { label: string; value: React.ReactNode };

/**
 * The shape every entity page shares: what this thing is, what it adds up to,
 * and every bottle connected to it.
 *
 * The bottle list is the same query the collection grid uses, given a preset
 * filter — so a distillery's page inherits sorting, paging and the gallery
 * toggle without reimplementing any of it, and "every blend it contributed to"
 * is true here for the same reason it is true there.
 */
export async function EntityPage({
  kind,
  name,
  badges,
  meta,
  notes,
  preset,
  searchParams,
  emptyMessage,
}: {
  kind: string;
  name: string;
  badges?: React.ReactNode;
  meta?: EntityMeta[];
  notes?: string | null;
  /** The filter that defines "connected to this thing". */
  preset: Partial<BottleFilters>;
  searchParams: Record<string, string | string[] | undefined>;
  emptyMessage: string;
}) {
  // The URL still drives sorting, paging and the view toggle; the preset is
  // merged over the top so it cannot be filtered away.
  const filters: BottleFilters = { ...parseFilters(searchParams), ...preset };

  const [{ rows, total, pageCount, page }, summary] = await Promise.all([
    queryBottles(filters),
    summariseBottles(filters),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">{kind}</p>
        <h1 className="text-3xl">
          <span className="text-accent">{name}</span>
        </h1>
        {badges ? <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div> : null}
      </div>

      {meta && meta.length > 0 ? (
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            {meta.map((item) => (
              <div key={item.label}>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</dt>
                <dd className="text-sm">{item.value}</dd>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {notes ? <p className="max-w-3xl text-sm text-muted-foreground">{notes}</p> : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Bottles" value={String(summary.count)} />
        <Stat label="Total spend" value={formatMoney(summary.spend)} />
        <Stat label="Average proof" value={formatNumeric(summary.avgProof)} />
        <Stat label="Average rating" value={summary.avgRating ? `${Number(summary.avgRating)}/10` : "—"} />
      </section>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-lg">Nothing here yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : filters.view === "gallery" ? (
        <BottleGallery rows={rows} />
      ) : (
        <BottleTable rows={rows} filters={filters} />
      )}

      {rows.length > 0 ? (
        <GridPagination filters={filters} page={page} pageCount={pageCount} total={total} />
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export function EntityChip({ href, children }: { href: Route; children: React.ReactNode }) {
  return (
    <Link href={href}>
      <Badge className="border-border bg-muted text-foreground transition-colors hover:border-primary/50 hover:text-primary">
        {children}
      </Badge>
    </Link>
  );
}
