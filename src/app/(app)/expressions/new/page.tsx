import type { Metadata } from "next";
import { ExpressionForm } from "@/components/expressions/expression-form";
import { expressionFormData } from "@/lib/expressions/form-data";

export const metadata: Metadata = { title: "New Label" };
export const dynamic = "force-dynamic";

export default async function NewExpressionPage() {
  const { options, categoryGroups, links } = await expressionFormData(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">New Label</h1>
      </div>
      <ExpressionForm
        expressionId={null}
        initialValues={null}
        initialLinks={links}
        options={options}
        categoryGroups={categoryGroups}
      />
    </div>
  );
}
