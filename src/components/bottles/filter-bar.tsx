"use client";

import * as React from "react";
import { Check, Filter, LayoutGrid, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BOTTLE_STATUSES } from "@/db/schema";
import { DEFAULT_FILTERS, activeFilterCount, type BottleFilters, type Range } from "@/lib/bottles/filters";
import type { Option } from "@/lib/admin/types";
import { useGridFilters } from "./use-grid-filters";

export type FilterOptions = {
  categories: Option[];
  brands: Option[];
  distilleries: Option[];
  mashbills: Option[];
  finishes: Option[];
  stores: Option[];
  tags: Option[];
};

type IdKey = "categoryIds" | "brandIds" | "distilleryIds" | "mashbillIds" | "finishIds" | "storeIds" | "tagIds";

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
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-muted"
                  >
                    <Check className={cn("size-4 shrink-0", active ? "opacity-100 text-primary" : "opacity-0")} />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="shrink-0 truncate text-xs text-muted-foreground">{option.hint}</span>
                    ) : null}
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

function RangeFilter({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix?: string;
  value: Range;
  onChange: (next: Range) => void;
}) {
  const active = value.min !== null || value.max !== null;
  const id = React.useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Filter by ${label.toLowerCase()}`}
          className={cn(active && "border-primary/50 text-primary")}
        >
          {label}
          {active ? (
            <Badge className="ml-1 border-primary/40 text-primary">
              {value.min ?? "…"}–{value.max ?? "…"}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor={`${id}-min`} className="text-xs">
              Min
            </Label>
            <Input
              id={`${id}-min`}
              type="number"
              value={value.min ?? ""}
              onChange={(e) => onChange({ ...value, min: e.target.value === "" ? null : Number(e.target.value) })}
              className="h-9"
            />
          </div>
          <span className="pb-2 text-muted-foreground">–</span>
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor={`${id}-max`} className="text-xs">
              Max{suffix ? ` (${suffix})` : ""}
            </Label>
            <Input
              id={`${id}-max`}
              type="number"
              value={value.max ?? ""}
              onChange={(e) => onChange({ ...value, max: e.target.value === "" ? null : Number(e.target.value) })}
              className="h-9"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar({
  filters,
  options,
  columns,
  total,
}: {
  filters: BottleFilters;
  options: FilterOptions;
  columns: Array<{ id: string; label: string }>;
  total: number;
}) {
  const { apply, toggleId } = useGridFilters(filters);
  const [search, setSearch] = React.useState(filters.q ?? "");
  const active = activeFilterCount(filters);

  React.useEffect(() => setSearch(filters.q ?? ""), [filters.q]);

  const entities: Array<{ key: IdKey; label: string; options: Option[] }> = [
    { key: "categoryIds", label: "Category", options: options.categories },
    { key: "brandIds", label: "Brand", options: options.brands },
    { key: "distilleryIds", label: "Distillery", options: options.distilleries },
    { key: "mashbillIds", label: "Mashbill", options: options.mashbills },
    { key: "finishIds", label: "Finish", options: options.finishes },
    { key: "storeIds", label: "Store", options: options.stores },
    { key: "tagIds", label: "Tag", options: options.tags },
  ];

  return (
    <div className="flex flex-col gap-3">
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brand, expression, distillery…"
              aria-label="Search bottles"
              className="h-9 pl-9"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>

        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <Button
            type="button"
            variant={filters.view === "table" ? "default" : "ghost"}
            size="sm"
            onClick={() => apply({ view: "table" })}
            aria-pressed={filters.view === "table"}
          >
            <Rows3 className="size-4" />
            <span className="sr-only sm:not-sr-only">Table</span>
          </Button>
          <Button
            type="button"
            variant={filters.view === "gallery" ? "default" : "ghost"}
            size="sm"
            onClick={() => apply({ view: "gallery" })}
            aria-pressed={filters.view === "gallery"}
          >
            <LayoutGrid className="size-4" />
            <span className="sr-only sm:not-sr-only">Gallery</span>
          </Button>
        </div>

        {filters.view === "table" ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal className="size-4" />
                Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2">
              <ul className="flex flex-col">
                {columns.map((column) => {
                  const hidden = filters.hidden.includes(column.id);
                  return (
                    <li key={column.id} className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-muted">
                      <Checkbox
                        id={`col-${column.id}`}
                        checked={!hidden}
                        onCheckedChange={() =>
                          apply({
                            hidden: hidden
                              ? filters.hidden.filter((id) => id !== column.id)
                              : [...filters.hidden, column.id],
                          })
                        }
                      />
                      <Label htmlFor={`col-${column.id}`} className="flex-1 cursor-pointer text-foreground">
                        {column.label}
                      </Label>
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="size-3.5" />
          Filter
        </span>

        {entities.map((entity) => (
          <EntityFilter
            key={entity.key}
            label={entity.label}
            options={entity.options}
            selected={filters[entity.key]}
            onToggle={(id) => toggleId(entity.key, id)}
          />
        ))}

        <RangeFilter label="Proof" value={filters.proof} onChange={(proof) => apply({ proof })} />
        <RangeFilter label="Age" suffix="yr" value={filters.age} onChange={(age) => apply({ age })} />
        <RangeFilter label="Price" suffix="$" value={filters.price} onChange={(price) => apply({ price })} />

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label="Filter by status"
              className={cn(filters.statuses.length > 0 && "border-primary/50 text-primary")}
            >
              Status
              {filters.statuses.length > 0 ? (
                <Badge className="ml-1 border-primary/40 text-primary">{filters.statuses.length}</Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-2">
            <ul className="flex flex-col">
              {BOTTLE_STATUSES.map((status) => {
                const on = filters.statuses.includes(status);
                return (
                  <li key={status} className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-muted">
                    <Checkbox
                      id={`status-${status}`}
                      checked={on}
                      onCheckedChange={() =>
                        apply({
                          statuses: on
                            ? filters.statuses.filter((s) => s !== status)
                            : [...filters.statuses, status],
                        })
                      }
                    />
                    <Label htmlFor={`status-${status}`} className="flex-1 cursor-pointer capitalize text-foreground">
                      {status}
                    </Label>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={filters.open === "open"}
          onClick={() => apply({ open: filters.open === "open" ? "any" : "open" })}
          className={cn(filters.open === "open" && "border-primary/50 text-primary")}
        >
          Open only
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={filters.favorite}
          onClick={() => apply({ favorite: !filters.favorite })}
          className={cn(filters.favorite && "border-primary/50 text-primary")}
        >
          Favourites
        </Button>

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
                view: filters.view,
                hidden: filters.hidden,
                pageSize: filters.pageSize,
              })
            }
          >
            <X className="size-4" />
            Clear {active} filter{active === 1 ? "" : "s"}
          </Button>
        ) : null}

        <span className="ml-auto text-sm tabular-nums text-muted-foreground">
          {total} bottle{total === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
