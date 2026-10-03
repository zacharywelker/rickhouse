"use client";

import * as React from "react";
import { CharLevelSlider } from "@/components/forms/char-level-slider";
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
  look,
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
  /**
   * Grid cells: just the value, as text. The range input is still there,
   * visually hidden, so arrow keys step through the stops; the first stop
   * (unknown) reads muted rather than like a low value.
   */
  compact?: boolean;
  /** "stave": the Char Level drawing, in the full form only. */
  look?: "stave" | undefined;
}) {
  if (look === "stave" && !compact) {
    return <CharLevelSlider id={id} name={name} label={label} stops={stops} value={value} onChange={onChange} invalid={invalid} />;
  }

  const found = stops.findIndex((s) => s.value === value);
  const index = found === -1 ? 0 : found;
  const current = stops[index]!;

  const input = (
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
      className={compact ? "sr-only" : cn("h-6 w-full cursor-pointer accent-primary", invalid && "outline outline-1 outline-destructive")}
    />
  );
  const hidden = name ? <input type="hidden" name={name} value={current.value} /> : null;

  if (compact) {
    return (
      <label
        className={cn(
          "flex h-9 w-full cursor-default items-center px-2 text-sm focus-within:outline-2 focus-within:outline-ring",
          index === 0 && "text-muted-foreground",
          invalid && "outline outline-1 outline-destructive",
        )}
      >
        {input}
        <span aria-hidden="true">{current.label}</span>
        {hidden}
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {input}
      {hidden}
      <div aria-hidden="true" className="flex justify-between text-xs text-muted-foreground">
        {stops.map((s, i) => (
          <span key={s.value} className={cn(i === index && "font-medium text-foreground")}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
