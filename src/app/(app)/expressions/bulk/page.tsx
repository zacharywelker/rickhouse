import type { Metadata } from "next";
import { ExpressionBulkGrid } from "@/components/expressions/expression-bulk-grid";
import { expressionFormData } from "@/lib/expressions/form-data";

export const metadata: Metadata = { title: "Bulk add labels" };
export const dynamic = "force-dynamic";

export default async function BulkExpressionsPage() {
  // The same pickers and category rules as the single-label form.
  const { options, categoryGroups } = await expressionFormData(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Bulk add labels</h1>
      </div>

      <ExpressionBulkGrid options={options} categoryGroups={categoryGroups} />
    </div>
  );
}
