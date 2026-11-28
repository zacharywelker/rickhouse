"use client";

import * as React from "react";
import { useCurrencySymbol, useMoneyStep } from "@/components/currency-context";
import { capDecimals, padDecimals } from "@/lib/decimals";
import { chipKind } from "@/lib/expressions/chip-kind";
import { ADD_CHIP, BARE_INPUT, BOX_INPUT, CHIP, CHIP_LABEL, INPUT_WIDTHS, TOGGLE } from "./chip-styles";
import { cn } from "@/lib/utils";
import type { FieldSpec } from "@/lib/admin/types";
import type { FieldValue } from "@/lib/forms/values";

/** A dashed "+ Label" button for an optional fact that has nothing in it yet. */
export function AddChip({ label, onClick, id }: { label: string; onClick: () => void; id?: string }) {
  return (
    <button type="button" id={id} onClick={onClick} aria-label={`Add ${label}`} className={ADD_CHIP}>
      + {label}
    </button>
  );
}

/** A checkbox as a capsule that fills when it is on. The real checkbox is underneath, for the keyboard and screen readers. */
export function ToggleChip({ spec, idPrefix, value, onChange }: { spec: FieldSpec; idPrefix: string; value: FieldValue; onChange: (value: FieldValue) => void }) {
  const id = `${idPrefix}-${spec.name}`;
  const on = value === true || value === "true" || value === "on";
  return (
    <label htmlFor={id} className={cn(TOGGLE, on ? "bg-foreground text-background" : "bg-card")}>
      <input id={id} name={spec.name} type="checkbox" className="sr-only" checked={on} onChange={(event) => onChange(event.target.checked)} />
      {on ? <span aria-hidden="true" className="text-[11px]">✓</span> : null}
      {spec.label}
    </label>
  );
}

function ErrorText({ id, error }: { id: string; error: string | undefined }) {
  return error ? <p id={id} role="alert" className="basis-full text-xs text-destructive">{error}</p> : null;
}

/**
 * One simple field as a chip (see `chipKind`): a value chip with its input inline, a toggle, a select as a chip, or, while an
 * optional fact is empty, a dashed "+" chip that opens it. `onField` draws the kinds this does not (references, long text,
 * size presets), so the row can still hold every field. The input has the field's own name, so a save posts what it always did.
 */
export function ChipField({ spec, idPrefix, value, onChange, error, locked = false, onUnlock, onField, bare = false }: {
  spec: FieldSpec;
  idPrefix: string;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  error?: string | undefined;
  locked?: boolean;
  onUnlock?: () => void;
  onField: () => React.ReactNode;
  /** No label inside the chip (the Name row: the value says what it is); the label stays as the input's accessible name. */
  bare?: boolean;
}) {
  const id = `${idPrefix}-${spec.name}`;
  const kind = chipKind(spec, value);
  const [opened, setOpened] = React.useState(false);
  const moneyStep = useMoneyStep();
  const symbol = useCurrencySymbol();
  const input = React.useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  React.useEffect(() => {
    if (opened) input.current?.focus();
  }, [opened]);

  if (kind === "field") return <>{onField()}</>;
  if (kind === "toggle") return <ToggleChip spec={spec} idPrefix={idPrefix} value={value} onChange={onChange} />;

  const empty = value === null || value === undefined || value === "";
  // An empty optional fact is a "+" chip until it is opened; opened and left empty, it goes back.
  if ((kind === "add-value" || kind === "add-select") && empty && !opened) {
    return <AddChip id={`${id}-add`} label={spec.label} onClick={() => setOpened(true)} />;
  }
  const money = spec.kind === "number" && spec.money === true;
  const errorId = `${id}-error`;

  if (spec.kind === "select") {
    return (
      <div className="flex flex-col gap-1">
        <label className={cn(CHIP, error && "border-destructive")}>
          {bare ? null : <span className={CHIP_LABEL}>{spec.label}</span>}
          <select
            id={id} name={spec.name} ref={(node) => { input.current = node; }}
            value={String(value ?? "")} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => { if (value === "" || value === null || value === undefined) setOpened(false); }}
            className="min-w-0 border-0 bg-transparent p-0 text-[12px] font-semibold outline-none"
          >
            {spec.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <ErrorText id={errorId} error={error} />
      </div>
    );
  }
  if (spec.kind !== "text" && spec.kind !== "number" && spec.kind !== "date") return <>{onField()}</>;
  if (bare) {
    // A boxed input with no label (the Name row's label name): the value says what it is.
    return (
      <div className="flex flex-col gap-1">
        <input
          id={id} name={spec.name} ref={(node) => { input.current = node; }} type="text" aria-label={spec.label}
          value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}
          placeholder={"placeholder" in spec ? spec.placeholder : undefined}
          aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
          className={cn(BOX_INPUT, "w-[190px]", error && "border-destructive")}
        />
        <ErrorText id={errorId} error={error} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <label className={cn(CHIP, error && "border-destructive", locked && "bg-muted text-muted-foreground")}>
        {bare ? null : <span className={CHIP_LABEL}>{spec.label}</span>}
        {money ? <span aria-hidden="true" className="text-sm text-muted-foreground">{symbol}</span> : null}
        <input
          id={id} name={spec.name} ref={(node) => { input.current = node; }}
          type={spec.kind === "number" ? "number" : spec.kind === "date" ? "date" : "text"}
          value={String(value ?? "")}
          onChange={(event) => onChange(money ? capDecimals(event.target.value, 2) : event.target.value)}
          onBlur={() => {
            if (money) {
              const text = String(value ?? "");
              const padded = padDecimals(text, 2);
              if (padded !== text) onChange(padded);
            }
            if (String(value ?? "") === "") setOpened(false);
          }}
          placeholder={"placeholder" in spec ? spec.placeholder : undefined}
          aria-label={spec.label}
          readOnly={locked} aria-readonly={locked || undefined} title={locked ? "Triple-click to edit" : undefined}
          onClick={locked && onUnlock ? (event) => event.detail >= 3 && onUnlock() : undefined}
          aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
          className={cn(BARE_INPUT, INPUT_WIDTHS[spec.width ?? "sm"], locked && "cursor-not-allowed")}
          {...(spec.kind === "number" ? { min: spec.min, max: spec.max, step: money ? moneyStep : (spec.step ?? 1) } : {})}
        />
      </label>
      <ErrorText id={errorId} error={error} />
    </div>
  );
}
