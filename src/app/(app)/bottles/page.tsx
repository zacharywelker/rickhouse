import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BottleGallery } from "@/components/bottles/bottle-gallery";
import { BottleTable, COLUMN_LABELS } from "@/components/bottles/bottle-table";
import { FilterBar } from "@/components/bottles/filter-bar";
import { GridPagination } from "@/components/bottles/grid-pagination";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import { activeFilterCount, parseFilters } from "@/lib/bottles/filters";
import { queryBottles, summariseBottles } from "@/lib/bottles/grid";
import { formatMoney, formatNumeric } from "@/lib/utils";

export const metadata: Metadata = { title: "Collection" };
export const dynamic = "force-dynamic";

export default async function BottlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);

  const [{ rows, total, pageCount, page }, summary, categories, brands, distilleries, mashbills, finishes, stores, tags] =
    await Promise.all([
      queryBottles(filters),
      summariseBottles(filters),
      REFERENCE_OPTION_LOADERS.categories(),
      REFERENCE_OPTION_LOADERS.brands(),
      REFERENCE_OPTION_LOADERS.distilleries(),
      REFERENCE_OPTION_LOADERS.mashbills(),
      REFERENCE_OPTION_LOADERS.finishes(),
      REFERENCE_OPTION_LOADERS.stores(),
      REFERENCE_OPTION_LOADERS.tags(),
    ]);

  const filtered = activeFilterCount(filters) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl text-accent">Collection</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every physical bottle you own. Filtering by a distillery finds the blends it contributed to, not just the
            bottles it made alone.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <a href="/api/bottles/export" download>
              <Download className="size-4" />
              Export
            </a>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/bottles/import">
              <Upload className="size-4" />
              Import
            </Link>
          </Button>
          <Button asChild>
            <Link href="/bottles/new">
              <Plus className="size-4" />
              Add bottle
            </Link>
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={filtered ? "Matching" : "Bottles"} value={String(total)} />
        <Stat label="Open" value={String(summary.open)} />
        <Stat label={filtered ? "Spend, filtered" : "Total spend"} value={formatMoney(summary.spend)} />
        <Stat label="Average proof" value={formatNumeric(summary.avgProof)} />
      </section>

      <FilterBar filters={filters} options={{ categories, brands, distilleries, mashbills, finishes, stores, tags }} columns={COLUMN_LABELS} total={total} />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-lg">{filtered ? "Nothing matches those filters" : "Nothing on the shelf"}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {filtered
              ? "Loosen a filter, or clear them all and start again."
              : "Add the label first, then the bottle you actually own."}
          </p>
          {!filtered ? (
            <Button className="mt-4" asChild>
              <Link href="/bottles/new">
                <Plus className="size-4" />
                Add bottle
              </Link>
            </Button>
          ) : null}
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
