"use client";

import { cn } from "@/lib/utils";

const GRAIN_KEYS = ["corn", "rye", "wheat", "maltedBarley", "maltedRye", "otherGrain"] as const;

export function sumGrains(values: Record<string, string | boolean>): number {
  return GRAIN_KEYS.reduce((total, key) => {
    const raw = values[key];
    const parsed = typeof raw === "string" ? Number.parseFloat(raw) : Number.NaN;
    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
}

/**
 * Live total for the mashbill editor. The database enforces 99–101 (published
 * mashbills are often rounded), so the bar goes amber inside that tolerance
 * and red outside it — you can see you are off before you hit save.
 */
export function MashbillSum({ values }: { values: Record<string, string | boolean> }) {
  const total = sumGrains(values);
  const rounded = Number(total.toFixed(2));
  const exact = rounded === 100;
  const acceptable = rounded >= 99 && rounded <= 101;

  return (
    <div className="col-span-full flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">Grain total</span>
        <span
          className={cn(
            "font-display text-lg tabular-nums",
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
      <p
        className={cn("text-xs", acceptable ? "text-muted-foreground" : "text-destructive")}
        aria-live="polite"
      >
        {exact
          ? "Adds up to 100%."
          : acceptable
            ? `Within the rounding tolerance the database allows (99–101%).`
            : rounded < 99
              ? `${Number((100 - rounded).toFixed(2))}% short of 100%.`
              : `${Number((rounded - 100).toFixed(2))}% over 100%.`}
      </p>
    </div>
  );
}
