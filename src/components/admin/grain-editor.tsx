"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { COMMON_GRAINS, GRAIN_TOTAL, orderGrains, sumGrains, type Grain } from "@/lib/mashbills";

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
        <Label htmlFor={`${id}-0-grain`}>Grains</Label>
        {empty ? (
          <p className="text-sm text-muted-foreground">
            No grains yet. A recipe you know the name of but not the contents is fine — add them when you find out.
          </p>
        ) : null}
        {rows.map((row, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor={`${id}-${index}-grain`} className="sr-only">
                Grain {index + 1}
              </label>
              <Input
                id={`${id}-${index}-grain`}
                value={row.grain}
                list={`${id}-suggestions`}
                placeholder="Corn"
                onChange={(event) => update(index, { grain: event.target.value })}
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
        <datalist id={`${id}-suggestions`}>
          {unused.map((grain) => (
            <option key={grain} value={grain} />
          ))}
        </datalist>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onChange([...rows, { grain: "", percent: "" }])}
        >
          <Plus className="size-4" />
          Add a grain
        </Button>
      </div>

      {!empty ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
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
          <div className="h-1.5 overflow-hidden rounded-full bg-border" role="presentation">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                exact ? "bg-primary" : acceptable ? "bg-accent" : "bg-destructive",
              )}
              style={{ width: `${Math.min(100, Math.max(0, total))}%` }}
            />
          </div>
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
