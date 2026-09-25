import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, Rows3, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatStrip } from "@/components/ui/stat-strip";
import { BottleGallery } from "@/components/bottles/bottle-gallery";
import { BottleTable, COLUMN_LABELS } from "@/components/bottles/bottle-table";
import { FilterBar } from "@/components/bottles/filter-bar";
import { GridPagination } from "@/components/bottles/grid-pagination";
import { SpinTheBottle } from "@/components/bottles/spin-the-bottle";
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SpinTheBottle categories={categories} finishes={finishes} />
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
          <Button variant="outline" asChild>
            <Link href="/bottles/bulk">
              <Rows3 className="size-4" />
              Bulk add
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

      <StatStrip
        items={[
          { label: filtered ? "Matching" : "Bottles", value: total },
          { label: "Open", value: summary.open },
          { label: filtered ? "Spend, filtered" : "Total spend", value: formatMoney(summary.spend) },
          { label: "Average proof", value: formatNumeric(summary.avgProof) },
        ]}
      />

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
                <Plus className="size-4" />
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
