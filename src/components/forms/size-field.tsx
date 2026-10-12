"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatSize } from "@/lib/expressions/sizes";
import type { FieldValue } from "@/lib/forms/values";

/**
 * A bottle size: the usual ones to pick from, and "Other size…" for the rest,
 * which is typed as a whole number of mL. A blank choice (`blankLabel`) means
 * "same as the label" on a bottle. The value is submitted through one hidden
 * input, so the select and the number box never disagree about it.
 */
export function SizeField({
  id,
  name,
  value,
  onChange,
  presets,
  blankLabel,
  error,
}: {
  id: string;
  name: string;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  presets: ReadonlyArray<number>;
  blankLabel?: string | undefined;
  error?: string | undefined;
}) {
  const text = String(value ?? "");
  const [otherOpen, setOtherOpen] = React.useState(false);
  const known = presets.some((ml) => String(ml) === text);
  const other = otherOpen || (text !== "" && !known);
  const selected = other ? "other" : text;

  return (
    <div className="flex flex-col gap-2">
      <select
        id={id}
        value={selected}
        onChange={(e) => {
          if (e.target.value === "other") {
            setOtherOpen(true);
            return;
          }
          setOtherOpen(false);
          onChange(e.target.value);
        }}
        className={cn(
          "h-10 border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          error && "border-destructive",
        )}
      >
        {blankLabel !== undefined ? <option value="">{blankLabel}</option> : null}
        {presets.map((ml) => (
          <option key={ml} value={String(ml)}>
            {formatSize(ml)}
          </option>
        ))}
        <option value="other">Other size…</option>
      </select>
      {other ? (
        <div className="flex items-center gap-2">
          <Input
            id={`${id}-other`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Size in mL, whole numbers"
            placeholder="e.g. 1750"
            value={text}
            // Whole numbers only: anything that is not a digit is dropped as it is typed.
            onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
            className="w-32"
            aria-invalid={error ? true : undefined}
          />
          <span className="text-sm text-muted-foreground">mL</span>
        </div>
      ) : null}
      <input type="hidden" name={name} value={text} />
    </div>
  );
}
