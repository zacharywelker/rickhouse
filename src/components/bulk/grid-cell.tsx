"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ReferenceCombobox } from "@/components/admin/reference-combobox";
import { cn } from "@/lib/utils";
import type { FieldSpec, Option } from "@/lib/admin/types";
import type { FieldValue } from "@/lib/forms/values";

/** How wide a cell needs to be to hold its control, by field kind. */
export const CELL_WIDTH: Record<FieldSpec["kind"], string> = {
  reference: "min-w-48",
  text: "min-w-40",
  textarea: "min-w-56",
  number: "min-w-24",
  date: "min-w-36",
  select: "min-w-32",
  checkbox: "",
};

/**
 * One field from its spec, sized for a grid cell rather than a form row.
 *
 * The grid counterpart of `Field`: the same spec drives both, so a column in
 * the bulk grid or the unlocked labels table takes exactly the values the
 * form would. There is no visible label — the column header is it — so each
 * control carries its field name for screen readers.
 */
export function GridCell({
  spec,
  id,
  labelledBy,
  value,
  onChange,
  invalid,
  options,
  onOptionCreated,
  inputRef,
  onKeyDown,
  className,
}: {
  spec: FieldSpec;
  id: string;
  /** The column header's id, for the pickers' accessible name. */
  labelledBy: string;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  invalid?: boolean;
  options?: Option[];
  onOptionCreated?: (option: Option) => void;
  /** Enter-moves-down navigation (`useGridNav`), for the typed-in kinds. */
  inputRef?: (el: HTMLElement | null) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  className?: string;
}) {
  const text = String(value ?? "");

  switch (spec.kind) {
    case "checkbox":
      return (
        <div className={cn("flex h-9 items-center justify-center", className)}>
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
            aria-label={spec.label}
            aria-invalid={invalid || undefined}
          />
        </div>
      );

    case "select":
      return (
        <select
          ref={inputRef}
          id={id}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={spec.label}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-9 w-full border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            invalid && "border-destructive",
            className,
          )}
        >
          {spec.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );

    case "reference":
      return (
        <ReferenceCombobox
          id={id}
          labelledBy={labelledBy}
          resource={spec.resource}
          options={options ?? []}
          value={text === "" ? null : Number(text)}
          onChange={(next) => onChange(next === null ? "" : String(next))}
          onOptionCreated={onOptionCreated ?? (() => undefined)}
          invalid={invalid}
          placeholder={spec.resource === null ? `Pick a ${spec.label.toLowerCase()}…` : "Pick or create…"}
        />
      );

    default:
      return (
        <Input
          ref={inputRef}
          id={id}
          type={spec.kind === "number" ? "number" : spec.kind === "date" ? "date" : "text"}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={"placeholder" in spec ? spec.placeholder : undefined}
          aria-label={spec.label}
          aria-invalid={invalid || undefined}
          className={cn("h-9", invalid && "border-destructive", className)}
          {...(spec.kind === "number" ? { min: spec.min, max: spec.max, step: spec.step ?? 1 } : {})}
        />
      );
  }
}
