import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExpressionForm } from "@/components/expressions/expression-form";
import { ColaApprovals } from "@/components/expressions/cola-approvals";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { expressionFormData } from "@/lib/expressions/form-data";
import { getExpression } from "@/lib/expressions/queries";
import { requireSession } from "@/lib/auth";
import { colaLookupEnabled, colasForExpression } from "@/lib/cola/store";

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
      <Section>
        <SectionHeader>
          <SectionTitle>Label approvals</SectionTitle>
          <SectionDescription>
            TTB&rsquo;s certificates of label approval (COLAs) for this label: one per proof, size or relabel. Saved
            as you add them, apart from the form above.
          </SectionDescription>
        </SectionHeader>
        <SectionContent>
          <ColaApprovals mode="label" expressionId={expressionId} colas={colas} lookupEnabled={colaLookupEnabled()} />
        </SectionContent>
      </Section>
    </div>
  );
}
