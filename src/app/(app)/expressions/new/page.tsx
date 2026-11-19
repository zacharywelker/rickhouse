import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExpressionForm } from "@/components/expressions/expression-form";
import { NewLabelStart } from "@/components/expressions/new-label-start";
import { duplicateLabelValues } from "@/lib/expressions/duplicate-label";
import { expressionFormData } from "@/lib/expressions/form-data";
import { getExpression } from "@/lib/expressions/queries";
import { requireSession } from "@/lib/auth";
import { colaLookupEnabled } from "@/lib/cola/store";

export const metadata: Metadata = { title: "New Label" };
export const dynamic = "force-dynamic";

export default async function NewExpressionPage({ searchParams }: { searchParams: Promise<{ duplicate?: string }> }) {
  const user = await requireSession();
  const { duplicate } = await searchParams;
  const sourceId = duplicate && /^\d+$/.test(duplicate) ? Number(duplicate) : null;
  const source = sourceId !== null ? await getExpression(sourceId, user.id) : null;
  if (duplicate !== undefined && !source) notFound();

  const { options, categoryGroups, categoryKinds, links } = await expressionFormData(source ? sourceId : null, user.id);

  // A copy of a label: the form straight away, filled in, with the name left for the person to give.
  if (source) {
    return (
      <div className="flex flex-col gap-6">
        <div className="max-w-2xl">
          <h1 className="text-3xl text-accent">Duplicate label</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review this copy before saving, and give it a name. Its bottles, photos and approvals are not copied.
          </p>
        </div>
        <ExpressionForm
          expressionId={null}
          initialValues={duplicateLabelValues(source.expression as unknown as Record<string, string | number | boolean | null>)}
          initialLinks={links}
          options={options}
          categoryGroups={categoryGroups}
          categoryKinds={categoryKinds}
          colaLookup={colaLookupEnabled()}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">New Label</h1>
      </div>
      <NewLabelStart
        initialLinks={links}
        options={options}
        categoryGroups={categoryGroups}
        categoryKinds={categoryKinds}
        colaLookup={colaLookupEnabled()}
      />
    </div>
  );
}
