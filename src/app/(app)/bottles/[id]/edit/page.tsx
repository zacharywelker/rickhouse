import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BottleForm } from "@/components/expressions/bottle-form";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import { categoryFieldGroups, categoryKindsById, expressionOptions, getBottle, labelDateChoices } from "@/lib/expressions/queries";
import { requireSession } from "@/lib/auth";
import { labelVersionChoices } from "@/lib/other-names-store";
import { releaseChoices } from "@/lib/releases-store";
import { bottleSuggestions } from "@/lib/bottles/suggestions-query";

export const metadata: Metadata = { title: "Edit bottle" };
export const dynamic = "force-dynamic";

export default async function EditBottlePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession();
  const { id } = await params;
  const bottleId = Number(id);
  if (!Number.isInteger(bottleId)) notFound();

  const row = await getBottle(bottleId, user.id);
  if (!row) notFound();

  const [expressions, stores, categoryGroups, categoryKinds] = await Promise.all([
    expressionOptions(user.id),
    REFERENCE_OPTION_LOADERS.stores(user.id),
    categoryFieldGroups(),
    categoryKindsById(),
  ]);
  const suggestions = await bottleSuggestions(user.id, stores.map((store) => store.label));

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Edit bottle</h1>
        <p className="mt-1 text-sm text-muted-foreground">{row.brand.name} · {row.expression.name}</p>
      </div>
      <details className="max-w-2xl border border-border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">
          Label details <span className="font-normal text-muted-foreground">({row.brand.name} · {row.expression.name})</span>
        </summary>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4 border-t border-border pt-3">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {row.expression.proof !== null ? <><dt className="text-muted-foreground">Proof</dt><dd>{row.expression.proof}</dd></> : null}
            {row.expression.ageStatement ? <><dt className="text-muted-foreground">Age</dt><dd>{row.expression.ageStatement}</dd></> : null}
            {row.expression.sizeMl !== null ? <><dt className="text-muted-foreground">Size</dt><dd>{row.expression.sizeMl} ml</dd></> : null}
            {row.expression.description ? <><dt className="text-muted-foreground">Label description</dt><dd className="whitespace-pre-wrap">{row.expression.description}</dd></> : null}
          </dl>
          <Link href={`/expressions/${row.expression.id}/edit`} className="text-sm text-primary underline underline-offset-2">
            Edit label details
          </Link>
        </div>
      </details>
      <BottleForm
        bottleId={bottleId}
        initialValues={row.bottle as unknown as Record<string, string | number | boolean | null>}
        options={{ expressionId: expressions, storeId: stores }}
        suggestions={suggestions}
        labelVersions={await labelVersionChoices(user.id)}
        releases={await releaseChoices(user.id)}
        labelDates={await labelDateChoices(user.id)}
        categoryGroups={categoryGroups}
        categoryKinds={categoryKinds}
        collapseLabelPicker
      />
    </div>
  );
}
