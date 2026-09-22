"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FieldValue } from "@/lib/forms/values";

type AgeUnit = "ageYears" | "ageMonths" | "ageDays";

const UNITS: ReadonlyArray<{ name: AgeUnit; label: string; min: number; max: number; step: number }> = [
  { name: "ageYears", label: "Years", min: 0, max: 100, step: 0.1 },
  { name: "ageMonths", label: "Months", min: 0, max: 1200, step: 1 },
  { name: "ageDays", label: "Days", min: 0, max: 40000, step: 1 },
];

/**
 * Age as years, months and days on one line (SPEC #12) — a label reads "12
 * Year 5 Month", not three stacked fields that happen to share a topic.
 */
export function AgeFields({
  idPrefix,
  values,
  onChange,
  errors,
  help,
}: {
  idPrefix: string;
  values: Record<AgeUnit, FieldValue>;
  onChange: (name: AgeUnit, value: FieldValue) => void;
  errors?: Partial<Record<AgeUnit, string>>;
  help?: string;
}) {
  const firstError = errors?.ageYears ?? errors?.ageMonths ?? errors?.ageDays;

  return (
    <div className="col-span-full flex flex-col gap-1.5">
      <Label id={`${idPrefix}-age-label`}>Age</Label>
      <div className="flex gap-3" role="group" aria-labelledby={`${idPrefix}-age-label`}>
        {UNITS.map((unit) => (
          <div key={unit.name} className="flex flex-1 flex-col gap-1">
            <Label htmlFor={`${idPrefix}-${unit.name}`} className="text-xs font-normal text-muted-foreground">
              {unit.label}
            </Label>
            <Input
              id={`${idPrefix}-${unit.name}`}
              name={unit.name}
              type="number"
              min={unit.min}
              max={unit.max}
              step={unit.step}
              value={String(values[unit.name] ?? "")}
              onChange={(e) => onChange(unit.name, e.target.value)}
              aria-invalid={errors?.[unit.name] ? true : undefined}
              className={cn(errors?.[unit.name] && "border-destructive")}
            />
          </div>
        ))}
      </div>
      {firstError ? (
        <p role="alert" className="text-sm text-destructive">
          {firstError}
        </p>
      ) : help ? (
        <p className="text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}
