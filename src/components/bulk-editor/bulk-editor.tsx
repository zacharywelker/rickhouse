"use client";

import * as React from "react";
import Link from "next/link";
import { ColumnPicker, type PickerGroup } from "@/components/bulk/column-picker";
import { GridCell } from "@/components/bulk/grid-cell";
import { useHiddenColumns } from "@/components/bulk/use-hidden-columns";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { countEdits, editorFor, parseCell, setEdit, type CellEditor, type Edits } from "@/lib/bulk-editor/editors";
import { arrowMove, enterMove, tabMove, type ArrowKey, type Moved, type Pos } from "@/lib/bulk-editor/nav";
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
  type SheetRow,
  type SheetView,
} from "@/lib/bulk-editor/sheet";
import { cn } from "@/lib/utils";

const VIEW_KEY = "bulk-editor:view";
const HIDDEN_KEY = "bulk-editor:hidden";

/** Brand and Label are held at the left while the rest of the sheet scrolls. Widths are fixed so the second can sit against the first. */
const FROZEN: Record<string, { left: number; width: number }> = { brand: { left: 0, width: 130 }, name: { left: 130, width: 180 } };

const ARROWS = new Set<string>(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);

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
    // Held only where there is room for it: on a phone the two columns would be most of the screen. A frozen header
    // cell is already sticky at the top, and sits above both the other headers and the frozen body cells.
    className: header
      ? cn("md:z-30", column.id === "name" && "md:shadow-[1px_0_0_var(--border),0_1px_0_var(--border)]")
      : cn("md:sticky md:z-10 md:bg-card md:group-hover:bg-muted", column.id === "name" && "md:shadow-[1px_0_0_var(--border)]"),
    style: { left: frozen.left, width: frozen.width, minWidth: frozen.width, maxWidth: frozen.width },
  };
}

/** Header cells stay at the top of the sheet while its rows scroll (the sheet scrolls inside its own box from `md` up). */
const HEAD_CELL = "sticky z-20 bg-card shadow-[0_1px_0_var(--border)]";

type Editing = { value: string; /** Typing started it, so the caret goes after the character instead of selecting the old value. */ replace: boolean };
type Finish = { cancel: true; focus: boolean } | { value: string; move: "stay" | "down" | "up" | "next" | "prev"; focus: boolean };

/**
 * The one live editor: the form's own field control for the cell, mounted over the active cell only. It is positioned
 * over the cell instead of inside it, so opening it never changes a column's width or moves a row.
 */
