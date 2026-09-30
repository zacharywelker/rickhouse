"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A slider over a fixed, ordered list of stops. The form value is the stop's
 * `value` string; a value that matches no stop reads as the first stop.
 */
export function StopSlider({
  id,
  name,
  label,
  stops,
  value,
  onChange,
  onKeyDown,
  inputRef,
  invalid,
  compact,
}: {
  id: string;
  name?: string;
  label: string;
  stops: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  inputRef?: (el: HTMLElement | null) => void;
  invalid?: boolean | undefined;
  /** Grid cells: drop the tick labels and show only the current stop. */
  compact?: boolean;
}) {
  const found = stops.findIndex((s) => s.value === value);
  const index = found === -1 ? 0 : found;
  const current = stops[index]!;

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        id={id}
        type="range"
        min={0}
        max={stops.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(stops[Number(e.target.value)]!.value)}
        onKeyDown={onKeyDown}
        aria-label={label}
        aria-valuetext={current.label}
        aria-invalid={invalid || undefined}
        className={cn("h-6 w-full cursor-pointer accent-primary", invalid && "outline outline-1 outline-destructive")}
      />
      {name ? <input type="hidden" name={name} value={current.value} /> : null}
      {compact ? (
        <span className="text-xs text-muted-foreground">{current.label}</span>
      ) : (
        <div aria-hidden="true" className="flex justify-between text-xs text-muted-foreground">
          {stops.map((s, i) => (
            <span key={s.value} className={cn(i === index && "font-medium text-foreground")}>
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
