"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReferenceCombobox } from "@/components/admin/reference-combobox";
import type { Option, ReferenceResource } from "@/lib/admin/types";

export type LinkedRow = {
  id: number;
  label: string;
  amount: string;
  hint?: string;
  /** Mashbills only: which of the label's distilleries made this recipe. */
  distilleryId?: number | null;
};

/**
 * An ordered many-to-many list — the Pursuit reference bottle has three
 * distilleries and three mashbills, and the order they are listed in is
 * meaningful, so `position` is stored alongside each link.
 *
 * Reordering is buttons rather than drag: it is keyboard-reachable by
 * default, and these lists are three or four items long.
 */
export function OrderedPicker({
  name,
  label,
  description,
  resource,
  options,
  amountLabel,
  amountSuffix,
  value,
  onChange,
  emptyHint,
  distilleryChoices,
}: {
  name: string;
  label: string;
  description: string;
  resource: ReferenceResource | null;
  options: Option[];
  emptyHint?: string;
  amountLabel: string;
  amountSuffix: string;
  value: LinkedRow[];
  onChange: (rows: LinkedRow[]) => void;
  /**
   * Mashbills only: the label's currently chosen distilleries, so each
   * mashbill can say which one made it (issue #13). With exactly one, that
   * distillery is the automatic answer — no picker needed, there is nothing
   * to choose. With none, there is nothing to attribute to yet.
   */
  distilleryChoices?: Array<{ id: number; name: string }>;
}) {
  const [available, setAvailable] = React.useState(options);
  const chosen = new Set(value.map((row) => row.id));
  const selectable = available.filter((option) => !chosen.has(option.value));
  const soloDistillery = distilleryChoices?.length === 1 ? distilleryChoices[0]! : null;

  const move = (index: number, delta: number) => {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row!);
    onChange(next);
  };

  const addRow = (option: Option) => {
    const distilleryId = soloDistillery ? soloDistillery.id : null;
    onChange([...value, { id: option.value, label: option.label, hint: option.hint, amount: "", distilleryId }]);
  };

  return (
    <fieldset className="col-span-full flex flex-col gap-3 border border-border p-4">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <p className="-mt-1 text-xs text-muted-foreground">{description}</p>

      {value.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {value.map((row, index) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 border border-border bg-muted/30 p-2">
              <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.label}
                {row.hint ? <span className="ml-1.5 text-xs text-muted-foreground">{row.hint}</span> : null}
              </span>

              {distilleryChoices && distilleryChoices.length > 1 ? (
                <div className="flex items-center gap-1">
                  <Label htmlFor={`${name}-distillery-${row.id}`} className="text-xs">
                    Distillery
                  </Label>
                  <select
                    id={`${name}-distillery-${row.id}`}
                    value={row.distilleryId ?? ""}
                    onChange={(e) =>
                      onChange(
                        value.map((r) =>
                          r.id === row.id
                            ? { ...r, distilleryId: e.target.value === "" ? null : Number(e.target.value) }
                            : r,
                        ),
                      )
                    }
                    className="h-8 border border-input bg-card px-2 text-xs"
                  >
                    <option value="">Not set</option>
                    {distilleryChoices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : soloDistillery ? (
                <span className="text-xs text-muted-foreground">from {soloDistillery.name}</span>
              ) : null}

              <div className="flex items-center gap-1">
                <Label htmlFor={`${name}-amount-${row.id}`} className="text-xs">
                  {amountLabel}
                </Label>
                <Input
                  id={`${name}-amount-${row.id}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.amount}
                  onChange={(e) =>
                    onChange(value.map((r) => (r.id === row.id ? { ...r, amount: e.target.value } : r)))
                  }
                  className="h-8 w-24"
                />
                <span className="text-xs text-muted-foreground">{amountSuffix}</span>
              </div>

              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${row.label} up`}
                  title={`Move ${row.label} up`}
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  aria-label={`Move ${row.label} down`}
                  title={`Move ${row.label} down`}
                >
                  <ChevronDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(value.filter((r) => r.id !== row.id))}
                  aria-label={`Remove ${row.label}`}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">None yet.</p>
      )}

      <ReferenceCombobox
        id={`${name}-add`}
        labelledBy={`${name}-add-label`}
        resource={resource}
        options={selectable}
        value={null}
        onChange={(next) => {
          if (next === null) return;
          const option = available.find((o) => o.value === next);
          if (!option) return;
          addRow(option);
        }}
        onOptionCreated={(option) => {
          setAvailable((prev) => [...prev, option]);
          addRow(option);
        }}
        placeholder={`Add ${label.toLowerCase()}…`}
        {...(emptyHint ? { emptyHint } : {})}
      />
      <span id={`${name}-add-label`} className="sr-only">
        Add {label.toLowerCase()}
      </span>

      <input
        type="hidden"
        name={name}
        value={JSON.stringify(
          value.map((row) => ({ id: row.id, amount: row.amount, distilleryId: row.distilleryId ?? null })),
        )}
      />
    </fieldset>
  );
}
