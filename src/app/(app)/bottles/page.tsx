import type { Metadata } from "next";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { StatStrip } from "@/components/ui/stat-strip";
import { BottleGallery } from "@/components/bottles/bottle-gallery";
import { BottleTable, COLUMN_LABELS } from "@/components/bottles/bottle-table";
import { FilterBar } from "@/components/bottles/filter-bar";
import { GridPagination } from "@/components/bottles/grid-pagination";
import { SpinTheBottle } from "@/components/bottles/spin-the-bottle";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import { requireSession } from "@/lib/auth";
import { activeFilterCount, parseFilters } from "@/lib/bottles/filters";
import { queryBottles, summariseBottles } from "@/lib/bottles/grid";
import { cn, formatMoney, formatNumeric } from "@/lib/utils";

/** Workbench jobs: inline on desktop, folded into "More" on a phone. */
const WORKBENCH_LINKS = [
  { href: "/api/bottles/export", label: "Export", download: true },
  { href: "/bottles/import", label: "Import", download: false },
  { href: "/bottles/bulk", label: "Bulk add", download: false },
] as const;

export const metadata: Metadata = { title: "Collection" };
export const dynamic = "force-dynamic";

export default async function BottlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, filters] = await Promise.all([requireSession(), searchParams.then(parseFilters)]);

  const [{ rows, total, pageCount, page }, summary, categories, brands, distilleries, mashbills, finishes, stores, tags] =
    await Promise.all([
      queryBottles(filters, user.id),
      summariseBottles(filters, user.id),
      REFERENCE_OPTION_LOADERS.categories(user.id),
      REFERENCE_OPTION_LOADERS.brands(user.id),
      REFERENCE_OPTION_LOADERS.distilleries(user.id),
      REFERENCE_OPTION_LOADERS.mashbills(user.id),
      REFERENCE_OPTION_LOADERS.finishes(user.id),
      REFERENCE_OPTION_LOADERS.stores(user.id),
      REFERENCE_OPTION_LOADERS.tags(user.id),
    ]);

  const filtered = activeFilterCount(filters) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl text-accent">Collection</h1>
        </div>
        {/*
         * Phones are the field companion (DESIGN.md §29): adding a bottle and
         * picking tonight's pour stay in reach, while export, import and bulk
         * add — workbench jobs — fold into "More" so the bottles themselves
         * start above the fold.
         */}
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="order-first md:order-last">
            <Link href="/bottles/new">Add bottle</Link>
          </Button>
          <SpinTheBottle categories={categories} finishes={finishes} />
          <div className="hidden items-center gap-2 md:flex">
            {WORKBENCH_LINKS.map((item) => (
              <Button key={item.href} variant="outline" asChild>
                {item.download ? (
                  <a href={item.href} download>
                    {item.label}
                  </a>
                ) : (
                  <Link href={item.href}>{item.label}</Link>
                )}
              </Button>
            ))}
          </div>
          <details className="relative md:hidden">
            <summary className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
              More
            </summary>
            <div className="absolute right-0 z-20 mt-1 flex w-44 flex-col border border-border bg-card py-1 shadow-md">
              {WORKBENCH_LINKS.map((item) =>
                item.download ? (
                  <a key={item.href} href={item.href} download className="px-3 py-2.5 text-sm hover:bg-muted">
                    {item.label}
                  </a>
                ) : (
                  <Link key={item.href} href={item.href} className="px-3 py-2.5 text-sm hover:bg-muted">
                    {item.label}
                  </Link>
                ),
              )}
            </div>
          </details>
        </div>
      </div>

      {/* The full ruled strip from sm: up; on a phone the same numbers as one line. */}
      <div className="hidden sm:block">
        <StatStrip
          items={[
            { label: filtered ? "Matching" : "Bottles", value: total },
            { label: "Open", value: summary.open },
            { label: filtered ? "Spend, filtered" : "Total spend", value: formatMoney(summary.spend) },
            { label: "Average proof", value: formatNumeric(summary.avgProof) },
          ]}
        />
      </div>
      <p className="-mt-2 border-t-2 border-foreground pt-2 text-sm text-muted-foreground sm:hidden">
        {summary.open} open · {formatMoney(summary.spend)} {filtered ? "spent, filtered" : "spent"} ·{" "}
        {formatNumeric(summary.avgProof)} average proof
      </p>

      <FilterBar filters={filters} options={{ categories, brands, distilleries, mashbills, finishes, stores, tags }} columns={COLUMN_LABELS} total={total} />

      {rows.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <p className="text-lg">{filtered ? "Nothing matches those filters" : "Nothing on the shelf"}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {filtered
              ? "Loosen a filter, or clear them all and start again."
              : "Add the label first, then the bottle you actually own."}
          </p>
          {!filtered ? (
            <Button className="mt-4" asChild>
              <Link href="/bottles/new">
                Add bottle
              </Link>
            </Button>
          ) : null}
        </div>
      ) : filters.view === "gallery" ? (
        <BottleGallery rows={rows} />
      ) : (
        <BottleTable rows={rows} filters={filters} stores={stores} />
      )}

      {rows.length > 0 ? (
        <GridPagination filters={filters} page={page} pageCount={pageCount} total={total} />
      ) : null}
    </div>
  );
}
