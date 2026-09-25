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
    <div className="flex flex-col gap-4">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Bulk add labels</h1>
      </div>

      <ExpressionBulkGrid brands={brands} categories={categories} />
    </div>
  );
}
