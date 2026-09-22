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
        <h1 className="font-display text-3xl text-accent">New Label</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A label is the product — the mashbill, proof and distillery. The bottle on your shelf comes next, and
          buying a second one just adds another bottle to this same label.
        </p>
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
