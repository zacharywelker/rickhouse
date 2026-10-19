"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BOTTLE_STATUSES, type BottleStatus } from "@/db/schema";
import { searchFieldAction } from "@/app/(app)/tournaments/actions";
import type { Option } from "@/lib/admin/types";
import type { FieldCandidate } from "@/lib/tournaments/field";
import { DEFAULT_FIELD_FILTERS, type FieldFilters } from "@/lib/tournaments/field-filters";
import { chosenAmong, type PickedBottle, type PickedEntry } from "@/lib/tournaments/field-selection";
import { cn } from "@/lib/utils";
import { CategoryFilter } from "./category-filter";
import { FieldResults } from "./field-results";
import { Segmented } from "./segmented";

const OPENED = [
  { value: "any", label: "Any" },
  { value: "open", label: "Opened" },
  { value: "sealed", label: "Sealed" },
] as const;
const TASTED = [
  { value: "any", label: "Any" },
  { value: "tasted", label: "Tasted" },
  { value: "untasted", label: "Untasted" },
] as const;

const toPicked = (row: FieldCandidate): PickedBottle => ({ kind: "bottle", bottleId: row.bottleId, expressionId: row.expressionId, name: row.name });

type Result = { rows: FieldCandidate[]; total: number };

/**
 * Filters over your collection and the bottles they find. Typing waits 250 ms; every other filter searches at once.
 * Nothing is said about "no bottles" until the first search has come back (a spinner line stands in).
 */
export function FieldPicker({
  categories,
  entries,
  onToggle,
  onSelectAll,
  onClear,
}: {
  categories: Option[];
  entries: readonly PickedEntry[];
  onToggle: (bottle: PickedBottle) => void;
  onSelectAll: (bottles: PickedBottle[]) => void;
  onClear: () => void;
}) {
  const [filters, setFilters] = React.useState<FieldFilters>(DEFAULT_FIELD_FILTERS);
  const [appliedQ, setAppliedQ] = React.useState("");
  const [result, setResult] = React.useState<Result | null>(null);
  const [failed, setFailed] = React.useState(false);
  const latest = React.useRef(0);

  // The typed text settles for 250 ms before it searches.
  React.useEffect(() => {
    if (filters.q === appliedQ) return;
    const timer = setTimeout(() => setAppliedQ(filters.q), 250);
    return () => clearTimeout(timer);
  }, [filters.q, appliedQ]);

  const { categoryIds, statuses, opened, tasted } = filters;
  React.useEffect(() => {
    const request = ++latest.current;
    searchFieldAction({ q: appliedQ, categoryIds, statuses: statuses.length === 0 ? "all" : statuses, opened, tasted })
      .then((answer) => {
        if (request !== latest.current) return;
        setResult({ rows: answer.rows, total: answer.total });
        setFailed(false);
      })
      .catch(() => {
        if (request === latest.current) setFailed(true);
      });
  }, [appliedQ, categoryIds, statuses, opened, tasted]);

  const set = (patch: Partial<FieldFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleStatus = (status: BottleStatus) =>
    set({ statuses: statuses.includes(status) ? statuses.filter((s) => s !== status) : [...statuses, status] });
  const toggleCategory = (id: number) => set({ categoryIds: categoryIds.includes(id) ? categoryIds.filter((c) => c !== id) : [...categoryIds, id] });

  const chosen = React.useMemo(() => new Set(entries.flatMap((e) => (e.kind === "bottle" ? [e.bottleId] : []))), [entries]);
  const settled = result !== null && appliedQ === filters.q;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search your bottles"
          aria-label="Search your bottles"
          className="h-11 pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CategoryFilter options={categories} selected={categoryIds} onToggle={toggleCategory} />
        <Segmented label="Opened" options={OPENED} value={opened} onChange={(v) => set({ opened: v })} />
        <Segmented label="Tasted" options={TASTED} value={tasted} onChange={(v) => set({ tasted: v })} />
      </div>

      <div role="group" aria-label="Status" className="flex flex-wrap items-center gap-2">
        {BOTTLE_STATUSES.map((status) => {
          const on = statuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={on}
              onClick={() => toggleStatus(status)}
              className={cn(
                "min-h-11 border px-3 text-sm capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
              )}
            >
              {status}
            </button>
          );
        })}
        {statuses.length === 0 ? <span className="text-xs text-muted-foreground">No status chosen: every status is shown.</span> : null}
      </div>

      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          The search did not go through. Change a filter to try again.
        </p>
      ) : null}

      {result === null ? (
        <p role="status" className="flex items-center gap-2 border-t border-border py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your bottles…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p role="status" className="text-sm tabular-nums">
              <span className="font-medium">
                {chosenAmong(entries, result.rows)} of {result.rows.length} chosen
              </span>
              {result.total > result.rows.length ? (
                <span className="text-muted-foreground"> · Showing {result.rows.length} of {result.total} matches</span>
              ) : null}
              {!settled ? <Loader2 className="ml-2 inline size-3.5 animate-spin text-muted-foreground" aria-label="Searching" /> : null}
            </p>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" className="min-h-11" disabled={result.rows.length === 0} onClick={() => onSelectAll(result.rows.map(toPicked))}>
                Select all shown
              </Button>
              <Button type="button" variant="ghost" className="min-h-11" disabled={entries.length === 0} onClick={onClear}>
                Clear
              </Button>
            </div>
          </div>
          {result.rows.length === 0 ? (
            <p className="border-t border-border py-6 text-sm text-muted-foreground">
              No bottle matches these filters. Loosen a filter, or add a label or an outside entry below.
            </p>
          ) : (
            <FieldResults rows={result.rows} chosen={chosen} onToggle={(row) => onToggle(toPicked(row))} />
          )}
        </>
      )}
    </div>
  );
}
