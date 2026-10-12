"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LabelSearchBox } from "@/components/catalog/label-search-box";
import { ExpressionForm } from "@/components/expressions/expression-form";
import { guessNewLabel } from "@/lib/expressions/label-search";
import { searchCatalogLabelsAction, type CatalogHit, type CatalogSearch } from "@/app/(app)/bottles/add/actions";
import type { FieldGroup } from "@/db/schema";
import type { Option } from "@/lib/admin/types";

type Links = React.ComponentProps<typeof ExpressionForm>["initialLinks"];

/**
 * New Label, search first (#202): the label you mean may already be here.
 * A match opens its edit page; "New label" opens the form with what was typed.
 * One page in two states, so Back from the form is a click, not a navigation.
 */
export function NewLabelStart({
  options,
  categoryGroups,
  initialLinks,
  colaLookup,
}: {
  options: Record<string, Option[]>;
  categoryGroups: Record<number, FieldGroup>;
  initialLinks: Links;
  colaLookup: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<number | null>(null);
  const [answer, setAnswer] = React.useState<{ key: string; search: CatalogSearch } | null>(null);
  const [form, setForm] = React.useState<Record<string, string | number | boolean | null> | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const searchKey = `${categoryId ?? ""}|${query}`;
  const search = answer?.search ?? null;

  React.useEffect(() => {
    if (form) return;
    let superseded = false;
    const timer = window.setTimeout(async () => {
      const result = await searchCatalogLabelsAction(query, categoryId).catch(() => null);
      if (result && !superseded) setAnswer({ key: searchKey, search: result });
    }, 120);
    return () => {
      superseded = true;
      window.clearTimeout(timer);
    };
  }, [query, categoryId, searchKey, form]);

  const guess = React.useMemo(
    () =>
      guessNewLabel(
        query,
        (options.brandId ?? []).map((o) => ({ id: Number(o.value), name: o.label })),
        (options.categoryId ?? []).map((o) => ({ id: Number(o.value), name: o.label })),
      ),
    [query, options],
  );

  const code = search?.code && search.hits.length === 0 ? search.code : null;
  const newLabelText = code
    ? code.kind === "upc"
      ? `New label with barcode ${code.value}`
      : `New label with TTB ID ${code.value}`
    : query.trim() === ""
      ? "New label"
      : guess.brandName
        ? `New label: ${guess.brandName} · ${guess.name}`
        : `New label: ${query.trim()}`;

  const pick = (hit: CatalogHit) => router.push(`/expressions/${hit.id}/edit`);

  const startNew = () => {
    const values: Record<string, string | number | boolean | null> = {};
    if (code?.kind === "upc") values.upc = code.value;
    else if (query.trim() !== "") {
      if (guess.brandId !== null) values.brandId = guess.brandId;
      values.name = guess.name;
    }
    const category = categoryId ?? (code ? null : guess.categoryId);
    if (category !== null) values.categoryId = category;
    setForm(values);
  };

  if (form) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setForm(null)}>
            ← Back to the search
          </Button>
        </div>
        <ExpressionForm
          expressionId={null}
          initialValues={form}
          initialLinks={initialLinks}
          options={options}
          categoryGroups={categoryGroups}
          colaLookup={colaLookup}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <LabelSearchBox
        query={query}
        onQueryChange={setQuery}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        search={search}
        searching={answer?.key !== searchKey}
        newLabelText={newLabelText}
        onPick={pick}
        onNew={startNew}
        inputRef={searchRef}
      />
    </div>
  );
}
