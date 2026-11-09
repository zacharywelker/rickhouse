"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addFinishRow, effectiveRows, linesOf, totalsOf, withLines, type PairLineState } from "@/lib/expressions/finish-picker-model";
import { OrderedPicker, serializeLinks, type LinkedRow } from "./ordered-picker";

type PickerProps = Omit<React.ComponentProps<typeof OrderedPicker>, "value" | "onChange" | "renderRowExtra" | "footer" | "hiddenValue" | "lockedAmounts">;

const SHARE_BOX = "h-8 w-[calc(3ch_+_0.75rem_+_2px)] px-1.5 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/**
 * The Finishes field of a label: each finish says which mashbill it went on and how much of the blend
 * that is, and the part of the blend that was not finished can be added as a row of its own. Wraps
 * `OrderedPicker` for adding, removing, ordering and months; everything about pairs lives here.
 */
export function FinishPicker({ finishes, mashbills, onChange, ...picker }: { finishes: LinkedRow[]; mashbills: LinkedRow[]; onChange: (rows: LinkedRow[]) => void } & PickerProps) {
  const ids = mashbills.map((row) => row.id);
  const real = finishes.filter((row) => !row.unfinished);
  const unfinished = finishes.find((row) => row.unfinished);
  const everything = [...real, ...(unfinished ? [unfinished] : [])];
  const totals = totalsOf(everything, ids);
  const showShares = everything.length >= 2;
  const nameOf = (id: number) => mashbills.find((row) => row.id === id)?.label ?? "Mashbill";

  const emit = (nextReal: LinkedRow[], nextUnfinished: LinkedRow | undefined) => onChange([...nextReal, ...(nextUnfinished ? [nextUnfinished] : [])]);
  const setLines = (row: LinkedRow, lines: PairLineState[]) => {
    const next = withLines(row, lines);
    if (row.unfinished) emit(real, next);
    else emit(real.map((candidate) => (candidate.id === row.id ? next : candidate)), unfinished);
  };

  // A plain function, not a component: a component defined here would remount on every keystroke and drop focus.
  const autoUnfinished = effectiveRows(everything, ids).find((row) => row.unfinished)?.mashbills?.[0]?.share;
  const pairLines = (row: LinkedRow) => {
    const lines = linesOf(row, ids);
    const several = ids.length >= 2;
    const multi = lines.length > 1;
    const shareShown = showShares || multi;
    const addLine = () => setLines(row, [...lines, { id: ids.find((id) => !lines.some((line) => line.id === id))!, share: "" }]);
    const canAdd = several && lines.length < ids.length;
    const setLine = (index: number, patch: Partial<PairLineState>) => setLines(row, lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
    if (ids.length === 0) return null;
    if (lines.length === 0) {
      return several ? (
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor={`finish-${row.id}-mashbill-new`}>Mashbill</label>
          <select id={`finish-${row.id}-mashbill-new`} value="" onChange={(event) => setLines(row, [{ id: Number(event.target.value), share: "" }])} className="h-8 border border-input bg-card px-2 text-xs">
            <option value="">Not set</option>
            {mashbills.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
      ) : null;
    }
    return (
      <div className="flex flex-col gap-1.5">
        {lines.map((line, index) => (
          <div key={line.id} className="flex flex-wrap items-center gap-2 text-xs">
            {several ? (
              <>
                <label htmlFor={`finish-${row.id}-mashbill-${index}`}>Mashbill</label>
                <select id={`finish-${row.id}-mashbill-${index}`} value={line.id}
                  onChange={(event) => setLine(index, { id: Number(event.target.value) })} className="h-8 border border-input bg-card px-2 text-xs">
                  {mashbills.filter((option) => option.id === line.id || !lines.some((other) => other.id === option.id)).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </>
            ) : null}
            {shareShown ? (
              <>
                <label htmlFor={`finish-${row.id}-share-${index}`} className="sr-only">Share of {row.label} on {nameOf(line.id)}</label>
                <Input id={`finish-${row.id}-share-${index}`} type="number" min={0} max={100} step={1} inputMode="numeric" value={line.share}
                  placeholder={row.unfinished && !multi ? autoUnfinished : undefined}
                  onChange={(event) => setLine(index, { share: event.target.value })} className={SHARE_BOX} />
                <span className="text-muted-foreground">%</span>
              </>
            ) : null}
            {!multi && canAdd ? <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-xs text-muted-foreground underline underline-offset-2" onClick={addLine}>+ Add mashbill</Button> : null}
            {multi ? <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${nameOf(line.id)} from ${row.label}`} onClick={() => setLines(row, lines.filter((_, i) => i !== index))}><X className="size-4" /></Button> : null}
          </div>
        ))}
        {multi && canAdd ? (
          <Button type="button" variant="outline" size="sm" className="h-7 w-fit px-2 text-xs" onClick={addLine}>
            + Add mashbill
          </Button>
        ) : null}
        {multi ? <p className="text-xs text-muted-foreground">{row.label} total: <span className="tabular-nums text-foreground">{withLines(row, lines).share || "—"}{withLines(row, lines).share ? "%" : ""}</span></p> : null}
      </div>
    );
  };

  const footer = (
    <>
      {unfinished ? (
        <div className="flex flex-col gap-2 border border-dashed border-border p-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="grow">No finish <span className="ml-1 border border-border px-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">unfinished</span></span>
            <Button type="button" variant="ghost" size="sm" aria-label="Remove the unfinished portion" onClick={() => emit(real, undefined)}><X className="size-4" /></Button>
          </div>
          {pairLines(unfinished)}
          <p className="text-xs text-muted-foreground">Fills whatever is left. Type a share to set it yourself.</p>
        </div>
      ) : ids.length > 0 && real.length > 0 ? (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => emit(real, { id: 0, label: "No finish", amount: "", unfinished: true, mashbills: ids.length >= 2 ? [{ id: ids[0]!, share: "" }] : undefined })}>
          + Add unfinished portion
        </Button>
      ) : null}
      {totals.started || totals.error ? (
        <div className="flex items-center justify-between border-t border-border pt-2 text-sm" role="status">
          <span>Total of the blend</span>
          {totals.error ? <span className="font-semibold text-destructive">{totals.error}</span> : <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{totals.total}% ✓</span>}
        </div>
      ) : null}
    </>
  );

  return (
    <OrderedPicker
      {...picker}
      value={real}
      onChange={(rows) => emit(rows.map((row) => (finishes.some((existing) => existing.id === row.id) ? row : addFinishRow(row, ids))), unfinished)}
      renderRowExtra={pairLines}
      footer={footer}
      hiddenValue={serializeLinks(effectiveRows(everything, ids))}
    />
  );
}
