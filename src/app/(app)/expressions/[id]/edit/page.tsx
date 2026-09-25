import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExpressionForm } from "@/components/expressions/expression-form";
import { expressionFormData } from "@/lib/expressions/form-data";
import { getExpression } from "@/lib/expressions/queries";

export const metadata: Metadata = { title: "Edit Label" };
export const dynamic = "force-dynamic";

export default async function EditExpressionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const expressionId = Number(id);
  if (!Number.isInteger(expressionId)) notFound();

  const row = await getExpression(expressionId);
  if (!row) notFound();

  const { options, categoryGroups, links } = await expressionFormData(expressionId);

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
    </div>
  );
}
