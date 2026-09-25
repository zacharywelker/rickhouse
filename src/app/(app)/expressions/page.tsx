import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { ArrowDown, ArrowUp, ChevronsUpDown, Plus, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LabelTableBody } from "@/components/expressions/label-table-body";
import { LabelFilterBar } from "@/components/expressions/label-filter-bar";
import { LabelPagination } from "@/components/expressions/label-pagination";
import { queryExpressions, type LabelSort } from "@/lib/expressions/queries";
import {
  activeLabelFilterCount,
  parseLabelFilters,
  serialiseLabelFilters,
  type LabelFilters,
} from "@/lib/expressions/filters";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Labels" };
export const dynamic = "force-dynamic";

const COLUMNS: Array<{ key: LabelSort; label: string; className?: string; numeric?: boolean }> = [
  { key: "brand", label: "Brand", className: "hidden sm:table-cell" },
  { key: "name", label: "Label" },
  { key: "category", label: "Category", className: "hidden sm:table-cell" },
  { key: "proof", label: "Proof", numeric: true },
  { key: "msrp", label: "MSRP", className: "hidden sm:table-cell", numeric: true },
  { key: "bottles", label: "Bottles", numeric: true },
];

/**
 * Sorting is server-side and lives in the URL, exactly like the bottle grid —
 * so a sorted, filtered, paged view is a bookmark and the back button
 * behaves (SPEC M8).
 */
function SortLink({
  column,
  filters,
}: {
  column: (typeof COLUMNS)[number];
  filters: LabelFilters;
}) {
  const active = filters.sort === column.key;
  const desc = filters.desc;
  // Clicking the active column flips it; a new column starts ascending. Any
  // active search or filter carries over — sorting shouldn't reset them.
  const query = serialiseLabelFilters({
    ...filters,
    sort: column.key,
    desc: active ? !desc : false,
    page: 1,
  });
  return (
    <Link
      href={`/expressions?${query}` as Route}
      aria-label={`Sort by ${column.label}`}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground",
        active && "text-primary",
      )}
    >
      {column.label}
      {active ? (
        desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />
      ) : (
        <ChevronsUpDown className="size-3 opacity-40" />
      )}
    </Link>
  );
}

export default async function ExpressionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseLabelFilters(await searchParams);
  const [{ rows, total, pageCount, page }, brands, categories] = await Promise.all([
    queryExpressions(filters),
    REFERENCE_OPTION_LOADERS.brands(),
    REFERENCE_OPTION_LOADERS.categories(),
  ]);
  const filtered = activeLabelFilterCount(filters) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl text-accent">Labels</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The products, separate from the bottles on your shelf. Batch and single-barrel detail belong to the
            bottle, so six picks of one Weller 12 are six bottles of one label.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/expressions/bulk">
              <Rows3 className="size-4" />
              Bulk add
            </Link>
          </Button>
          <Button asChild>
            <Link href="/expressions/new">
              <Plus className="size-4" />
              New Label
            </Link>
          </Button>
        </div>
      </div>

      <LabelFilterBar filters={filters} brands={brands} categories={categories} total={total} />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-lg">{filtered ? "Nothing matches those filters" : "No labels yet"}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {filtered
              ? "Loosen a filter, or clear them all and start again."
              : "Start with the product — brand, mashbill, proof — then add the bottle you actually own."}
          </p>
          {!filtered ? (
            <Button className="mt-4" asChild>
              <Link href="/expressions/new">
                <Plus className="size-4" />
                New Label
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {COLUMNS.map((column) => (
                    <TableHead
                      key={column.key}
                      className={cn(column.className, column.numeric && "text-right")}
                    >
                      <SortLink column={column} filters={filters} />
                    </TableHead>
                  ))}
                  <TableHead className="w-12 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <LabelTableBody rows={rows} />
            </Table>
          </div>
          <LabelPagination filters={filters} page={page} pageCount={pageCount} total={total} />
        </>
      )}
    </div>
  );
}
