"use client";

import * as React from "react";
import { Check, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { activeLabelFilterCount, DEFAULT_FILTERS, type LabelFilters } from "@/lib/expressions/filters";
import type { Option } from "@/lib/admin/types";
import { SEARCH_INPUT_ID } from "@/components/keyboard-shortcuts";
import { useLabelFilters } from "./use-label-filters";

function EntityFilter({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Option[];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle === "" ? options : options.filter((o) => o.label.toLowerCase().includes(needle));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Filter by ${label.toLowerCase()}`}
          className={cn(selected.length > 0 && "border-primary/50 text-primary")}
        >
          {label}
          {selected.length > 0 ? <Badge className="ml-1 border-primary/40 text-primary">{selected.length}</Badge> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            aria-label={`Search ${label.toLowerCase()}`}
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul className="max-h-64 overflow-y-auto p-1">
          {shown.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches.</li>
          ) : (
            shown.map((option) => {
              const active = selected.includes(option.value);
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => onToggle(option.value)}
                    aria-pressed={active}
                    className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-muted"
                  >
                    <Check className={cn("size-4 shrink-0", active ? "opacity-100 text-primary" : "opacity-0")} />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
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

export function LabelFilterBar({
  filters,
  brands,
  categories,
  total,
}: {
  filters: LabelFilters;
  brands: Option[];
  categories: Option[];
  total: number;
}) {
  const { apply, toggleId } = useLabelFilters(filters);
  const [search, setSearch] = React.useState(filters.q ?? "");
  const active = activeLabelFilterCount(filters);

  // Back/forward or a cleared filter changes `q` under the box; follow it.
  const [prevQ, setPrevQ] = React.useState(filters.q);
  if (filters.q !== prevQ) {
    setPrevQ(filters.q);
    setSearch(filters.q ?? "");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: search.trim() === "" ? null : search.trim() });
        }}
        className="flex min-w-56 flex-1 items-center gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={SEARCH_INPUT_ID}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand or label…"
            aria-label="Search labels"
            className="h-9 pl-9"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
      </form>

      <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
        Filter
      </span>

      <EntityFilter label="Brand" options={brands} selected={filters.brandIds} onToggle={(id) => toggleId("brandIds", id)} />
      <EntityFilter
        label="Category"
        options={categories}
        selected={filters.categoryIds}
        onToggle={(id) => toggleId("categoryIds", id)}
      />

      {active > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            apply({
              ...DEFAULT_FILTERS,
              // Clearing filters is not the same as resetting the view.
              sort: filters.sort,
              desc: filters.desc,
              pageSize: filters.pageSize,
              columns: filters.columns,
            })
          }
        >
          <X className="size-4" />
          Clear {active} filter{active === 1 ? "" : "s"}
        </Button>
      ) : null}

      <span className="ml-auto text-sm tabular-nums text-muted-foreground">
        {total} label{total === 1 ? "" : "s"}
      </span>
    </div>
  );
}
