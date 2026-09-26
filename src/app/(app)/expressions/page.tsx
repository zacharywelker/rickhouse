import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LabelTable } from "@/components/expressions/label-table";
import { LabelFilterBar } from "@/components/expressions/label-filter-bar";
import { LabelPagination } from "@/components/expressions/label-pagination";
import { queryExpressions } from "@/lib/expressions/queries";
import { activeLabelFilterCount, parseLabelFilters } from "@/lib/expressions/filters";
import { expressionFormData } from "@/lib/expressions/form-data";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Labels" };
export const dynamic = "force-dynamic";

export default async function ExpressionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession();
  const filters = parseLabelFilters(await searchParams);
  // The form's own pickers and category rules, for the unlocked grid.
  const [{ rows, total, pageCount, page }, { options, categoryGroups }] = await Promise.all([
    queryExpressions(filters, user.id),
    expressionFormData(null, user.id),
  ]);
  const filtered = activeLabelFilterCount(filters) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl text-accent">Labels</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/expressions/bulk">
              Bulk add
            </Link>
          </Button>
          <Button asChild>
            <Link href="/expressions/new">
              New Label
            </Link>
          </Button>
        </div>
      </div>

      <LabelFilterBar
        filters={filters}
        brands={options.brandId ?? []}
        categories={options.categoryId ?? []}
        total={total}
      />

      {rows.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <p className="text-lg">{filtered ? "Nothing matches those filters" : "No labels yet"}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {filtered
              ? "Loosen a filter, or clear them all and start again."
              : "Start with the product — brand, mashbill, proof — then add the bottle you actually own."}
          </p>
          {!filtered ? (
            <Button className="mt-4" asChild>
              <Link href="/expressions/new">
                New Label
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <LabelTable rows={rows} filters={filters} options={options} categoryGroups={categoryGroups} />
          <LabelPagination filters={filters} page={page} pageCount={pageCount} total={total} />
        </>
      )}
    </div>
  );
}
