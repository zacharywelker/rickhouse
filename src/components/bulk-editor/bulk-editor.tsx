"use client";

import * as React from "react";
import Link from "next/link";
import { ColumnPicker, type PickerGroup } from "@/components/bulk/column-picker";
import { useHiddenColumns } from "@/components/bulk/use-hidden-columns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  columnsFor,
  DEFAULT_HIDDEN,
  normaliseView,
  SHEET_COLUMNS,
  sheetRows,
  type SheetBottle,
  type SheetColumn,
  type SheetContext,
  type SheetLabel,
  type SheetView,
} from "@/lib/bulk-editor/sheet";
import { cn } from "@/lib/utils";

const VIEW_KEY = "bulk-editor:view";
const HIDDEN_KEY = "bulk-editor:hidden";

/** Brand and Label are held at the left while the rest of the sheet scrolls. Widths are fixed so the second can sit against the first. */
const FROZEN: Record<string, { left: number; width: number }> = { brand: { left: 0, width: 130 }, name: { left: 130, width: 180 } };

/** Which of Labels and Bottles is on, remembered in this browser (like the Fields picker). Both, until chosen. */
function useView() {
  const [view, setView] = React.useState<SheetView>({ labels: true, bottles: true });
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable after hydration
      if (raw) setView(normaliseView(JSON.parse(raw) as Partial<SheetView>));
    } catch {
      // Unreadable or unavailable: both stay on.
    }
  }, []);
  const update = React.useCallback((next: SheetView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, JSON.stringify(next));
    } catch {
      // Not remembered this time.
    }
  }, []);
  return [view, update] as const;
}

function ViewToggle({ label, on, onlyOne, onClick }: { label: string; on: boolean; onlyOne: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      // The last one on cannot be switched off: the sheet always shows something.
      aria-disabled={on && onlyOne ? true : undefined}
      onClick={() => {
        if (!(on && onlyOne)) onClick();
      }}
      className={cn(
        "h-8 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        on ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-muted",
        on && onlyOne && "cursor-default",
      )}
    >
      {label}
    </button>
  );
}

const PICKER_GROUPS: ReadonlyArray<PickerGroup> = [
  { id: "label", title: "Label", columns: SHEET_COLUMNS.filter((c) => c.group === "label").map((c) => ({ id: c.id, label: c.label, locked: c.identity === true })) },
  { id: "bottle", title: "Bottle", columns: SHEET_COLUMNS.filter((c) => c.group === "bottle").map((c) => ({ id: c.id, label: c.label })) },
];
const PICKER_PRESETS = [
  { label: "Show all", ids: SHEET_COLUMNS.map((c) => c.id) },
  { label: "Defaults", ids: SHEET_COLUMNS.filter((c) => !c.defaultHidden).map((c) => c.id) },
];

/** The rule on a cell's left edge: none for the first, a faint one between columns, a dark one between the Label and Bottle groups. */
function ruleClass(index: number, column: SheetColumn, previous: SheetColumn | undefined) {
  if (index === 0) return "";
  return previous && previous.group !== column.group ? "border-l border-foreground" : "border-l border-border/40";
}

function frozenProps(column: SheetColumn, header: boolean) {
  const frozen = FROZEN[column.id];
  if (!frozen) return { className: "", style: undefined };
  return {
    // Held only where there is room for it: on a phone the two columns would be most of the screen.
    className: cn("md:sticky md:z-10 md:bg-card", !header && "md:group-hover:bg-muted", column.id === "name" && "md:shadow-[1px_0_0_var(--border)]"),
    style: { left: frozen.left, width: frozen.width, minWidth: frozen.width, maxWidth: frozen.width },
  };
}

/**
 * The bulk editor's sheet (#308). So far it only shows: one row per bottle, or per label, in the shelf order the
 * design asks for, with Brand and Label held at the left. Editing arrives in the steps after this one.
 */
