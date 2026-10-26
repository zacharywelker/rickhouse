"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReferenceCombobox } from "@/components/admin/reference-combobox";
import { linksPayload } from "@/lib/expressions/links";
import { UndisclosedTick } from "./undisclosed-tick";
import type { Option, ReferenceResource } from "@/lib/admin/types";
import { CreateWithDetailsDialog } from "@/components/admin/create-with-details-dialog";
import { mashbillSuggestionsAction } from "@/app/(app)/expressions/actions";

/** The JSON a list is submitted as, read back by `parseLinks` on the server. */
export function serializeLinks(rows: LinkedRow[]): string {
  return linksPayload(rows);
}

export type LinkedRow = {
  id: number;
  label: string;
  amount: string;
  hint?: string;
  /** Mashbills only: which of the label's distilleries made this recipe. */
  distilleryId?: number | null;
  /** Distilleries only: identified from outside the label, not stated on it. */
  inferred?: boolean;
  /** Distilleries only: an "Undisclosed (…)" placeholder, which has nothing to infer. */
  undisclosed?: boolean;
  /** An undisclosed place typed into the tick box, not yet a row: the save resolves it. */
  place?: { city: string; state: string; country: string };
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
  amountMax,
  showAmount = true,
  showOrder = true,
  value: allRows,
  onChange: onAllRowsChange,
  emptyHint,
  distilleryChoices,
  inferable = false,
  onSuggestMashbill,
  chosenMashbillIds,
  undisclosable = false,
  onOptionCreated,
  defaultCountry,
}: {
  name: string;
  label: string;
  description: string;
  resource: ReferenceResource | null;
  options: Option[];
  defaultCountry?: string;
  emptyHint?: string;
  amountLabel: string;
  amountSuffix: string;
  /** The most the amount can be: 100 for a share. Months have no cap. */
  amountMax?: number;
  showAmount?: boolean;
  showOrder?: boolean;
  value: LinkedRow[];
  onChange: (rows: LinkedRow[]) => void;
  /**
   * Mashbills only: the label's currently chosen distilleries, so each
   * mashbill can say which one made it (issue #13). With exactly one, that
   * distillery is the automatic answer — no picker needed, there is nothing
   * to choose. With none, there is nothing to attribute to yet.
   */
  distilleryChoices?: Array<{ id: number; name: string }>;
  /** Distilleries only: each row gets an "Inferred" tick, for a source the label never names. */
  inferable?: boolean;
  /**
   * Distilleries only: where a "Common mashbills" suggestion goes. It belongs
   * in the label's mashbill list, not this one, so the form supplies the way in.
   */
  onSuggestMashbill?: (row: LinkedRow) => void;
  /** Distilleries only: mashbills already on the label, so a suggestion is not offered twice. */
  chosenMashbillIds?: ReadonlySet<number>;
  /**
   * Distilleries only: a "Distillery not disclosed" tick under the list, for a
   * label that names a place and no distillery. Those links live behind the
   * tick, not in the list, so the list holds only real distilleries.
   */
  undisclosable?: boolean;
  /**
   * A newly created option, for the caller to share — a grid's other rows
   * need it in their pickers too. Kept here as well, for callers that don't.
   */
  onOptionCreated?: (option: Option) => void;
}) {
  const [created, setCreated] = React.useState<Option[]>([]);
  const [editing, setEditing] = React.useState<LinkedRow | null>(null);
  const [suggestions, setSuggestions] = React.useState<Record<number, Option[]>>({});
  const available = React.useMemo(() => {
    const known = new Set(options.map((option) => option.value));
    return [...options, ...created.filter((option) => !known.has(option.value))];
  }, [options, created]);
  // With the tick, undisclosed links are set aside; every edit below is to the
  // listed ones and puts the others back on the end, where they are saved.
  const undisclosedRows = undisclosable ? allRows.filter((row) => row.undisclosed) : [];
  const value = undisclosable ? allRows.filter((row) => !row.undisclosed) : allRows;
  const onChange = (next: LinkedRow[]) => onAllRowsChange(undisclosable ? [...next, ...undisclosedRows] : next);
  const chosen = new Set(allRows.map((row) => row.id));
  const selectable = available.filter(
    (option) => !chosen.has(option.value) && !(undisclosable && option.undisclosed),
  );
  const soloDistillery = distilleryChoices?.length === 1 ? distilleryChoices[0]! : null;
  const distilleryKey = resource === "distilleries" && name === "distilleryLinks"
    ? value.map((row) => row.id).join(",")
    : "";

  React.useEffect(() => {
    if (!distilleryKey) {
      return;
    }
    let active = true;
    const ids = distilleryKey.split(",").map(Number);
    void Promise.all(ids.map(async (id) => [id, await mashbillSuggestionsAction(id)] as const)).then((pairs) => {
      if (active) setSuggestions(Object.fromEntries(pairs));
    }).catch(() => {
      if (active) setSuggestions({});
    });
    return () => { active = false; };
  }, [distilleryKey]);

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
    onChange([
      ...value,
      { id: option.value, label: option.label, hint: option.hint, amount: "", distilleryId, undisclosed: option.undisclosed },
    ]);
  };

  const addSuggestedMashbill = (distillery: LinkedRow, option: Option) => {
    // With one distillery the save attributes it automatically (issue #13).
    onSuggestMashbill?.({
      id: option.value,
      label: option.label,
      hint: option.hint,
      amount: "",
      distilleryId: value.length > 1 ? distillery.id : null,
    });
  };

  return (
    <fieldset className="col-span-full flex flex-col gap-3 border border-border p-4">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <p className="-mt-1 text-xs text-muted-foreground">{description}</p>

      {value.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {value.map((row, index) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 border border-border bg-muted/30 p-2">
              {showOrder ? <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span> : null}
              {/*
                On a phone the name takes the whole first line (less the index
                number) and the controls wrap below it; a long recipe would
                otherwise be squeezed down to its first letter. From sm up it
                shares the line, truncated.
              */}
              <span className="min-w-0 grow basis-[calc(100%-1.75rem)] break-words text-sm sm:basis-40 sm:truncate">
                {row.label}
                {row.hint && !row.undisclosed ? <span className="ml-1.5 text-xs text-muted-foreground">{row.hint}</span> : null}
              </span>

              {resource !== null && ["distilleries", "mashbills", "finishes"].includes(resource) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${row.label} details`}
                  title={`Edit ${row.label} details`}
                  onClick={() => setEditing(row)}
                >
                  <Pencil className="size-4" />
                </Button>
              ) : null}

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

              {inferable && !row.undisclosed ? (
                <label
                  htmlFor={`${name}-inferred-${row.id}`}
                  className="flex items-center gap-1 text-xs"
                  title="Not stated on the label; identified from outside it"
                >
                  <input
                    id={`${name}-inferred-${row.id}`}
                    type="checkbox"
                    checked={row.inferred === true}
                    onChange={(e) =>
                      onChange(value.map((r) => (r.id === row.id ? { ...r, inferred: e.target.checked } : r)))
                    }
                  />
                  Inferred
                </label>
              ) : null}

              {showAmount ? <div className="flex items-center gap-1">
                <Label htmlFor={`${name}-amount-${row.id}`} className="text-xs">
                  {amountLabel}
                </Label>
                <Input
                  id={`${name}-amount-${row.id}`}
                  type="number"
                  min={0}
                  max={amountMax}
                  // Whole numbers: a share to the hundredth is more exact than
                  // anyone knows a blend to be, and months are whole anyway.
                  step={1}
                  inputMode="numeric"
                  value={row.amount}
                  onChange={(e) =>
                    onChange(value.map((r) => (r.id === row.id ? { ...r, amount: e.target.value } : r)))
                  }
                  // Exactly three digits wide — "100" — plus padding and
                  // border, in the input's own font (1ch is one tabular digit).
                  // No spinner arrows: they would take half of it, and a phone
                  // shows a keypad anyway.
                  className="h-8 w-[calc(3ch_+_0.75rem_+_2px)] px-1.5 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-xs text-muted-foreground">{amountSuffix}</span>
              </div> : null}

              <div className="flex items-center gap-0.5">
                {showOrder ? <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${row.label} up`}
                  title={`Move ${row.label} up`}
                >
                  <ChevronUp className="size-4" />
                </Button> : null}
                {showOrder ? <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  aria-label={`Move ${row.label} down`}
                  title={`Move ${row.label} down`}
                >
                  <ChevronDown className="size-4" />
                </Button> : null}
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
              {resource === "distilleries" && name === "distilleryLinks" && (suggestions[row.id]?.length ?? 0) > 0 ? (
                <div className="basis-full pl-7 text-xs">
                  <span className="mr-2 text-muted-foreground">Common mashbills:</span>
                  {suggestions[row.id]!.map((suggestion) => (
                    <Button
                      key={suggestion.value}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-1 py-0 text-xs underline underline-offset-2"
                      disabled={chosenMashbillIds?.has(suggestion.value)}
                      onClick={() => addSuggestedMashbill(row, suggestion)}
                    >
                      {suggestion.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : undisclosedRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : null}

      <ReferenceCombobox
        id={`${name}-add`}
        labelledBy={`${name}-add-label`}
        resource={resource}
        {...(resource === null && name === "mashbillLinks" ? { detailResource: "mashbills" as const } : {})}
        options={selectable}
        {...(defaultCountry ? { defaultCountry } : {})}
        value={null}
        onChange={(next) => {
          if (next === null) return;
          const option = available.find((o) => o.value === next);
          if (!option) return;
          addRow(option);
        }}
        onOptionCreated={(option) => {
          setCreated((prev) => [...prev, option]);
          onOptionCreated?.(option);
          addRow(option);
        }}
        placeholder={`Add ${label.toLowerCase()}…`}
        {...(emptyHint ? { emptyHint } : {})}
      />
      <span id={`${name}-add-label`} className="sr-only">
        Add {label.toLowerCase()}
      </span>
      {editing && resource !== null && ["distilleries", "mashbills", "finishes"].includes(resource) ? (
        <CreateWithDetailsDialog
          resource={resource as "distilleries" | "mashbills" | "finishes"}
          open
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          initialName=""
          recordId={editing.id}
          {...(defaultCountry ? { defaultCountry } : {})}
          onCreated={(option) => {
            onChange(value.map((row) => row.id === editing.id ? { ...row, label: option.label } : row));
            setCreated((items) => [...items.filter((item) => item.value !== option.value), option]);
            onOptionCreated?.(option);
            setEditing(null);
          }}
        />
      ) : null}
      {undisclosable ? (
        <UndisclosedTick
          idPrefix={`${name}-undisclosed`}
          rows={undisclosedRows}
          onChange={(next) => onAllRowsChange([...value, ...next])}
        />
      ) : null}

      <input
        type="hidden"
        name={name}
        value={serializeLinks(allRows)}
      />
    </fieldset>
  );
}
