import type { Metadata } from "next";
import { ExpressionBulkGrid } from "@/components/expressions/expression-bulk-grid";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";

export const metadata: Metadata = { title: "Bulk add labels" };
export const dynamic = "force-dynamic";

export default async function BulkExpressionsPage() {
  const [brands, categories] = await Promise.all([
    REFERENCE_OPTION_LOADERS.brands(),
    REFERENCE_OPTION_LOADERS.categories(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Bulk add labels</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add several labels at once — brand, category and the core commercial details. Tab moves across a row,
          Enter moves down a column. Rum, agave and process detail still need the single-label form. Rows save
          independently — fixing one bad row never loses the others.
        </p>
      </div>

      <ExpressionBulkGrid brands={brands} categories={categories} />
    </div>
  );
}
