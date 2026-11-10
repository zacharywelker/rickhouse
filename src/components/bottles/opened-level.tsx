"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { FieldGroup } from "@/db/schema";
import { fillReadout } from "@/lib/bottles/fill-state";
import { clampPct } from "@/lib/bottles/geometry";
import { FillGauge } from "./fill-gauge";

/** Where a bottle being added is in its life. Strings and numbers, as the form actions parse them. */
export type OpenedLevelValue = { isOpen: boolean; fillPct: number; dateOpened: string };

export const SEALED: OpenedLevelValue = { isOpen: false, fillPct: 100, dateOpened: "" };

/** The same rules as the bottle page: a dial under full is an open bottle, and unticking Opened reseals to full. */
export function OpenedLevel({
  value,
  onChange,
  fieldGroup,
  error,
}: {
  value: OpenedLevelValue;
  onChange: (next: OpenedLevelValue) => void;
  fieldGroup?: FieldGroup;
  error?: string | undefined;
}) {
  const sealed = !value.isOpen && value.fillPct >= 100;
  return (
    <div className="flex max-w-xs flex-col items-center gap-3 self-start">
      <FillGauge
        value={value.fillPct}
        onChange={(next) => {
          const fillPct = clampPct(next);
          onChange({ ...value, fillPct, isOpen: value.isOpen || fillPct < 100 });
        }}
        fieldGroup={fieldGroup}
        height={104}
        label="Fill level"
        sealed={sealed}
      />
      <p className="h-6 text-base font-medium" aria-hidden="true">
        {fillReadout(value.fillPct, sealed)}
      </p>
      <div className="flex w-full items-center gap-2">
        <Checkbox
          id="new-bottle-open"
          checked={value.isOpen}
          onCheckedChange={(checked) => onChange(checked === true ? { ...value, isOpen: true } : SEALED)}
        />
        <Label htmlFor="new-bottle-open" className="cursor-pointer text-foreground">
          Opened
        </Label>
      </div>
      {value.isOpen ? (
        <div className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
          <label htmlFor="new-bottle-date-opened">Opened on</label>
          <input
            id="new-bottle-date-opened"
            type="date"
            value={value.dateOpened}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => onChange({ ...value, dateOpened: event.target.value })}
            className="h-7 border border-input bg-card px-2 text-xs tabular-nums"
          />
        </div>
      ) : null}
      {value.isOpen ? <p className="w-full text-xs text-muted-foreground">Leave the date blank for today.</p> : null}
      {error ? (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
