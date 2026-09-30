import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExpressionForm } from "@/components/expressions/expression-form";
import { ColaApprovals } from "@/components/expressions/cola-approvals";
import { expressionFormData } from "@/lib/expressions/form-data";
import { getExpression } from "@/lib/expressions/queries";
import { requireSession } from "@/lib/auth";
import { colaLookupEnabled, colasForExpression, distilleriesByPermit } from "@/lib/cola/store";

export const metadata: Metadata = { title: "Edit Label" };
export const dynamic = "force-dynamic";

export default async function EditExpressionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession();
  const { id } = await params;
  const expressionId = Number(id);
  if (!Number.isInteger(expressionId)) notFound();

  const row = await getExpression(expressionId, user.id);
  if (!row) notFound();

  const [{ options, categoryGroups, links }, colas] = await Promise.all([
    expressionFormData(expressionId, user.id),
    colasForExpression(expressionId, user.id),
  ]);
  const distilleryMatches = await distilleriesByPermit(
    user.id,
    colas.map((cola) => cola.permitNumber),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">
          {row.brand.name} {row.expression.name}
        </h1>
      </div>
      <ExpressionForm
        expressionId={expressionId}
        initialValues={row.expression as unknown as Record<string, string | number | boolean | null>}
        initialLinks={links}
        options={options}
        categoryGroups={categoryGroups}
      />
      {/* Below the form: what TTB approved for this label, saved as it is added (SPEC M11). */}
      <ColaApprovals
        mode="label"
        className="mt-4 border-t border-foreground pt-3"
        expressionId={expressionId}
        brandName={row.brand.name}
        colas={colas}
        lookupEnabled={colaLookupEnabled()}
        distilleryMatches={distilleryMatches}
      />
    </div>
  );
}
