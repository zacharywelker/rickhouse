"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReferenceCombobox } from "@/components/admin/reference-combobox";
import { linksPayload } from "@/lib/expressions/links";
import { UndisclosedTick } from "./undisclosed-tick";
import type { CategoryKind } from "@/lib/expressions/rules";
import type { Option, ReferenceResource } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { CHIP } from "@/components/sheet/chip-styles";
import { quickCreateAction } from "@/app/(app)/admin/actions";
import { CreateWithDetailsDialog } from "@/components/admin/create-with-details-dialog";

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
  /** Finishes only: this finish's share of the label, a whole percentage as text. */
  share?: string;
  /** Finishes only: one line per mashbill it went on. Absent means the label's first mashbill. */
  mashbills?: { id: number; share: string }[];
  /** Finishes only: the part of the blend that was not finished (id 0). */
  unfinished?: boolean;
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
  undisclosable = false,
  onOptionCreated,
  defaultCountry,
  detailNoun,
  detailKind,
  detailCategory,
  brand,
  matchesOption,
  renderRowExtra,
  footer,
  hiddenValue,
  lockedAmounts,
  maxRows,
  suggestions,
  table,
  sheet = false,
}: {
  name: string;
  label: string;
  description: string;
  resource: ReferenceResource | null;
  options: Option[];
  defaultCountry?: string;
  /** "cask type" where a finish is called that; passed to the add-details popup. */
  detailNoun?: string;
  /** The label's spirit, passed to the add-details popup. */
  detailKind?: CategoryKind;
  /** "bourbon" or "rye" for a mashbill picker, passed to the add-mashbill popup's recipe warning. */
  detailCategory?: string;
  brand?: Option;
  matchesOption?: (option: Option) => boolean;
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
  /** Extra content under a row's controls, for a caller that knows more about its rows (a finish's mashbills). */
  renderRowExtra?: (row: LinkedRow) => React.ReactNode;
  /** Content under the add box, inside the fieldset. */
  footer?: React.ReactNode;
  /** What the hidden input submits, when the caller holds more than the rows shown (the unfinished portion). */
  hiddenValue?: string;
  /** Rows whose amount is computed elsewhere: shown read-only instead of as a box. */
  lockedAmounts?: Record<number, string>;
  /** The most rows the list takes: the add box goes once it is full. */
  maxRows?: number;
  /** Names offered as one-click buttons under the add box: an existing option of that name is added, else one is created. */
  suggestions?: ReadonlyArray<string>;
  /** The data-sheet look: the list as a table under column headings (the mockup's Distilled by and Mashbill), with a dashed add bar. */
  table?: { name: string; third: string; add: string };
  /** The data-sheet look, without the table: no box and no visible legend or description (the finish list). */
  sheet?: boolean;
}) {
  const [notDisclosed, setNotDisclosed] = React.useState(false);
  const [created, setCreated] = React.useState<Option[]>([]);
  const [editing, setEditing] = React.useState<LinkedRow | null>(null);
  const [optionNotice, setOptionNotice] = React.useState("");
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
    (option) => !chosen.has(option.value) && !(undisclosable && option.undisclosed) && (matchesOption?.(option) ?? true),
  );
  const soloDistillery = distilleryChoices?.length === 1 ? distilleryChoices[0]! : null;
  const move = (index: number, delta: number) => {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row!);
    onChange(next);
  };

  const full = maxRows !== undefined && value.length >= maxRows;
  const [suggesting, setSuggesting] = React.useState(false);
  const addSuggestion = async (name: string) => {
    if (resource === null || suggesting) return;
    const existing = available.find((option) => option.label.trim().toLowerCase() === name.toLowerCase());
    if (existing) { addRow(existing); return; }
    setSuggesting(true);
    const result = await quickCreateAction(resource, name);
    setSuggesting(false);
    if (!result.ok) { setOptionNotice(result.error); return; }
    setCreated((prev) => [...prev, result.option]);
    onOptionCreated?.(result.option);
    addRow(result.option);
  };

  const addRow = (option: Option) => {
    // "Use it" in an add-details popup can hand back a row this label already has.
    if (value.some((row) => row.id === option.value)) return;
    setOptionNotice("");
    const distilleryId = soloDistillery ? soloDistillery.id : null;
    onChange([
      ...value,
      { id: option.value, label: option.label, hint: option.hint, amount: "", distilleryId, undisclosed: option.undisclosed },
    ]);
  };

  const Box: React.ElementType = sheet ? "div" : "fieldset";
  if (table) {
    const shares = amountSuffix === "%" && showAmount && value.length >= 2 ? value.map((row) => Number(lockedAmounts?.[row.id] ?? row.amount)) : null;
    const total = shares ? Math.round(shares.reduce((sum, share) => sum + (Number.isFinite(share) ? share : 0), 0) * 100) / 100 : null;
    const placeOpen = undisclosable && (notDisclosed || undisclosedRows.length > 0);
    const th = "border-b border-foreground pb-0.5 pr-2 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground";
    const td = "border-b border-border py-[3px] pr-2 align-middle";
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="sr-only">{label}</span>
        {value.length > 0 ? (
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className={th}>{table.name}</th>
                {showAmount ? <th className={cn(th, "text-right")}>{amountLabel}</th> : null}
                <th className={th}>{table.third}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {value.map((row, index) => (
                <React.Fragment key={row.id}>
                  <tr>
                    <td className={td}>
                      {row.label}
                      {row.hint && !row.undisclosed ? <span className="ml-1.5 text-[11px] text-muted-foreground">{row.hint}</span> : null}
                    </td>
                    {showAmount ? (
                      <td className={cn(td, "whitespace-nowrap text-right")}>
                        {(amountSuffix !== "%" || value.length >= 2) ? (lockedAmounts?.[row.id] !== undefined ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground"><span className="border border-dashed border-foreground bg-muted px-1.5 tabular-nums text-foreground">{lockedAmounts[row.id]}{amountSuffix}</span> from finishes</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <input
                              id={`${name}-amount-${row.id}`} aria-label={`${amountLabel} of ${row.label}`} type="number" min={0} max={amountMax} step={1} inputMode="numeric"
                              value={row.amount} onChange={(e) => onChange(value.map((r) => (r.id === row.id ? { ...r, amount: e.target.value } : r)))}
                              className="h-7 w-[42px] border border-foreground bg-card px-1.5 text-right text-[13px] font-medium tabular-nums outline-none [appearance:textfield] focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <span className="text-muted-foreground">{amountSuffix}</span>
                          </span>
                        )) : null}
                      </td>
                    ) : null}
                    <td className={td}>
                      {inferable && !row.undisclosed ? (
                        <span role="radiogroup" aria-label={`Source of ${row.label}`} className="inline-flex border border-foreground">
                          {([["Stated", false], ["Inferred", true]] as const).map(([text, inferred]) => (
                            <button
                              key={text} type="button" role="radio" aria-checked={(row.inferred === true) === inferred}
                              onClick={() => onChange(value.map((r) => (r.id === row.id ? { ...r, inferred } : r)))}
                              className={cn("inline-flex h-[23px] items-center px-[9px] text-[11.5px]", (row.inferred === true) === inferred ? "bg-foreground text-background" : "bg-card")}
                            >{text}</button>
                          ))}
                        </span>
                      ) : distilleryChoices && distilleryChoices.length > 1 ? (
                        <label className={cn(CHIP, "h-[23px]")}>
                          <span className="sr-only">Distillery of {row.label}</span>
                          <select
                            id={`${name}-distillery-${row.id}`} value={row.distilleryId ?? ""}
                            onChange={(e) => onChange(value.map((r) => (r.id === row.id ? { ...r, distilleryId: e.target.value === "" ? null : Number(e.target.value) } : r)))}
                            className="min-w-0 border-0 bg-transparent p-0 text-[12px] font-semibold outline-none"
                          >
                            <option value="">Not tied to one</option>
                            {distilleryChoices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </label>
                      ) : soloDistillery ? <span className="text-[11.5px] text-muted-foreground">from {soloDistillery.name}</span> : null}
                    </td>
                    <td className={cn(td, "whitespace-nowrap pr-0 text-right text-muted-foreground")}>
                      {resource !== null && ["distilleries", "mashbills", "finishes"].includes(resource) ? (
                        <button type="button" aria-label={`Edit ${row.label} details`} title={`Edit ${row.label} details`} onClick={() => setEditing(row)} className="p-1 hover:text-foreground"><Pencil className="size-3.5" /></button>
                      ) : null}
                      {showOrder ? <button type="button" aria-label={`Move ${row.label} up`} title={`Move ${row.label} up`} disabled={index === 0} onClick={() => move(index, -1)} className="p-1 hover:text-foreground disabled:opacity-30"><ChevronUp className="size-3.5" /></button> : null}
                      {showOrder ? <button type="button" aria-label={`Move ${row.label} down`} title={`Move ${row.label} down`} disabled={index === value.length - 1} onClick={() => move(index, 1)} className="p-1 hover:text-foreground disabled:opacity-30"><ChevronDown className="size-3.5" /></button> : null}
                      <button type="button" aria-label={`Remove ${row.label}`} onClick={() => onChange(value.filter((r) => r.id !== row.id))} className="p-1 hover:text-foreground"><X className="size-3.5" /></button>
                    </td>
                  </tr>
                  {renderRowExtra ? (
                    <tr><td colSpan={showAmount ? 4 : 3} className="pb-1.5 pt-0 text-[11.5px] text-muted-foreground">{renderRowExtra(row)}</td></tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        ) : null}
        <div className="flex items-center gap-3">
          <div className="flex h-[27px] min-w-0 flex-1 items-center gap-2 border border-dashed border-foreground px-2">
            <ReferenceCombobox
              id={`${name}-add`} labelledBy={`${name}-add-label`} resource={resource}
              {...(resource === null && name === "mashbillLinks" ? { detailResource: "mashbills" as const } : {})}
              options={selectable} brand={brand}
              {...(defaultCountry ? { defaultCountry } : {})} {...(detailNoun ? { detailNoun } : {})} {...(detailKind ? { detailKind } : {})} {...(detailCategory ? { detailCategory } : {})}
              value={null}
              onChange={(next) => {
                if (next === null) return;
                const option = selectable.find((o) => o.value === next);
                if (option) addRow(option);
              }}
              onOptionCreated={(option) => {
                setCreated((prev) => [...prev, option]);
                onOptionCreated?.(option);
                if (matchesOption && !matchesOption(option)) { setOptionNotice("Saved. This mashbill does not match the selected category."); return; }
                addRow(option);
              }}
              placeholder={table.add}
              {...(emptyHint ? { emptyHint } : {})}
              chip="bar"
            />
            {undisclosable ? (
              <button
                type="button" aria-expanded={placeOpen}
                onClick={() => { if (placeOpen) { setNotDisclosed(false); onAllRowsChange(allRows.filter((row) => !row.undisclosed)); } else setNotDisclosed(true); }}
                className="ml-auto shrink-0 text-[12px] text-foreground underline"
              >or not disclosed (pick the place)</button>
            ) : null}
          </div>
          {total !== null ? (
            <span className={cn("whitespace-nowrap text-[12px] font-semibold", Math.abs(total - 100) <= 0.5 ? "text-[#1c6b3a]" : "text-muted-foreground")}>{total}%{Math.abs(total - 100) <= 0.5 ? " ✓" : ""}</span>
          ) : null}
        </div>
        <span id={`${name}-add-label`} className="sr-only">Add {label.toLowerCase()}</span>
        {optionNotice ? <p role="status" className="text-xs text-muted-foreground">{optionNotice}</p> : null}
        {footer}
        {placeOpen ? <UndisclosedTick idPrefix={`${name}-undisclosed`} rows={undisclosedRows} open onChange={(next) => onAllRowsChange([...value, ...next])} /> : null}
        {editing && resource !== null && ["distilleries", "mashbills", "finishes"].includes(resource) ? (
          <CreateWithDetailsDialog
            resource={resource as "distilleries" | "mashbills" | "finishes"} open onOpenChange={(open) => { if (!open) setEditing(null); }}
            initialName="" recordId={editing.id} {...(defaultCountry ? { defaultCountry } : {})}
            onCreated={(option) => {
              onChange(value.map((row) => row.id === editing.id ? { ...row, label: option.label } : row));
              setCreated((items) => [...items.filter((item) => item.value !== option.value), option]);
              onOptionCreated?.(option);
              setEditing(null);
            }}
          />
        ) : null}
        <input type="hidden" name={name} value={hiddenValue ?? serializeLinks(allRows)} />
      </div>
    );
  }

  return (
    <Box className={sheet ? "flex min-w-0 flex-col gap-2" : "col-span-full flex flex-col gap-3 border border-border p-4"}>
      {sheet ? <span className="sr-only">{label}</span> : <legend className="px-1 text-sm font-medium">{label}</legend>}
      {sheet ? null : <p className="-mt-1 text-xs text-muted-foreground">{description}</p>}

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

              {/* A share box only means something when there is more than one row to share between. */}
              {showAmount && (amountSuffix !== "%" || value.length >= 2) ? (lockedAmounts?.[row.id] !== undefined ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="border border-dashed border-border bg-muted px-2 py-1 tabular-nums text-foreground">{lockedAmounts[row.id]}{amountSuffix}</span>
                  from finishes
                </div>
              ) : <div className="flex items-center gap-1">
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
              </div>) : null}

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
              {renderRowExtra ? <div className="basis-full pl-7">{renderRowExtra(row)}</div> : null}
            </li>
          ))}
        </ol>
      ) : undisclosedRows.length === 0 ? (
        sheet ? <span className={cn(CHIP, "w-fit bg-muted font-semibold")}>None ✓</span> : <p className="text-sm text-muted-foreground">None yet.</p>
      ) : null}

      {full ? null : <div className={sheet ? "flex h-[27px] min-w-0 items-center border border-dashed border-foreground px-2" : undefined}><ReferenceCombobox
        id={`${name}-add`}
        labelledBy={`${name}-add-label`}
        resource={resource}
        {...(resource === null && name === "mashbillLinks" ? { detailResource: "mashbills" as const } : {})}
        options={selectable}
        brand={brand}
        {...(defaultCountry ? { defaultCountry } : {})}
        {...(detailNoun ? { detailNoun } : {})}
        {...(detailKind ? { detailKind } : {})}
        {...(detailCategory ? { detailCategory } : {})}
        value={null}
        onChange={(next) => {
          if (next === null) return;
          const option = selectable.find((o) => o.value === next);
          if (!option) return;
          addRow(option);
        }}
        onOptionCreated={(option) => {
          setCreated((prev) => [...prev, option]);
          onOptionCreated?.(option);
          if (matchesOption && !matchesOption(option)) {
            setOptionNotice("Saved. This mashbill does not match the selected category.");
            return;
          }
          addRow(option);
        }}
        placeholder={sheet ? (label === "Finishes" ? "+ Finish (in order, with months)" : `+ ${label}`) : `Add ${label.toLowerCase()}…`}
        {...(emptyHint ? { emptyHint } : {})}
        {...(sheet ? { chip: "bar" as const } : {})}
      /></div>}
      {!full && suggestions && suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Suggested:</span>
          {suggestions.map((suggestion) => (
            <Button key={suggestion} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={suggesting} onClick={() => void addSuggestion(suggestion)}>{suggestion}</Button>
          ))}
        </div>
      ) : null}
      <span id={`${name}-add-label`} className="sr-only">
        Add {label.toLowerCase()}
      </span>
      {optionNotice ? <p role="status" className="text-xs text-muted-foreground">{optionNotice}</p> : null}
      {footer}
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
        value={hiddenValue ?? serializeLinks(allRows)}
      />
    </Box>
  );
}