function ActiveEditor({ editor, initial, error, onFinish, onInvalid }: { editor: CellEditor; initial: Editing; error: string | null; onFinish: (finish: Finish) => void; onInvalid: (message: string) => void }) {
  const [draft, setDraft] = React.useState(initial.value);
  const input = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const el = input.current;
    if (!(el instanceof HTMLInputElement)) return;
    el.focus();
    if (!initial.replace) el.select();
    else {
      try {
        el.setSelectionRange(el.value.length, el.value.length);
      } catch {
        // A number input has no caret to place; the typed character is already in it.
      }
    }
  }, [initial.replace]);

  function commit(move: Extract<Finish, { move: unknown }>["move"], focus: boolean) {
    const parsed = parseCell(editor, draft);
    if (!parsed.ok) {
      onInvalid(parsed.message);
      return;
    }
    onFinish({ value: parsed.value, move, focus });
  }

  return (
    <div
      className="absolute left-0 top-0 z-20 h-9 w-max min-w-full max-w-72 bg-card"
      style={{ minWidth: "max(100%, 7rem)" }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          commit(event.shiftKey ? "up" : "down", true);
        } else if (event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          commit(event.shiftKey ? "prev" : "next", true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onFinish({ cancel: true, focus: true });
        }
      }}
      onBlur={(event) => {
        // Clicking away keeps what was typed, if it is valid; a slip is dropped rather than left stuck open.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        const parsed = parseCell(editor, draft);
        if (parsed.ok) onFinish({ value: parsed.value, move: "stay", focus: false });
        else onFinish({ cancel: true, focus: false });
      }}
    >
      <GridCell
        // A number is typed into a text box: a number input throws away a lone "-" or "." as it is typed, so ".75"
        // would arrive as "75". The checker (`parseCell`) still holds it to the field's own range.
        spec={editor.spec.kind === "number" ? { kind: "text", name: editor.spec.name, label: editor.spec.label } : editor.spec}
        id={`bulk-editor-edit-${editor.column}`}
        labelledBy={`bulk-editor-col-${editor.column}`}
        value={draft}
        onChange={(value) => setDraft(String(value))}
        invalid={error !== null}
        inputRef={(el) => {
          input.current = el;
        }}
        className="h-9 w-full rounded-none"
      />
      {error ? (
        <p role="alert" className="absolute left-0 top-full z-30 mt-px whitespace-nowrap border border-destructive bg-card px-2 py-0.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type RowProps = {
  row: SheetRow;
  rowIndex: number;
  columns: SheetColumn[];
  view: SheetView;
  context: SheetContext;
  rowEdits: Readonly<Record<string, string>> | undefined;
  /** The active cell's column, or -1 when this row has none. */
  activeCol: number;
  /** Only passed to the active row, so no other row re-renders when the cursor moves. */
  editing: Editing | null;
  error: string | null;
  onFinish: ((finish: Finish) => void) | undefined;
  onInvalid: ((message: string) => void) | undefined;
};

/** A row of text cells. Memoised: moving between cells re-renders two rows, not the whole sheet. */
const SheetRowView = React.memo(function SheetRowView({ row, rowIndex, columns, view, context, rowEdits, activeCol, editing, error, onFinish, onInvalid }: RowProps) {
  return (
    <TableRow key={row.key} className="group">
      {columns.map((column, index) => {
        const editor = editorFor(column, view, row);
        const edited = rowEdits?.[column.id];
        const cell = edited !== undefined && editor ? editor.display(edited, context, row) : column.cell(row, context);
        const frozen = frozenProps(column, false);
        const isActive = index === activeCol;
        const isEditing = isActive && editing !== null && editor !== null;
        return (
          <TableCell
            key={column.id}
            role="gridcell"
            tabIndex={isActive || (activeCol === -1 && rowIndex === 0 && index === 0) ? 0 : -1}
            aria-selected={isActive || undefined}
            aria-readonly={editor ? undefined : true}
            data-r={rowIndex}
            data-c={index}
            className={cn(
              "relative h-9 border-b border-border py-0 focus:outline-none",
              column.align === "right" && "text-right",
              cell.muted && "text-muted-foreground",
              column.identity && !cell.muted && "font-medium",
              edited !== undefined && "bg-muted",
              editor && "cursor-cell",
              isActive && !isEditing && "outline outline-2 -outline-offset-2 outline-ring",
              ruleClass(index, column, columns[index - 1]),
              frozen.className,
            )}
            style={frozen.style}
          >
            <span className={cn("block truncate", !column.identity && "max-w-56", isEditing && "invisible")} title={cell.text}>
              {cell.text}
            </span>
            {isEditing && editing && editor && onFinish && onInvalid ? (
              <ActiveEditor editor={editor} initial={editing} error={error} onFinish={onFinish} onInvalid={onInvalid} />
            ) : null}
          </TableCell>
        );
      })}
    </TableRow>
  );
});

/**
 * The bulk editor's sheet (#308). One row per bottle, or per label, in shelf order, with Brand and Label held at the
 * left. You can move around it and edit the plain cells from the keyboard: arrows, Tab and Enter, F2 or a keystroke to
 * edit, Escape to cancel. Edits are kept here, in the browser, and marked; saving them arrives in a later step.
 */
export function BulkEditor({ labels, bottles, kinds, currency }: { labels: SheetLabel[]; bottles: SheetBottle[]; kinds: SheetContext["kinds"]; currency: string }) {
  const [view, setView] = useView();
  const [hidden, setHidden] = useHiddenColumns(HIDDEN_KEY, DEFAULT_HIDDEN);
  const context = React.useMemo<SheetContext>(() => ({ currency, kinds }), [currency, kinds]);

  const columns = React.useMemo(() => columnsFor(view, hidden), [view, hidden]);
  const rows = React.useMemo(() => sheetRows(view, labels, bottles), [view, labels, bottles]);
  const noun = view.bottles ? (rows.length === 1 ? "bottle" : "bottles") : rows.length === 1 ? "label" : "labels";

  const [active, setActive] = React.useState<Pos | null>(null);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [edits, setEdits] = React.useState<Edits>({});
  /** The column a run of Tabs started in, which Enter returns to on the next row. */
  const anchorCol = React.useRef(0);
  const focusAfter = React.useRef(true);
  const sheetRef = React.useRef<HTMLDivElement>(null);

  const dims = { rows: rows.length, cols: columns.length };
  // The view or the columns can change under the cursor; keep it on the sheet.
  const current: Pos | null = active && dims.rows > 0 && dims.cols > 0 ? { row: Math.min(active.row, dims.rows - 1), col: Math.min(active.col, dims.cols - 1) } : null;

  const editorAt = (pos: Pos): CellEditor | null => {
    const row = rows[pos.row];
    const column = columns[pos.col];
    return row && column ? editorFor(column, view, row) : null;
  };
  const valueAt = (pos: Pos): string => {
    const row = rows[pos.row]!;
    const editor = editorAt(pos);
    return editor ? (edits[row.key]?.[columns[pos.col]!.id] ?? editor.initial(row)) : "";
  };

  function go(moved: Moved) {
    if ("leave" in moved) return;
    focusAfter.current = true;
    setActive(moved.pos);
    anchorCol.current = moved.anchorCol;
  }

  function startEdit(pos: Pos, replace: boolean, typed?: string) {
    setActive(pos);
    setError(null);
    setEditing({ value: replace ? (typed ?? "") : valueAt(pos), replace });
  }

  function stage(pos: Pos, value: string) {
    const row = rows[pos.row];
    const column = columns[pos.col];
    const editor = editorAt(pos);
    if (!row || !column || !editor) return;
    setEdits((prev) => setEdit(prev, row.key, column.id, value, editor.initial(row)));
  }

  function finish(result: Finish) {
    if (!current) return;
    focusAfter.current = result.focus;
    setEditing(null);
    setError(null);
    if ("cancel" in result) return;
    stage(current, result.value);
    const canLand = (pos: Pos) => editorAt(pos) !== null;
    if (result.move === "down" || result.move === "up") go(enterMove(current, anchorCol.current, result.move === "up", dims));
    else if (result.move === "next" || result.move === "prev") go(tabMove(current, result.move === "prev", dims, canLand, anchorCol.current));
  }

  function cellOf(target: EventTarget): { pos: Pos; direct: boolean } | null {
    const td = (target as HTMLElement).closest<HTMLElement>("td[data-r]");
    if (!td) return null;
    return { pos: { row: Number(td.dataset.r), col: Number(td.dataset.c) }, direct: td === target };
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTableSectionElement>) {
    // While editing, the editor has the keys.
    if (editing) return;
    const hit = cellOf(event.target);
    if (!hit?.direct) return;
    const { pos } = hit;
    const { key } = event;

    if (ARROWS.has(key)) {
      event.preventDefault();
      go(arrowMove(pos, key as ArrowKey, dims, event.ctrlKey || event.metaKey));
    } else if (key === "Tab") {
      const moved = tabMove(pos, event.shiftKey, dims, (p) => editorAt(p) !== null, anchorCol.current);
      // Off either end: let the browser take focus out of the sheet.
      if (!("leave" in moved)) {
        event.preventDefault();
        go(moved);
      }
    } else if (key === "Enter" || key === "F2") {
      if (editorAt(pos)) {
        event.preventDefault();
        startEdit(pos, false);
      }
    } else if (key === "Delete" || key === "Backspace") {
      const editor = editorAt(pos);
      if (editor && !editor.required) {
        event.preventDefault();
        stage(pos, "");
      }
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const editor = editorAt(pos);
      if (editor) {
        event.preventDefault();
        startEdit(pos, editor.typeToReplace, editor.typeToReplace ? key : undefined);
      }
    }
  }

  function onFocus(event: React.FocusEvent<HTMLTableSectionElement>) {
    const hit = cellOf(event.target);
    if (!hit?.direct) return;
    // Focus arriving by a click, or by Tab from outside, picks the cell and starts a new run from its column.
    if (!current || current.row !== hit.pos.row || current.col !== hit.pos.col) {
      setActive(hit.pos);
      anchorCol.current = hit.pos.col;
    }
  }

  function onDoubleClick(event: React.MouseEvent<HTMLTableSectionElement>) {
    const hit = cellOf(event.target);
    if (hit && editorAt(hit.pos)) startEdit(hit.pos, false);
  }

  // Put the browser's focus on the active cell after a move, and keep it in view.
  React.useEffect(() => {
    if (!current || editing) return;
    if (!focusAfter.current) {
      focusAfter.current = true;
      return;
    }
    const el = sheetRef.current?.querySelector<HTMLElement>(`td[data-r="${current.row}"][data-c="${current.col}"]`);
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    // The cursor's position is what matters, not the object that holds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.row, current?.col, editing]);

  const unsaved = countEdits(edits);

  // Brand and Label sit under one "Label" caption; the Bottle group has its own, after a dark rule.
  const frozenCount = columns.filter((c) => FROZEN[c.id]).length;
  const labelRest = columns.filter((c) => c.group === "label" && !FROZEN[c.id]).length;
  const bottleCount = columns.filter((c) => c.group === "bottle").length;

  return (
    <div
      ref={sheetRef}
      // From md up the sheet scrolls inside a box that fits the screen, so the headers stay put and the keyboard's
      // scroll-into-view keeps the active cell clear of them and of the frozen columns.
      className="min-w-0 border border-border bg-card md:[&>.overflow-x-auto]:max-h-[calc(100dvh-19.5rem)] md:[&>.overflow-x-auto]:min-h-80 md:[&>.overflow-x-auto]:overflow-y-auto md:[&>.overflow-x-auto]:scroll-pl-[310px] md:[&>.overflow-x-auto]:scroll-pt-16"
    >
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
        {unsaved > 0 ? (
          <p role="status" className="flex items-center gap-2 text-sm">
            {unsaved} {unsaved === 1 ? "change" : "changes"} not saved yet (saving comes in a later step)
            <Button type="button" variant="outline" size="sm" onClick={() => setEdits({})}>
              Discard
            </Button>
          </p>
        ) : null}
        <p className="ml-auto text-sm text-muted-foreground" aria-live="off">
          {rows.length} {noun}
        </p>
      </div>

      <Table role="grid" aria-label="Bulk editor" aria-rowcount={rows.length + 1} className="border-separate border-spacing-0 whitespace-nowrap tabular-nums">
        <TableHeader>
          <TableRow className="border-b-0 hover:bg-transparent">
            <TableHead colSpan={frozenCount} className="sticky top-0 z-30 h-7 bg-card text-[11px] tracking-wider md:left-0" style={{ minWidth: 310 }}>
              Label
            </TableHead>
            {labelRest > 0 ? <TableHead colSpan={labelRest} className="sticky top-0 z-20 h-7 border-l border-border/40 bg-card" /> : null}
            {bottleCount > 0 ? (
              <TableHead colSpan={bottleCount} className="sticky top-0 z-20 h-7 border-l border-foreground bg-card text-[11px] tracking-wider">
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
                  id={`bulk-editor-col-${column.id}`}
                  scope="col"
                  className={cn(HEAD_CELL, "top-7 font-medium", column.align === "right" && "text-right", ruleClass(index, column, columns[index - 1]), frozen.className)}
                  style={{ ...frozen.style }}
                >
                  {column.label}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody onKeyDown={onKeyDown} onFocus={onFocus} onDoubleClick={onDoubleClick}>
          {rows.map((row, rowIndex) => {
            const isActiveRow = current?.row === rowIndex;
            return (
              <SheetRowView
                key={row.key}
                row={row}
                rowIndex={rowIndex}
                columns={columns}
                view={view}
                context={context}
                rowEdits={edits[row.key]}
                activeCol={isActiveRow ? current.col : -1}
                editing={isActiveRow ? editing : null}
                error={isActiveRow ? error : null}
                onFinish={isActiveRow ? finish : undefined}
                onInvalid={isActiveRow ? setError : undefined}
              />
            );
          })}
          {/* The next step makes this row live: it needs the Brand and Label cells first. */}
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columns.length} className="h-9 py-0 text-muted-foreground">
              {view.bottles ? "Add a bottle" : "Add a label"} (comes with the Brand and Label cells, in the next step)
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
      ) : (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Arrow keys move. Type or press Enter to edit. Tab goes to the next cell you can edit, and Enter finishes and drops to the next row. Escape cancels.
        </p>
      )}
    </div>
  );
}
