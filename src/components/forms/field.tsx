"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReferenceCombobox } from "@/components/admin/reference-combobox";
import { descendantsOf } from "@/lib/admin/tree";
import { cn } from "@/lib/utils";
import type { FieldSpec, Option } from "@/lib/admin/types";
import type { FieldValue } from "@/lib/forms/values";

/**
 * Renders one field from its spec. Shared by the configuration dialogs and
 * the larger expression and bottle forms, so a field behaves the same
 * everywhere it appears.
 */
export function Field({
  spec,
  idPrefix,
  value,
  onChange,
  error,
  options,
  onOptionCreated,
  excludeId,
}: {
  spec: FieldSpec;
  idPrefix: string;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  error?: string | undefined;
  options?: Option[];
  onOptionCreated?: (option: Option) => void;
  /** For self-referencing pickers: the row being edited. */
  excludeId?: number | undefined;
}) {
  const inputId = `${idPrefix}-${spec.name}`;
  const required = "required" in spec && spec.required === true;

  return (
    <div className={cn("flex flex-col gap-1.5", spec.span === "half" ? "sm:col-span-1" : "col-span-full")}>
      {/* The asterisk sits outside the <label> so the label's text is exactly
          the field name, for screen readers and for tests. */}
      <div className="flex items-center gap-1">
        <Label id={`${inputId}-label`} htmlFor={inputId}>
          {spec.label}
        </Label>
        {required ? (
          <span aria-hidden="true" className="text-sm text-destructive">
            *
          </span>
        ) : null}
      </div>

      {spec.kind === "text" || spec.kind === "number" || spec.kind === "date" ? (
        <Input
          id={inputId}
          name={spec.name}
          type={spec.kind === "number" ? "number" : spec.kind === "date" ? "date" : "text"}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"placeholder" in spec ? spec.placeholder : undefined}
          aria-invalid={error ? true : undefined}
          className={cn(error && "border-destructive")}
          {...(spec.kind === "number" ? { min: spec.min, max: spec.max, step: spec.step ?? 1 } : {})}
        />
      ) : null}

      {spec.kind === "textarea" ? (
        <Textarea
          id={inputId}
          name={spec.name}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={spec.placeholder}
          className={cn(error && "border-destructive")}
        />
      ) : null}

      {spec.kind === "select" ? (
        <select
          id={inputId}
          name={spec.name}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            error && "border-destructive",
          )}
        >
          {spec.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}

      {spec.kind === "checkbox" ? (
        <div className="flex h-10 items-center gap-2">
          <Checkbox
            id={inputId}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          <input type="hidden" name={spec.name} value={value === true ? "on" : ""} />
          <Label htmlFor={inputId} className="cursor-pointer text-foreground">
            {spec.help ?? spec.label}
          </Label>
        </div>
      ) : null}

      {spec.kind === "reference" ? (
        <>
          <ReferenceCombobox
            id={inputId}
            labelledBy={`${inputId}-label`}
            resource={spec.resource}
            options={options ?? []}
            value={typeof value === "string" && value !== "" ? Number(value) : null}
            onChange={(next) => onChange(next === null ? "" : String(next))}
            onOptionCreated={onOptionCreated ?? (() => undefined)}
            {...(spec.excludeSelfAndDescendants && excludeId !== undefined
              ? {
                  excludeIds: descendantsOf(
                    (options ?? []).map((o) => ({ id: o.value, parentId: o.parentId })),
                    excludeId,
                  ),
                }
              : {})}
            invalid={error !== undefined}
          />
          <input type="hidden" name={spec.name} value={String(value ?? "")} />
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : spec.help && spec.kind !== "checkbox" ? (
        <p className="text-xs text-muted-foreground">{spec.help}</p>
      ) : null}
    </div>
  );
}

export { initialFieldValues, type FieldValue } from "@/lib/forms/values";
