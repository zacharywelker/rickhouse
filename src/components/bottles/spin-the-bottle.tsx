"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Check, Dices, Loader2, RotateCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Option } from "@/lib/admin/types";
import { categorySwatchClass } from "@/lib/bottles/category-color";
import type { GridRow } from "@/lib/bottles/grid";
import { cn, formatNumeric } from "@/lib/utils";

/**
 * Issue #18 ("Spin the Bottle"): a random pick from the shelf, optionally
 * narrowed by style, finish, or proof. The wheel and the bottle in its
 * middle are pure spectacle — the actual pick is a `random()` order in
 * Postgres (`src/lib/bottles/roulette.ts`); the animation just makes the
 * wait feel like something instead of a spinner.
 */

type Filters = {
  categoryIds: number[];
  finishIds: number[];
  proofMin: number | null;
  proofMax: number | null;
};

const EMPTY_FILTERS: Filters = { categoryIds: [], finishIds: [], proofMin: null, proofMax: null };

// The bottle settles a beat before the wheel behind it does, so the two
// don't read as one rigid piece.
const BOTTLE_SPIN_MS = 3000;
const WHEEL_SPIN_MS = 3500;
const SPIN_EASE = "cubic-bezier(0.12, 0.79, 0.32, 1)";

const WHEEL_COLORS = [
  "var(--category-whiskey)",
  "var(--category-rum)",
  "var(--category-agave)",
  "var(--category-brandy)",
  "var(--category-gin)",
  "var(--category-vodka)",
  "var(--category-liqueur)",
  "var(--category-other)",
];

const WHEEL_BACKGROUND = (() => {
  const slice = 360 / WHEEL_COLORS.length;
  const stops = WHEEL_COLORS.map((color, i) => `${color} ${i * slice}deg ${(i + 1) * slice}deg`);
  return `conic-gradient(${stops.join(", ")})`;
})();

function toggle(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
}

function BottleGlyph({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 64 100" className={className} style={style} aria-hidden="true">
      <path
        d="M27 2h10a2 2 0 0 1 2 2v9.2l5.4 10.8A6 6 0 0 1 45 27v65a6 6 0 0 1-6 6H25a6 6 0 0 1-6-6V27a6 6 0 0 1 .6-2.6L25 13.6V4a2 2 0 0 1 2-2Z"
        fill="currentColor"
      />
      <rect x="19" y="46" width="26" height="22" rx="2.5" fill="var(--card)" fillOpacity="0.92" />
    </svg>
  );
}

