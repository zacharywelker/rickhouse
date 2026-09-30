"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ACQUISITIONS, type Acquisition } from "@/db/schema";
import type { BottleFilters } from "@/lib/bottles/filters";
import { cn, formatDate, humanise } from "@/lib/utils";

/**
 * The quieter filters: how a bottle arrived, when, how full it is, and a few
 * label facts. They are mostly reached from Numbers, where every finding links
 * to the bottles behind it, so each one also shows as a removable chip — a
 * narrowed list must always say why it is narrowed.
 */

type Apply = (patch: Partial<BottleFilters>) => void;

const FLAGS = [
  { key: "caskStrength", label: "Cask strength" },
  { key: "bottledInBond", label: "Bottled in bond" },
  { key: "pick", label: "Store pick" },
  { key: "overMsrp", label: "Paid over MSRP" },
] as const;

function detailCount(filters: BottleFilters): number {
  let count = filters.acquisitions.length > 0 ? 1 : 0;
  count += filters.acquired.from !== null || filters.acquired.to !== null ? 1 : 0;
  count += filters.fill.min !== null || filters.fill.max !== null ? 1 : 0;
  for (const flag of FLAGS) count += filters[flag.key] ? 1 : 0;
  return count;
}

export function DetailFilters({ filters, apply }: { filters: BottleFilters; apply: Apply }) {
  const active = detailCount(filters);
  const toggleAcquisition = (kind: Acquisition) =>
    apply({
      acquisitions: filters.acquisitions.includes(kind)
        ? filters.acquisitions.filter((k) => k !== kind)
        : [...filters.acquisitions, kind],
    });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="More filters"
          className={cn(active > 0 && "border-primary/50 text-primary")}
        >
          More
          {active > 0 ? <Badge className="ml-1 border-primary/40 text-primary">{active}</Badge> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3">
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs text-muted-foreground">Acquired as</legend>
          <div className="grid grid-cols-2 gap-x-2">
            {ACQUISITIONS.map((kind) => (
              <div key={kind} className="flex items-center gap-2 py-1">
                <Checkbox
                  id={`acq-${kind}`}
                  checked={filters.acquisitions.includes(kind)}
                  onCheckedChange={() => toggleAcquisition(kind)}
                />
                <Label htmlFor={`acq-${kind}`} className="cursor-pointer text-foreground">
                  {humanise(kind)}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
          <legend className="sr-only">Acquired between</legend>
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="acquired-from" className="text-xs">
                Acquired from
              </Label>
              <Input
                id="acquired-from"
                type="date"
                value={filters.acquired.from ?? ""}
                onChange={(e) => apply({ acquired: { ...filters.acquired, from: e.target.value || null } })}
                className="h-9"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="acquired-to" className="text-xs">
                to
              </Label>
              <Input
                id="acquired-to"
                type="date"
                value={filters.acquired.to ?? ""}
                onChange={(e) => apply({ acquired: { ...filters.acquired, to: e.target.value || null } })}
                className="h-9"
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="mt-3 flex items-end gap-2 border-t border-border pt-3">
          <legend className="sr-only">Fill level</legend>
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="fill-min" className="text-xs">
              Fill from (%)
            </Label>
            <Input
              id="fill-min"
              type="number"
              min={0}
              max={100}
              value={filters.fill.min ?? ""}
              onChange={(e) => apply({ fill: { ...filters.fill, min: e.target.value === "" ? null : Number(e.target.value) } })}
              className="h-9"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="fill-max" className="text-xs">
              to (%)
            </Label>
            <Input
              id="fill-max"
              type="number"
              min={0}
              max={100}
              value={filters.fill.max ?? ""}
              onChange={(e) => apply({ fill: { ...filters.fill, max: e.target.value === "" ? null : Number(e.target.value) } })}
              className="h-9"
            />
          </div>
        </fieldset>

        <div className="mt-3 flex flex-col border-t border-border pt-2">
          {FLAGS.map((flag) => (
            <div key={flag.key} className="flex items-center gap-2 py-1">
              <Checkbox
                id={`flag-${flag.key}`}
                checked={filters[flag.key]}
                onCheckedChange={() => apply({ [flag.key]: !filters[flag.key] })}
              />
              <Label htmlFor={`flag-${flag.key}`} className="cursor-pointer text-foreground">
                {flag.label}
              </Label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function rangeText(min: number | null, max: number | null, unit: string): string {
  if (min !== null && max !== null) return `${min}–${max}${unit}`;
  if (min !== null) return `${min}${unit} or more`;
  return `${max}${unit} or less`;
}

/** One removable chip per active detail filter, plus the sealed-only state Numbers links to. */
export function DetailFilterChips({ filters, apply }: { filters: BottleFilters; apply: Apply }) {
  const chips: Array<{ key: string; label: string; clear: Partial<BottleFilters> }> = [];

  if (filters.open === "closed") chips.push({ key: "sealed", label: "Sealed only", clear: { open: "any" } });
  if (filters.acquisitions.length > 0) {
    chips.push({
      key: "acq",
      label: `Acquired as ${filters.acquisitions.map((k) => humanise(k).toLowerCase()).join(" or ")}`,
      clear: { acquisitions: [] },
    });
  }
  if (filters.acquired.from || filters.acquired.to) {
    const { from, to } = filters.acquired;
    chips.push({
      key: "acquired",
      label:
        from && to
          ? `Acquired ${formatDate(from)} – ${formatDate(to)}`
          : from
            ? `Acquired since ${formatDate(from)}`
            : `Acquired before ${formatDate(to)}`,
      clear: { acquired: { from: null, to: null } },
    });
  }
  if (filters.fill.min !== null || filters.fill.max !== null) {
    chips.push({
      key: "fill",
      label: `Fill ${rangeText(filters.fill.min, filters.fill.max, "%")}`,
      clear: { fill: { min: null, max: null } },
    });
  }
  for (const flag of FLAGS) {
    if (filters[flag.key]) chips.push({ key: flag.key, label: flag.label, clear: { [flag.key]: false } });
  }

  if (chips.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => apply(chip.clear)}
            className="inline-flex items-center gap-1.5 border border-foreground px-2 py-0.5 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {chip.label}
            <X className="size-3.5" aria-hidden="true" />
            <span className="sr-only">(remove)</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
