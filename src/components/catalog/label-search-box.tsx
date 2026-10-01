"use client";

import * as React from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn, formatNumeric } from "@/lib/utils";
import type { CatalogHit, CatalogSearch } from "@/app/(app)/bottles/add/actions";

/** One row in the results, or the "new label" row at the end. */
type Row = { kind: "hit"; hit: CatalogHit } | { kind: "new" };

/** Results grouped under the heading that says why they matched. */
type Group = { heading: string; hits: Array<{ hit: CatalogHit; index: number }> };

function groupsOf(search: CatalogSearch, query: string): Group[] {
  const groups: Group[] = [];
  let index = 0;
  const push = (heading: string, hit: CatalogHit) => {
    const entry = { hit, index: index++ };
    const last = groups.at(-1);
    if (last && last.heading === heading) last.hits.push(entry);
    else groups.push({ heading, hits: [entry] });
  };
  for (const hit of search.hits) {
    if (hit.exact) push(search.code?.kind === "ttb" ? "Has that TTB approval" : "Has that barcode", hit);
    else if (query.trim() === "") push("Newest labels", hit);
    else if (hit.group === "distillery") push(`Distilled at ${hit.via ?? "a matching distillery"}`, hit);
    else push("Your labels", hit);
  }
  return groups;
}

function bottlesLine(count: number): string {
  if (count === 0) return "None on the shelf";
  return count === 1 ? "1 bottle" : `${count} bottles`;
}

/**
 * The first half of the search-first Add bottle page: one box for whatever is
 * on the bottle in your hand (brand, name, distillery, barcode or TTB ID),
 * category chips counted from the matches, and a way to start a new label
 * from what was typed. A combobox, so the keyboard alone gets through it:
 * arrows move, Enter picks, and Enter with nothing found starts a new label.
 */
export function LabelSearchBox({
  query,
  onQueryChange,
  categoryId,
  onCategoryChange,
  search,
  searching,
  newLabelText,
  onPick,
  onNew,
  inputRef,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  categoryId: number | null;
  onCategoryChange: (categoryId: number | null) => void;
  search: CatalogSearch | null;
  searching: boolean;
  /** What the "new label" row says it will start with. */
  newLabelText: string;
  onPick: (hit: CatalogHit) => void;
  onNew: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const listId = React.useId();
  const groups = React.useMemo(() => (search ? groupsOf(search, query) : []), [search, query]);
  const rows: Row[] = React.useMemo(
    () => [...groups.flatMap((group) => group.hits.map(({ hit }): Row => ({ kind: "hit", hit }))), { kind: "new" }],
    [groups],
  );
  // The highlighted row belongs to one set of results; new results start at the top.
  const [highlight, setHighlight] = React.useState<{ search: CatalogSearch | null; index: number }>({ search, index: 0 });
  const active = highlight.search === search ? Math.min(highlight.index, rows.length - 1) : 0;
  const setActive = (next: (index: number) => number) => setHighlight({ search, index: next(active) });

  const optionId = (index: number) => `${listId}-option-${index}`;
  const choose = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === "hit") onPick(row.hit);
    else onNew();
  };

  // Enter before the results for what was typed have arrived waits for them,
  // then takes the top one. A barcode scanner types the code and presses
  // Enter at once; picking from the previous results (or "New label") then
  // would start a duplicate of a label that is already on file.
  const enterPending = React.useRef(false);
  React.useEffect(() => {
    if (searching || !enterPending.current) return;
    enterPending.current = false;
    choose(rows[0]);
    // choose reads only props; rows and searching are what decide this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, rows]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      // Never submit the page's form from here: Enter picks.
      event.preventDefault();
      if (searching) enterPending.current = true;
      else choose(rows[active]);
    }
  };

  React.useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // optionId is stable for a given listId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const facets = search?.facets ?? [];
  const facetTotal = facets.reduce((sum, facet) => sum + facet.count, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Find the label"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={optionId(active)}
          autoComplete="off"
          autoFocus
          value={query}
          onChange={(event) => {
            enterPending.current = false;
            onQueryChange(event.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder="Brand, label, distillery, barcode or TTB ID"
          className="h-12 pl-9 text-base"
        />
        {searching ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {facets.length > 1 || categoryId !== null ? (
        <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
          {[{ id: null as number | null, name: "All", count: facetTotal }, ...facets].map((facet) => {
            const pressed = categoryId === facet.id;
            return (
              <button
                key={facet.id ?? "all"}
                type="button"
                aria-pressed={pressed}
                onClick={() => onCategoryChange(pressed ? null : facet.id)}
                className={cn(
                  "border px-2.5 py-1 text-sm transition-colors",
                  pressed
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                )}
              >
                {facet.name} <span className="tabular-nums opacity-70">{facet.count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div id={listId} role="listbox" aria-label="Labels" className="max-h-[26rem] overflow-y-auto border-y border-border">
        {groups.map((group) => (
          <div key={group.heading} role="group" aria-label={group.heading}>
            <p className="sticky top-0 z-10 bg-background pb-1 pt-3 text-xs uppercase tracking-wide text-muted-foreground">
              {group.heading}
            </p>
            {group.hits.map(({ hit, index: i }) => {
              return (
                <div
                  key={hit.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={active === i}
                  onMouseEnter={() => setActive(() => i)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose({ kind: "hit", hit })}
                  className={cn(
                    "flex cursor-pointer flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-border px-2 py-2.5 first-of-type:border-t-0",
                    active === i && "bg-muted",
                  )}
                >
                  <span className="font-medium">
                    {hit.brand} <span className="text-accent">{hit.name}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {[hit.category, hit.proof ? `${formatNumeric(hit.proof)} proof` : null, bottlesLine(hit.bottles)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {hit.group === "distillery" && hit.distilleries.length > 0 ? (
                    <span className="w-full text-xs text-muted-foreground">{hit.distilleries.join(", ")}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}

        {search && search.hits.length === 0 && query.trim() !== "" ? (
          <p className="pb-1 pt-3 text-sm text-muted-foreground">
            {search.code
              ? `No label of yours has ${search.code.kind === "ttb" ? "that TTB ID" : "that barcode"} yet.`
              : categoryId !== null
                ? "Nothing in that category matches. Try All."
                : "No label of yours matches."}
          </p>
        ) : null}

        <div
          id={optionId(rows.length - 1)}
          role="option"
          aria-selected={active === rows.length - 1}
          onMouseEnter={() => setActive(() => rows.length - 1)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onNew}
          className={cn(
            "mt-1 flex cursor-pointer items-center gap-2 border-t border-foreground px-2 py-2.5 text-primary",
            active === rows.length - 1 && "bg-muted",
          )}
        >
          <Plus className="size-4 shrink-0" />
          <span>{newLabelText}</span>
        </div>
      </div>
    </div>
  );
}