function EntityPicker({
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
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Filter by ${label.toLowerCase()}`}
          className={cn(selected.length > 0 && "border-primary/50 text-primary")}
        >
          {label}
          {selected.length > 0 ? <Badge className="ml-1 border-primary/40 text-primary">{selected.length}</Badge> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
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
        <ul className="max-h-56 overflow-y-auto p-1">
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

function ProofPicker({
  min,
  max,
  onChange,
}: {
  min: number | null;
  max: number | null;
  onChange: (next: { min: number | null; max: number | null }) => void;
}) {
  const active = min !== null || max !== null;
  const id = React.useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={cn(active && "border-primary/50 text-primary")}>
          Proof
          {active ? (
            <Badge className="ml-1 border-primary/40 text-primary">
              {min ?? "…"}–{max ?? "…"}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor={`${id}-min`} className="text-xs">
              Min
            </Label>
            <Input
              id={`${id}-min`}
              type="number"
              value={min ?? ""}
              onChange={(e) => onChange({ min: e.target.value === "" ? null : Number(e.target.value), max })}
              className="h-9"
            />
          </div>
          <span className="pb-2 text-muted-foreground">–</span>
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor={`${id}-max`} className="text-xs">
              Max
            </Label>
            <Input
              id={`${id}-max`}
              type="number"
              value={max ?? ""}
              onChange={(e) => onChange({ min, max: e.target.value === "" ? null : Number(e.target.value) })}
              className="h-9"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SpinTheBottle({ categories, finishes }: { categories: Option[]; finishes: Option[] }) {
  const [open, setOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<Filters>(EMPTY_FILTERS);
  const [spinning, setSpinning] = React.useState(false);
  const [bottleAngle, setBottleAngle] = React.useState(0);
  const [wheelAngle, setWheelAngle] = React.useState(0);
  const [result, setResult] = React.useState<GridRow | null | undefined>(undefined);

  async function spin(withFilters: Filters) {
    setSpinning(true);
    setResult(undefined);

    const params = new URLSearchParams();
    if (withFilters.categoryIds.length > 0) params.set("category", withFilters.categoryIds.join(","));
    if (withFilters.finishIds.length > 0) params.set("finish", withFilters.finishIds.join(","));
    if (withFilters.proofMin !== null) params.set("proofMin", String(withFilters.proofMin));
    if (withFilters.proofMax !== null) params.set("proofMax", String(withFilters.proofMax));

    const request = fetch(`/api/bottles/roulette?${params.toString()}`).then(
      (res) => res.json() as Promise<{ bottle: GridRow | null }>,
    );

    // A few extra full turns each spin, piled onto wherever it already stopped
    // — never reset to 0, so back-to-back spins never look like they snapped back.
    setBottleAngle((a) => a + 1800 + Math.random() * 360);
    setWheelAngle((a) => a + 1080 + Math.random() * 360);

    const [{ bottle }] = await Promise.all([request, new Promise((r) => setTimeout(r, WHEEL_SPIN_MS))]);
    setResult(bottle);
    setSpinning(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setResult(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Dices className="size-4" />
          Spin the Bottle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Spin the Bottle</DialogTitle>
          <DialogDescription>Can&apos;t decide what to pour tonight? Narrow it down, or just spin.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 overflow-y-auto p-6">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <EntityPicker
              label="Style"
              options={categories}
              selected={filters.categoryIds}
              onToggle={(id) => setFilters((f) => ({ ...f, categoryIds: toggle(f.categoryIds, id) }))}
            />
            <EntityPicker
              label="Finish"
              options={finishes}
              selected={filters.finishIds}
              onToggle={(id) => setFilters((f) => ({ ...f, finishIds: toggle(f.finishIds, id) }))}
            />
            <ProofPicker
              min={filters.proofMin}
              max={filters.proofMax}
              onChange={({ min, max }) => setFilters((f) => ({ ...f, proofMin: min, proofMax: max }))}
            />
          </div>

          <div className="relative mx-auto aspect-square w-60 select-none sm:w-72">
            <div className="absolute left-1/2 -top-1 z-20 -translate-x-1/2" aria-hidden="true">
              <div className="size-0 border-x-8 border-t-[16px] border-x-transparent border-t-accent drop-shadow" />
            </div>
            <div
              className="absolute inset-0 rounded-full border-4 border-border shadow-lg"
              style={{
                background: WHEEL_BACKGROUND,
                transform: `rotate(${wheelAngle}deg)`,
                transition: `transform ${WHEEL_SPIN_MS}ms ${SPIN_EASE}`,
              }}
              aria-hidden="true"
            />
            <div className="absolute inset-6 rounded-full bg-card shadow-inner ring-1 ring-border" aria-hidden="true" />
            <div className="absolute inset-0 flex items-center justify-center">
              <BottleGlyph
                className="h-24 w-24 text-accent drop-shadow-md sm:h-28 sm:w-28"
                style={{
                  transform: `rotate(${bottleAngle}deg)`,
                  transition: `transform ${BOTTLE_SPIN_MS}ms ${SPIN_EASE}`,
                }}
              />
            </div>
          </div>

          {result === undefined ? (
            <div className="flex flex-col items-center gap-3">
              <Button size="lg" onClick={() => void spin(filters)} disabled={spinning}>
                {spinning ? <Loader2 className="size-4 animate-spin" /> : <Dices className="size-4" />}
                {spinning ? "Spinning…" : "Spin"}
              </Button>
              {!spinning ? (
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => {
                    setFilters(EMPTY_FILTERS);
                    void spin(EMPTY_FILTERS);
                  }}
                >
                  Surprise me — skip the questions
                </button>
              ) : null}
            </div>
          ) : result === null ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">Nothing on the shelf matches those questions.</p>
              <Button variant="outline" onClick={() => setResult(undefined)}>
                <RotateCcw className="size-4" />
                Loosen up and try again
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Tonight, you&apos;re drinking</p>
              <p className="text-sm text-muted-foreground">{result.brand}</p>
              <p className="text-xl font-medium">{result.expressionName}</p>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className={cn("size-2 shrink-0 rounded-full", categorySwatchClass(result.fieldGroup))} aria-hidden="true" />
                {[result.category, result.proof ? `${formatNumeric(result.proof)} proof` : null, result.ageStatement]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-1 flex gap-2">
                <Button variant="outline" onClick={() => void spin(filters)} disabled={spinning}>
                  <Dices className="size-4" />
                  Spin again
                </Button>
                <Button asChild>
                  <Link href={`/bottles/${result.id}` as Route}>View bottle</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
