import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BottleForm } from "@/components/expressions/bottle-form";
import { db } from "@/db";
import { bottleTags } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import { categoryFieldGroups, categoryKindsById, expressionOptions, getBottle, labelDateChoices } from "@/lib/expressions/queries";
import { requireSession } from "@/lib/auth";
import { labelVersionChoices } from "@/lib/other-names-store";
import { releaseChoices } from "@/lib/releases-store";
import { bottleSuggestions } from "@/lib/bottles/suggestions-query";
import { getPreferences } from "@/lib/preferences";

export const metadata: Metadata = { title: "Add a bottle" };
export const dynamic = "force-dynamic";

export default async function NewBottlePage({
  searchParams,
}: {
  searchParams: Promise<{ expression?: string; duplicate?: string }>;
}) {
  const user = await requireSession();
  const [{ expression, duplicate }, preferences] = await Promise.all([searchParams, getPreferences(user.id)]);
  const duplicateId = duplicate && /^\d+$/.test(duplicate) ? Number(duplicate) : null;
  const source = duplicateId !== null ? await getBottle(duplicateId, user.id) : null;
  if (duplicate !== undefined && !source) notFound();
  // Switched on in Configuration: every "Add bottle" in the app leads to the
  // search-first page instead, with the label kept if one was chosen.
  if (preferences.searchFirstAdd && !source) {
    redirect(expression && /^\d+$/.test(expression) ? `/bottles/add?expression=${expression}` : "/bottles/add");
  }
  const [expressions, stores, categoryGroups, categoryKinds] = await Promise.all([
    expressionOptions(user.id),
    REFERENCE_OPTION_LOADERS.stores(user.id),
    categoryFieldGroups(),
    categoryKindsById(),
  ]);
  const suggestions = await bottleSuggestions(user.id, stores.map((store) => store.label));
  const [tagOptions, sourceTags] = source ? await Promise.all([
    REFERENCE_OPTION_LOADERS.tags(user.id),
    db.select({ tagId: bottleTags.tagId }).from(bottleTags).where(eq(bottleTags.bottleId, source.bottle.id)),
  ]) : [[], []];

  const preselected = expression && /^\d+$/.test(expression) ? Number(expression) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">{source ? "Duplicate bottle" : "Add a bottle"}</h1>
        {source ? <p className="mt-1 text-sm text-muted-foreground">Review this copy before saving. The original bottle and its tasting notes stay as they are.</p> : null}
      </div>

      {expressions.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <p className="text-lg">No labels yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            A bottle has to be a bottle <em>of</em> something. Create the product first.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/expressions/new">Create a label</Link>
          </Button>
        </div>
      ) : (
        <BottleForm
          bottleId={null}
          initialValues={source ? source.bottle as unknown as Record<string, string | number | boolean | null> : preselected === null ? null : { expressionId: preselected }}
          duplicateSourceId={source ? duplicateId : null}
          tagOptions={tagOptions}
          initialTagIds={sourceTags.map((row) => row.tagId)}
          options={{ expressionId: expressions, storeId: stores }}
          suggestions={suggestions}
          labelVersions={await labelVersionChoices(user.id)}
          releases={await releaseChoices(user.id)}
        labelDates={await labelDateChoices(user.id)}
          categoryGroups={categoryGroups}
          categoryKinds={categoryKinds}
        />
      )}
    </div>
  );
}
