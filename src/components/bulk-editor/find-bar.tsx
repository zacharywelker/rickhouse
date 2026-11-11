"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Check, Search, X } from "lucide-react";
import { SEARCH_INPUT_ID } from "@/components/keyboard-shortcuts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { filterCount, type Find, type Range } from "@/lib/bulk-editor/find";
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

/** A number typed into a box: blank is no limit. */
const asBound = (text: string): number | null => {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * One end of a range. It keeps what is typed ("1." on the way to "1.5"), and takes the value again only when that is
 * changed from outside, as Clear filters does.
 */
function BoundBox({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: number | null; onChange: (next: number | null) => void }) {
  const [text, setText] = React.useState(value === null ? "" : String(value));
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    if (asBound(text) !== value) setText(value === null ? "" : String(value));
  }
  return (
    <input
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(asBound(event.target.value));
      }}
      className="h-8 w-24 border border-border bg-card px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

/** Min and max, either of which may be left open. */
function RangeField({ label, hint, value, onChange }: { label: string; hint?: string; value: Range; onChange: (next: Range) => void }) {
  return (
    <fieldset className="flex items-center gap-2">
      <legend className="sr-only">{label}</legend>
      <span aria-hidden className="w-24 shrink-0 text-sm">
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <BoundBox label={`${label}, at least`} placeholder="Min" value={value.min} onChange={(min) => onChange({ ...value, min })} />
      <span aria-hidden className="text-muted-foreground">
        to
      </span>
      <BoundBox label={`${label}, at most`} placeholder="Max" value={value.max} onChange={(max) => onChange({ ...value, max })} />
    </fieldset>
  );
}

const hasBound = (range: Range) => range.min !== null || range.max !== null;

/**
 * Search, filters and sort for the sheet. They change what is shown and nothing else. The sort is a control here as well
 * as on the column headers, so it can be reached from the keyboard without a tab stop on every header.
 */
export function FindBar({ find, onFind, categories, brands, stores, more, bottlesShown, sortable, onClear }: {
  find: Find;
  onFind: (next: Find) => void;
  categories: Item<number>[];
  brands: Item<number>[];
  /** Store names: only offered while bottles are shown. */
  stores: Item<string>[] | null;
  /** The rest of the filters, in one panel: what the labels in the sheet are linked to. */
  more: { distilleries: Item<number>[]; mashbills: Item<number>[]; finishes: Item<number>[]; ingredients: Item<string>[] };
  /** Price paid is a bottle's: only offered while bottles are shown. */
  bottlesShown: boolean;
  sortable: Array<{ id: string; label: string }>;
  onClear: () => void;
}) {
  const active = filterCount(find);
  const moreActive =
    [find.distilleryIds, find.mashbillIds, find.finishIds, find.ingredients].filter((l) => l.length > 0).length + [find.proof, find.age, find.price, find.msrp].filter(hasBound).length;
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
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn(moreActive > 0 && "border-primary/50 text-primary")}>
            More filters
            {moreActive > 0 ? <Badge className="ml-1 border-primary/40 text-primary">{moreActive}</Badge> : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[26rem] max-w-[calc(100vw-2rem)] p-3">
          <div className="flex flex-wrap gap-2">
            <MultiPick label="Distillery" items={more.distilleries} selected={find.distilleryIds} onToggle={(id) => onFind({ ...find, distilleryIds: toggle(find.distilleryIds, id) })} />
            <MultiPick label="Mashbill" items={more.mashbills} selected={find.mashbillIds} onToggle={(id) => onFind({ ...find, mashbillIds: toggle(find.mashbillIds, id) })} />
            <MultiPick label="Finish" items={more.finishes} selected={find.finishIds} onToggle={(id) => onFind({ ...find, finishIds: toggle(find.finishIds, id) })} />
            <MultiPick label="Ingredient" items={more.ingredients} selected={find.ingredients} onToggle={(name) => onFind({ ...find, ingredients: toggle(find.ingredients, name) })} />
          </div>
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
            <RangeField label="Proof" value={find.proof} onChange={(proof) => onFind({ ...find, proof })} />
            <RangeField label="Age" hint="years" value={find.age} onChange={(age) => onFind({ ...find, age })} />
            {bottlesShown ? <RangeField label="Price paid" value={find.price} onChange={(price) => onFind({ ...find, price })} /> : null}
            <RangeField label="MSRP" value={find.msrp} onChange={(msrp) => onFind({ ...find, msrp })} />
          </div>
        </PopoverContent>
      </Popover>
      <div className="flex items-center gap-1">
        <select
          aria-label="Sort by"
          value={find.sort?.column ?? ""}
          // A different column starts ascending, as a click on its header does.
          onChange={(event) => onFind({ ...find, sort: event.target.value === "" ? null : { column: event.target.value, desc: find.sort?.column === event.target.value ? find.sort.desc : false } })}
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
