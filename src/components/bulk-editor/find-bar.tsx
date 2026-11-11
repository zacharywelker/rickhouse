"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Check, Search, X } from "lucide-react";
import { SEARCH_INPUT_ID } from "@/components/keyboard-shortcuts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { filterCount, type Find } from "@/lib/bulk-editor/find";
import { cn } from "@/lib/utils";

type Item<K extends string | number> = { key: K; label: string };

/** A filter that picks any number of things from a list, with its own search box, as the collection tables have. */
function MultiPick<K extends string | number>({ label, items, selected, onToggle }: { label: string; items: Item<K>[]; selected: K[]; onToggle: (key: K) => void }) {
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle === "" ? items : items.filter((item) => item.label.toLowerCase().includes(needle));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Filter by ${label.toLowerCase()}`} className={cn(selected.length > 0 && "border-primary/50 text-primary")}>
          {label}
          {selected.length > 0 ? <Badge className="ml-1 border-primary/40 text-primary">{selected.length}</Badge> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            aria-label={`Search ${label.toLowerCase()}`}
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul className="max-h-64 overflow-y-auto p-1">
          {shown.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches.</li>
          ) : (
            shown.map((item) => {
              const on = selected.includes(item.key);
              return (
                <li key={item.key}>
                  <button type="button" onClick={() => onToggle(item.key)} aria-pressed={on} className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-muted">
                    <Check aria-hidden className={cn("size-4 shrink-0", on ? "text-primary opacity-100" : "opacity-0")} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

const toggle = <K,>(list: K[], key: K): K[] => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

/**
 * Search, filters and sort for the sheet. They change what is shown and nothing else. The sort is a control here as well
 * as on the column headers, so it can be reached from the keyboard without a tab stop on every header.
 */
export function FindBar({ find, onFind, categories, brands, stores, sortable, onClear }: {
  find: Find;
  onFind: (next: Find) => void;
  categories: Item<number>[];
  brands: Item<number>[];
  /** Store names: only offered while bottles are shown. */
  stores: Item<string>[] | null;
  sortable: Array<{ id: string; label: string }>;
  onClear: () => void;
}) {
  const active = filterCount(find);
  return (
    <>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={SEARCH_INPUT_ID}
          type="search"
          value={find.q}
          onChange={(event) => onFind({ ...find, q: event.target.value })}
          placeholder="Search the sheet"
          aria-label="Search the sheet"
          autoComplete="off"
          className="h-8 w-52 border border-border bg-card pl-8 pr-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <MultiPick label="Category" items={categories} selected={find.categoryIds} onToggle={(id) => onFind({ ...find, categoryIds: toggle(find.categoryIds, id) })} />
      <MultiPick label="Brand" items={brands} selected={find.brandIds} onToggle={(id) => onFind({ ...find, brandIds: toggle(find.brandIds, id) })} />
      {stores ? <MultiPick label="Store" items={stores} selected={find.stores} onToggle={(name) => onFind({ ...find, stores: toggle(find.stores, name) })} /> : null}
      <div className="flex items-center gap-1">
        <select
          aria-label="Sort by"
          value={find.sort?.column ?? ""}
          onChange={(event) => onFind({ ...find, sort: event.target.value === "" ? null : { column: event.target.value, desc: find.sort?.desc ?? false } })}
          className="h-8 border border-border bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Shelf order</option>
          {sortable.map((column) => (
            <option key={column.id} value={column.id}>
              Sort: {column.label}
            </option>
          ))}
        </select>
        {find.sort ? (
          <Button type="button" variant="outline" size="sm" aria-label={find.sort.desc ? "Descending: switch to ascending" : "Ascending: switch to descending"} onClick={() => onFind({ ...find, sort: { ...find.sort!, desc: !find.sort!.desc } })}>
            {find.sort.desc ? <ArrowDown aria-hidden className="size-4" /> : <ArrowUp aria-hidden className="size-4" />}
          </Button>
        ) : null}
      </div>
      {active > 0 ? (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <X aria-hidden className="size-4" />
          Clear filters
        </Button>
      ) : null}
    </>
  );
}
