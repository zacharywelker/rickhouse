import type { Metadata } from "next";
import Link from "next/link";
import { CatalogBottle } from "@/components/catalog/catalog-bottle";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import { requireSession } from "@/lib/auth";
import { bottleSuggestions } from "@/lib/bottles/suggestions-query";
import { colaLookupEnabled } from "@/lib/cola/store";
import { loadCatalogLabel } from "@/lib/expressions/catalog";
import { expressionFormData } from "@/lib/expressions/form-data";
import { getPreferences } from "@/lib/preferences";

export const metadata: Metadata = { title: "Add a bottle" };
export const dynamic = "force-dynamic";

/**
 * The search-first Add bottle page. Reachable directly while it is being
 * tried out; "Add bottle" leads here only for accounts that switched it on
 * in Configuration (see /bottles/new).
 */
export default async function CatalogBottlePage({
  searchParams,
}: {
  searchParams: Promise<{ expression?: string }>;
}) {
  const user = await requireSession();
  const [{ expression }, { options, categoryGroups }, stores, preferences] = await Promise.all([
    searchParams,
    expressionFormData(null, user.id),
    REFERENCE_OPTION_LOADERS.stores(user.id),
    getPreferences(user.id),
  ]);
  const suggestions = await bottleSuggestions(user.id, stores.map((store) => store.label));
  // "Add a bottle of this" from a label's page arrives with the label chosen.
  const initialLabel = expression && /^\d+$/.test(expression) ? await loadCatalogLabel(Number(expression), user.id) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl text-accent">Add a bottle</h1>
        {!preferences.searchFirstAdd ? (
          <p className="text-sm text-muted-foreground">
            Trying this out.{" "}
            <Link href="/admin" className="text-primary underline underline-offset-2 hover:no-underline">
              Make it your Add bottle
            </Link>{" "}
            or{" "}
            <Link
              href={initialLabel ? `/bottles/new?expression=${initialLabel.id}` : "/bottles/new"}
              className="text-primary underline underline-offset-2 hover:no-underline"
            >
              use the usual form
            </Link>
            .
          </p>
        ) : null}
      </div>
      <CatalogBottle
        labelOptions={options}
        bottleOptions={{ storeId: stores }}
        categoryGroups={categoryGroups}
        colaLookup={colaLookupEnabled()}
        initialLabel={initialLabel}
        suggestions={suggestions}
      />
    </div>
  );
}
