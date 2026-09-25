import type { Metadata } from "next";
import { ExpressionBulkGrid } from "@/components/expressions/expression-bulk-grid";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Bulk add labels" };
export const dynamic = "force-dynamic";

export default async function BulkExpressionsPage() {
  const user = await requireSession();
  const [brands, categories] = await Promise.all([
    REFERENCE_OPTION_LOADERS.brands(user.id),
    REFERENCE_OPTION_LOADERS.categories(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Bulk add labels</h1>
      </div>

      <ExpressionBulkGrid brands={brands} categories={categories} />
    </div>
  );
}
