"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { COMMON_GRAINS, GRAIN_TOTAL, ingredientColor, orderGrains, sumGrains, type Grain } from "@/lib/mashbills";

export type GrainRow = { grain: string; percent: string };

/** Serialised into one hidden field, because a FormData list is fiddlier. */
export const GRAINS_FIELD = "grains";

export function parseGrainRows(raw: unknown): GrainRow[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is GrainRow => typeof r?.grain === "string" && typeof r?.percent === "string")
      .map((r) => ({ grain: r.grain, percent: r.percent }));
  } catch {
    return [];
  }
}

/**
 * A free-text ingredient box with the common ones to pick from as it is
 * focused or typed in. Anything can still be typed: the list is a convenience.
 */
function IngredientInput({
  id,
  value,
  onChange,
  suggestions,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  suggestions: readonly string[];
}) {
  const [open, setOpen] = React.useState(false);
  const query = value.trim().toLowerCase();
  const matches = suggestions.filter((name) => name.toLowerCase().includes(query) && name.toLowerCase() !== query);

  return (
    <Popover open={open && matches.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <span
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-3 -translate-y-1/2 rounded-full border border-border"
            style={{ backgroundColor: ingredientColor(value) }}
          />
          <Input
            id={id}
            value={value}
            placeholder="Corn"
            autoComplete="off"
            className="pl-8"
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="max-h-56 overflow-y-auto"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (event.target instanceof HTMLElement && event.target.id === id) event.preventDefault();
        }}
      >
        <ul role="listbox" aria-label="Common ingredients">
          {matches.map((name) => (
            <li key={name} role="option" aria-selected={false}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                // Keep focus in the input, so picking does not blur-close before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
              >
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full border border-border"
                  style={{ backgroundColor: ingredientColor(name) }}
                />
                {name}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The mashbill editor (SPEC M7). Rows, not six fixed columns — so a recipe
 * with oats *and* triticale keeps both names, which the old
 * other_grain/other_grain_name pair could not.
 *
 * The running total is here because the database enforces 99–101 at commit:
 * seeing you are at 96% before you hit save beats being told afterwards.
 */
export function GrainEditor({
  rows,
  onChange,
  error,
}: {
  rows: GrainRow[];
  onChange: (next: GrainRow[]) => void;
  error?: string;
}) {
  const id = React.useId();
  const total = sumGrains(rows as Grain[]);
  const rounded = Number(total.toFixed(2));
  const empty = rows.length === 0;
  const exact = rounded === GRAIN_TOTAL.exact;
  const acceptable = rounded >= GRAIN_TOTAL.min && rounded <= GRAIN_TOTAL.max;

  const update = (index: number, patch: Partial<GrainRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  // Suggest what is not already in the recipe; the field is free text anyway.
  const unused = COMMON_GRAINS.filter((g) => !rows.some((r) => r.grain.toLowerCase() === g.toLowerCase()));

  return (
    <div className="col-span-full flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-0-grain`}>Ingredients</Label>
        {empty ? (
          <p className="text-sm text-muted-foreground">
            No ingredients yet. A secret mashbill can stay empty until you have inferred its recipe.
          </p>
        ) : null}
        {rows.map((row, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor={`${id}-${index}-grain`} className="sr-only">
                Grain {index + 1}
              </label>
              <IngredientInput
                id={`${id}-${index}-grain`}
                value={row.grain}
                suggestions={unused}
                onChange={(next) => update(index, { grain: next })}
              />
            </div>
            <div className="w-28">
              <label htmlFor={`${id}-${index}-percent`} className="sr-only">
                {row.grain || `Grain ${index + 1}`} percentage
              </label>
              <Input
                id={`${id}-${index}-percent`}
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={row.percent}
                placeholder="%"
                className="tabular-nums"
                onChange={(event) => update(index, { percent: event.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove ${row.grain || `grain ${index + 1}`}`}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onChange([...rows, { grain: "", percent: "" }])}
        >
          Add an ingredient
        </Button>
      </div>

      {!empty ? (
        <div className="flex flex-col gap-2 border border-border bg-muted/40 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">Grain total</span>
            <span
              className={cn(
                "text-lg tabular-nums",
                exact ? "text-primary" : acceptable ? "text-accent" : "text-destructive",
              )}
            >
              {rounded}%
            </span>
          </div>
          {/* One segment per ingredient, in its own colour, so the mix reads at a glance. */}
          <div className="flex h-2.5 overflow-hidden rounded-full bg-border" role="presentation">
            {orderGrains(rows as Grain[]).map((row, index) => {
              const share = Number(row.percent);
              return Number.isFinite(share) && share > 0 ? (
                <div
                  key={`${row.grain}-${index}`}
                  className="h-full transition-all"
                  style={{
                    width: `${(share / Math.max(100, total)) * 100}%`,
                    backgroundColor: ingredientColor(row.grain),
                  }}
                  title={`${row.grain || "Unnamed"} ${Number(share.toFixed(2))}%`}
                />
              ) : null;
            })}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {orderGrains(rows as Grain[]).map((row, index) => (
              <li key={`${row.grain}-${index}`} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full border border-border"
                  style={{ backgroundColor: ingredientColor(row.grain) }}
                />
                {row.grain || "Unnamed"} {Number(Number(row.percent || 0).toFixed(2))}%
              </li>
            ))}
          </ul>
          <p className={cn("text-xs", acceptable ? "text-muted-foreground" : "text-destructive")} aria-live="polite">
            {exact
              ? "Adds up to 100%."
              : acceptable
                ? "Within the rounding tolerance the database allows (99–101%)."
                : rounded < GRAIN_TOTAL.min
                  ? `${Number((100 - rounded).toFixed(2))}% short of 100%.`
                  : `${Number((rounded - 100).toFixed(2))}% over 100%.`}
          </p>
          {rows.length > 1 ? (
            <p className="text-xs text-muted-foreground">
              Reads as <span className="text-foreground">{orderGrains(rows as Grain[]).map((g) => g.grain).filter(Boolean).join(", ")}</span> — the dominant grain first, then the order a mashbill is normally written in.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <input type="hidden" name={GRAINS_FIELD} value={JSON.stringify(rows)} />
    </div>
  );
}