export function BulkEditor({ labels, bottles, kinds, currency }: { labels: SheetLabel[]; bottles: SheetBottle[]; kinds: SheetContext["kinds"]; currency: string }) {
  const [view, setView] = useView();
  const [hidden, setHidden] = useHiddenColumns(HIDDEN_KEY, DEFAULT_HIDDEN);
  const context = React.useMemo<SheetContext>(() => ({ currency, kinds }), [currency, kinds]);

  const columns = React.useMemo(() => columnsFor(view, hidden), [view, hidden]);
  const rows = React.useMemo(() => sheetRows(view, labels, bottles), [view, labels, bottles]);
  const noun = view.bottles ? (rows.length === 1 ? "bottle" : "bottles") : rows.length === 1 ? "label" : "labels";

  // Brand and Label sit under one "Label" caption; the Bottle group has its own, after a dark rule.
  const frozenCount = columns.filter((c) => FROZEN[c.id]).length;
  const labelRest = columns.filter((c) => c.group === "label" && !FROZEN[c.id]).length;
  const bottleCount = columns.filter((c) => c.group === "bottle").length;

  return (
    <div className="min-w-0 border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5">
        <div role="group" aria-label="What the sheet shows" className="inline-flex divide-x divide-border border border-border">
          <ViewToggle label="Labels" on={view.labels} onlyOne={!view.bottles} onClick={() => setView({ ...view, labels: !view.labels })} />
          <ViewToggle label="Bottles" on={view.bottles} onlyOne={!view.labels} onClick={() => setView({ ...view, bottles: !view.bottles })} />
        </div>
        <ColumnPicker
          label="Fields"
          groups={PICKER_GROUPS}
          visible={new Set(SHEET_COLUMNS.filter((c) => !hidden.has(c.id)).map((c) => c.id))}
          onChange={(next) => setHidden(new Set(SHEET_COLUMNS.filter((c) => !c.identity && !next.has(c.id)).map((c) => c.id)))}
          presets={PICKER_PRESETS}
        />
        <p className="ml-auto text-sm text-muted-foreground" aria-live="off">
          {rows.length} {noun}
        </p>
      </div>

      <Table aria-label="Bulk editor" className="whitespace-nowrap tabular-nums">
        <TableHeader>
          <TableRow className="border-b-0 hover:bg-transparent">
            <TableHead colSpan={frozenCount} className="h-7 bg-card text-[11px] tracking-wider md:sticky md:left-0 md:z-10" style={{ minWidth: 310 }}>
              Label
            </TableHead>
            {labelRest > 0 ? <TableHead colSpan={labelRest} className="h-7 border-l border-border/40" /> : null}
            {bottleCount > 0 ? (
              <TableHead colSpan={bottleCount} className="h-7 border-l border-foreground text-[11px] tracking-wider">
                Bottle
              </TableHead>
            ) : null}
          </TableRow>
          <TableRow className="hover:bg-transparent">
            {columns.map((column, index) => {
              const frozen = frozenProps(column, true);
              return (
                <TableHead
                  key={column.id}
                  scope="col"
                  className={cn("font-medium", column.align === "right" && "text-right", ruleClass(index, column, columns[index - 1]), frozen.className)}
                  style={frozen.style}
                >
                  {column.label}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key} className="group">
              {columns.map((column, index) => {
                const cell = column.cell(row, context);
                const frozen = frozenProps(column, false);
                return (
                  <TableCell
                    key={column.id}
                    className={cn(
                      "h-9 py-0",
                      column.align === "right" && "text-right",
                      cell.muted && "text-muted-foreground",
                      column.identity && !cell.muted && "font-medium",
                      ruleClass(index, column, columns[index - 1]),
                      frozen.className,
                    )}
                    style={frozen.style}
                  >
                    <span className={cn("block truncate", !column.identity && "max-w-56")} title={cell.text}>
                      {cell.text}
                    </span>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
          {/* #311 makes this row live: typing here adds a row. Until then it only says so. */}
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columns.length} className="h-9 py-0 text-muted-foreground">
              {view.bottles ? "Add a bottle" : "Add a label"} (editing comes in the next steps)
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      {rows.length === 0 ? (
        <p className="border-t border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {view.bottles ? (
            <>
              No bottles on the shelf yet. <Link href="/bottles/new" className="underline">Add one</Link>, or switch to Labels.
            </>
          ) : (
            <>
              No labels yet. <Link href="/expressions/new" className="underline">Create one</Link>.
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
