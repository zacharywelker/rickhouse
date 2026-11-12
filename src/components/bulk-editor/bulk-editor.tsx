"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Check, Circle, CircleAlert, Lock, LoaderCircle } from "lucide-react";
import { ArrowDown, ArrowUp, PanelRightClose, PanelRightOpen } from "lucide-react";
import { ColumnPicker, type PickerGroup } from "@/components/bulk/column-picker";
import { GridCell } from "@/components/bulk/grid-cell";
import { useHiddenColumns } from "@/components/bulk/use-hidden-columns";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FieldGroup } from "@/db/schema";
import {
  brandCandidates, categoryCandidates, draftSheetRow, emptyDraft, isBlank, labelCandidates, withBlankRow, withBrand, withCategory, withLabel,
  type CategoryChoice, type DraftRow,
} from "@/lib/bulk-editor/drafts";
import { arrange, editKey, labelEditsOf, moveCandidates, setMove, type Moves } from "@/lib/bulk-editor/changes";
import { EDITORS, editorFor, isLocked, parseCell, setEdit, unlockKey, type CellEditor, type Edits, type Unlocked } from "@/lib/bulk-editor/editors";
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
  type SheetPhoto,
  type SheetRow,
  type SheetView,
} from "@/lib/bulk-editor/sheet";
import { cn } from "@/lib/utils";
import { blockedLine, draftNeeds, draftTitle, noticeText, type Blocked } from "@/lib/bulk-editor/save";
import { idsOfKeys, keyOf } from "@/lib/bulk-editor/delete";
import type { DeleteOutcome } from "@/lib/bulk-editor/rows";
import { railFor } from "@/lib/bulk-editor/rail";
import { shelfFor } from "@/lib/bulk-editor/shelf";
import { effectiveFind, filterCount, filterRows, isFiltered, isSortable, NO_FIND, nextSort, sortRows, type Find } from "@/lib/bulk-editor/find";
import { decodeRef, encodePick, REF_CAN_CREATE, REF_NO_CREATE, REF_WHAT, refCandidates, refNames, type RefData } from "@/lib/bulk-editor/references";
import { ComboEditor } from "./combo-editor";
import { FindBar } from "./find-bar";
import { RailContent } from "./rail-panel";
import { DeleteBar } from "./delete-bar";
import type { ComboData, Editing, Finish } from "./types";
import { useRowSaver } from "./use-row-saver";

const VIEW_KEY = "bulk-editor:view";
const HIDDEN_KEY = "bulk-editor:hidden";
const RAIL_KEY = "bulk-editor:rail";
/** The width from which the rail is open until the person chooses: with it open the sheet still has about 900px at this width. */
const RAIL_AUTO_OPEN = "(min-width: 1280px)";

/** Brand and Label are held at the left while the rest of the sheet scrolls. Widths are fixed so the second can sit against the first. */
const FROZEN: Record<string, { left: number; width: number }> = { brand: { left: 0, width: 156 }, name: { left: 156, width: 180 } };

/** Whether the cell is in the sheet's scroll box and clear of the headers held at its top (64px: the box's scroll padding). */
function withinView(el: HTMLElement): boolean {
  const box = el.closest("table")?.parentElement;
  if (!box) return true;
  const cell = el.getBoundingClientRect();
  const frame = box.getBoundingClientRect();
  return cell.top >= frame.top + 64 && cell.bottom <= frame.bottom;
}
const motionOk = () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

/**
 * Whether the rail is open. Until the person chooses (remembered in this browser) the width decides, in CSS (`xl`: 1280px
 * and up is open), so the page is the same from the server as in the browser and nothing jumps.
 */
function useRail() {
  const [choice, setChoice] = React.useState<"open" | "closed" | null>(null);
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(RAIL_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable after hydration
      if (saved === "open" || saved === "closed") setChoice(saved);
    } catch {
      // Unreadable: the width decides.
    }
  }, []);
  const toggle = React.useCallback(() => {
    const openNow = choice === null ? window.matchMedia(RAIL_AUTO_OPEN).matches : choice === "open";
    const next = openNow ? "closed" : "open";
    setChoice(next);
    try {
      window.localStorage.setItem(RAIL_KEY, next);
    } catch {
      // Not remembered this time.
    }
  }, [choice]);
  return [choice, toggle] as const;
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

/** The Fields picker, by form section: the shelf-order columns first under Label and Bottle, then a group for each section of each form. */
const PICKER_GROUPS: ReadonlyArray<PickerGroup> = (["label", "bottle"] as const).flatMap((group) => {
  const title = group === "label" ? "Label" : "Bottle";
  const columns = SHEET_COLUMNS.filter((c) => c.group === group);
  const sections = [...new Set(columns.flatMap((c) => (c.section ? [c.section] : [])))];
  return [
    { id: group, title, columns: columns.filter((c) => !c.section).map((c) => ({ id: c.id, label: c.label, locked: c.identity === true || c.always === true })) },
    ...sections.map((section) => ({ id: `${group}-${section.replace(/\W+/g, "-").toLowerCase()}`, title: `${title}: ${section}`, columns: columns.filter((c) => c.section === section).map((c) => ({ id: c.id, label: c.label })) })),
  ];
});
const PICKER_PRESETS = [
  { label: "Show all", ids: SHEET_COLUMNS.map((c) => c.id) },
  { label: "Defaults", ids: SHEET_COLUMNS.filter((c) => !c.defaultHidden).map((c) => c.id) },
];

/** The rule on a cell's left edge: none for the first, a faint one between columns, a dark one between the Label and Bottle groups. */
function ruleClass(index: number, column: SheetColumn, previous: SheetColumn | undefined) {
  if (index === 0) return "";
  return previous && previous.group !== column.group ? "border-l border-l-foreground" : "border-l border-l-border/40";
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

type RowStatus = "draft" | "saving" | "saved" | "blocked";
const STATUS_WORDS: Record<RowStatus, string> = { draft: "Not saved yet", saving: "Saving", saved: "Saved", blocked: "Cannot save" };

/** Where a row's save is: an icon with words behind it, so it is never colour alone. */
function StatusGlyph({ status }: { status: RowStatus }) {
  const icon = { className: "size-3 shrink-0", "aria-hidden": true } as const;
  return (
    <span className="inline-flex shrink-0 items-center" title={STATUS_WORDS[status]}>
      {status === "saved" ? <Check {...icon} /> : status === "saving" ? <LoaderCircle {...icon} className="size-3 shrink-0 motion-safe:animate-spin" /> : status === "blocked" ? <CircleAlert {...icon} className="size-3 shrink-0 text-destructive" /> : <Circle {...icon} className="size-2 shrink-0 fill-current text-muted-foreground" />}
      <span className="sr-only">{STATUS_WORDS[status]}</span>
    </span>
  );
}

/**
 * The one live editor: the form's own field control for the cell, mounted over the active cell only. It is positioned
 * over the cell instead of inside it, so opening it never changes a column's width or moves a row.
 */
function ActiveEditor({ editor, row, kinds, initial, error, reach, onFinish, onInvalid }: { editor: CellEditor; row: SheetRow; kinds: SheetContext["kinds"]; initial: Editing; error: string | null; reach: number | null; onFinish: (finish: Finish) => void; onInvalid: (message: string) => void }) {
  const [draft, setDraft] = React.useState(initial.value);
  const input = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const el = input.current;
    if (el instanceof HTMLSelectElement) {
      el.focus();
      return;
    }
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

  function commit(move: "stay" | "down" | "up" | "next" | "prev", focus: boolean) {
    const parsed = parseCell(editor, draft, undefined, row, kinds);
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
        const parsed = parseCell(editor, draft, undefined, row, kinds);
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
      ) : reach !== null ? (
        <p className="absolute left-0 top-full z-30 mt-px whitespace-nowrap border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground">{changesText(reach)}</p>
      ) : null}
    </div>
  );
}

/** What a label's cell reaches, said plainly where it is edited. */
const changesText = (bottles: number) => `Changes ${bottles} ${bottles === 1 ? "bottle" : "bottles"}`;

type RowProps = {
  row: SheetRow;
  rowIndex: number;
  columns: SheetColumn[];
  view: SheetView;
  context: SheetContext;
  rowEdits: Readonly<Record<string, string>> | undefined;
  /** The label's edits, shown by every bottle row of that label. */
  labelEdits: Readonly<Record<string, string>> | undefined;
  unlocked: Unlocked;
  /** Where this row's save is, and the cell (with its words) that stops it, once the cursor has left the row. */
  status: RowStatus | undefined;
  /** The row has just landed in its sorted place: shown for a moment. */
  flash: boolean;
  /** Ticked for deleting. A new row cannot be ticked: it is not saved. */
  selected: boolean;
  onSelect: (key: string) => void;
  blockedColumn: string | undefined;
  blockedShort: string | undefined;
  blockedMessage: string | undefined;
  /** The active cell's column, or -1 when this row has none. */
  activeCol: number;
  /** Only passed to the active row, so no other row re-renders when the cursor moves. */
  editing: Editing | null;
  error: string | null;
  /** What a picking cell offers; only for the active row, and only while a Brand, Label or Category cell is open. */
  combo: ComboData | null;
  onFinish: ((finish: Finish) => void) | undefined;
  onInvalid: ((message: string) => void) | undefined;
};

/** A row of text cells. Memoised: moving between cells re-renders two rows, not the whole sheet. */
const SheetRowView = React.memo(function SheetRowView({ row, rowIndex, columns, view, context, rowEdits, labelEdits, unlocked, status, flash, selected, onSelect, blockedColumn, blockedShort, blockedMessage, activeCol, editing, error, combo, onFinish, onInvalid }: RowProps) {
  return (
    <TableRow key={row.key} className="group">
      {columns.map((column, index) => {
        const editor = editorFor(column, view, row, unlocked, context.kinds);
        const locked = isLocked(column, view, row, unlocked, context.kinds);
        const spec = EDITORS[column.id];
        // A label's cell keeps its edit under the label; it still shows if the view has since changed and the cell cannot be edited.
        const edited = (spec?.scope === "label" && !row.draft ? labelEdits : rowEdits)?.[column.id];
        const cell = edited !== undefined && spec ? spec.display(edited, context, row) : column.cell(row, context);
        // An unlocked label cell on a bottle row reaches every bottle on the label.
        const reach = editor && editor.scope === "label" && !editor.combo && !row.draft && row.bottle ? row.label.bottleCount : null;
        const isBlocked = blockedColumn === column.id;
        const moved = row.moved === true && (column.id === "brand" || column.id === "name");
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
              (edited !== undefined || moved) && "bg-muted",
              flash && "bg-muted",
              locked && "cursor-not-allowed bg-muted/50 text-muted-foreground",
              editor && "cursor-cell",
              isBlocked ? "outline outline-2 -outline-offset-2 outline-destructive" : isActive && !isEditing && "outline outline-2 -outline-offset-2 outline-ring",
              ruleClass(index, column, columns[index - 1]),
              frozen.className,
            )}
            style={frozen.style}
          >
            <span className={cn("flex items-center gap-1.5", isEditing && "invisible")} title={isBlocked ? blockedMessage : locked ? "Triple-click to edit" : reach !== null ? changesText(reach) : (cell.note ?? cell.text)}>
              {column.id === "brand" ? (
                row.draft ? (
                  <span aria-hidden className="size-3.5 shrink-0" />
                ) : (
                  <input
                    type="checkbox"
                    tabIndex={-1}
                    checked={selected}
                    onChange={() => onSelect(row.key)}
                    aria-label={`Select ${row.label.brand} ${row.label.name}`}
                    className="size-3.5 shrink-0 cursor-pointer accent-foreground"
                  />
                )
              ) : null}
              {column.id === "brand" && status ? <StatusGlyph status={status} /> : null}
              {isBlocked && (cell.text === "—" || cell.text === "") ? (
                <span className="flex items-center gap-1 text-destructive"><CircleAlert aria-hidden className="size-3.5 shrink-0" />{blockedShort}</span>
              ) : (
                <>
                  <span className={cn("block truncate", !column.identity && "max-w-56")}>{cell.text}</span>
                  {isBlocked ? <CircleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" /> : null}
                </>
              )}
              {locked ? <Lock aria-hidden className="size-3 shrink-0" /> : null}
              {reach !== null ? <span className="shrink-0 border border-border px-1 text-[10px] uppercase leading-4 tracking-wide text-muted-foreground">{`all ${reach}`}</span> : null}
              {cell.badge ? <span className="shrink-0 border border-border px-1 text-[10px] uppercase leading-4 tracking-wide text-muted-foreground">{cell.badge}</span> : null}
            </span>
            {isEditing && editing && editor && onFinish && onInvalid ? (
              (editor.combo || editor.reference) && combo ? (
                <ComboEditor kind={editor.combo ?? "reference"} column={column.id} initial={editing} data={combo} error={error} onFinish={onFinish} onInvalid={onInvalid} />
              ) : (
                <ActiveEditor editor={editor} row={row} kinds={context.kinds} initial={editing} error={error} reach={reach} onFinish={onFinish} onInvalid={onInvalid} />
              )
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
export function BulkEditor({ labels, bottles, brands, categories, groups, kinds, photos, refs, currency }: {
  labels: SheetLabel[];
  bottles: SheetBottle[];
  brands: Array<{ id: number; name: string }>;
  categories: CategoryChoice[];
  groups: Record<number, FieldGroup>;
  kinds: SheetContext["kinds"];
  /** Thumbnails for the rail, by bottle and by label. */
  photos: { bottles: Record<number, SheetPhoto>; labels: Record<number, SheetPhoto> };
  /** What the store, cooperage, release and label-name cells choose from. */
  refs: RefData;
  currency: string;
}) {
  const [view, setView] = useView();
  const [railChoice, toggleRail] = useRail();
  // A row is a bottle in one view and a label in another, so what was ticked means something else: start again.
  const changeView = (next: SheetView) => {
    setSelected(new Set());
    setView(next);
  };
  const [hidden, setHidden] = useHiddenColumns(HIDDEN_KEY, DEFAULT_HIDDEN);
  const context = React.useMemo<SheetContext>(() => ({ currency, kinds, refs: refNames(refs) }), [currency, kinds, refs]);

  const columns = React.useMemo(() => columnsFor(view, hidden), [view, hidden]);
  /** Bottles moved to another label, and the label cells a person has triple-clicked open. Neither is saved yet. */
  const [moves, setMoves] = React.useState<Moves>({});
  const [unlocked, setUnlocked] = React.useState<Unlocked>(new Set());
  const [edits, setEdits] = React.useState<Edits>({});
  const rawRows = React.useMemo(() => sheetRows(view, labels, bottles), [view, labels, bottles]);
  // Rows are in their sorted place as soon as a move or a rename is made, not once it has been saved and read back.
  const arranged = React.useMemo(() => arrange(rawRows, moves, edits, labels), [rawRows, moves, edits, labels]);

  // Search, filters and sort change what is shown, never what is saved. A row that has been worked on this session
  // (edited, moved, or just saved) is kept on screen whatever the filter says, and in place whatever the sort says,
  // until the filters are cleared or the page is reloaded.
  const router = useRouter();
  /** Rows ticked for deleting, and rows deleted that the page has not yet been reloaded without. */
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [deletedKeys, setDeletedKeys] = React.useState<ReadonlySet<string>>(new Set());
  const toggleSelected = React.useCallback((key: string) => setSelected((prev) => { const next = new Set(prev); if (!next.delete(key)) next.add(key); return next; }), []);
  const [find, setFind] = React.useState<Find>(NO_FIND);
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(new Set());
  const touch = (key: string) => setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  // The values a row had when the sheet loaded, which the sort places it by. Kept across the reloads that follow a save,
  // so an edited row stays where it is; renewed only when the sort is changed or the filters are cleared.
  const [frozen, setFrozen] = React.useState<ReadonlyMap<string, SheetRow>>(() => new Map(rawRows.map((r) => [r.key, r])));
  const unseen = rawRows.filter((r) => !frozen.has(r.key));
  if (unseen.length > 0) setFrozen(new Map([...frozen, ...unseen.map((r): [string, SheetRow] => [r.key, r])]));
  const refreeze = () => setFrozen(new Map(rawRows.map((r) => [r.key, r])));
  const changeFind = (next: Find) => {
    // Asking for a different sort, or the other direction, sorts by what the rows hold now.
    if (next.sort?.column !== find.sort?.column || next.sort?.desc !== find.sort?.desc) refreeze();
    setFind(next);
  };
  const activeSort = find.sort && columns.some((c) => c.id === find.sort!.column) ? find.sort : null;
  const ordered = React.useMemo(() => sortRows(arranged, activeSort, frozen, context).filter((r) => !deletedKeys.has(r.key)), [arranged, activeSort, frozen, context, deletedKeys]);
  const pinned = React.useCallback((row: SheetRow) => touched.has(row.key) || (!row.draft && touched.has(`l${row.label.id}`)), [touched]);
  // What is in force for this view: store and price paid belong to bottles alone, and are off elsewhere.
  const inForce = React.useMemo(() => effectiveFind(find, view), [find, view]);
  const savedRows = React.useMemo(() => filterRows(ordered, inForce, pinned, context), [ordered, inForce, pinned, context]);
  const total = ordered.length;
  const noun = view.bottles ? (total === 1 ? "bottle" : "bottles") : total === 1 ? "label" : "labels";
  const filtered = isFiltered(inForce);
  const findOptions = React.useMemo(() => {
    const byName = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    // What the labels are linked to, as choices: only what is actually in use here, since the rest would find nothing.
    const used = (pick: (l: SheetLabel) => ReadonlyArray<{ id: number; label: string }>) => [...new Map(labels.flatMap((l) => pick(l).map((x) => [x.id, { key: x.id, label: x.label }] as const))).values()].sort(byName);
    return {
      categories: categories.map((c) => ({ key: c.id, label: c.name })),
      brands: brands.map((b) => ({ key: b.id, label: b.name })),
      stores: [...new Set(bottles.map((b) => b.storeName).filter((n): n is string => Boolean(n)))].sort((a, b) => a.localeCompare(b)).map((n) => ({ key: n, label: n })),
      more: {
        distilleries: used((l) => l.links.distilleries),
        mashbills: used((l) => l.links.mashbills),
        finishes: used((l) => l.links.finishes),
        ingredients: [...new Set(labels.flatMap((l) => (l.links.ingredients ?? []).map((i) => i.name)))].sort((a, b) => a.localeCompare(b)).map((n) => ({ key: n, label: n })),
      },
    };
  }, [categories, brands, bottles, labels]);
  const bottlesAlone = view.bottles && !view.labels;
  const sortable = React.useMemo(() => columns.filter((c) => isSortable(c.id)).map((c) => ({ id: c.id, label: c.label })), [columns]);

  // New rows: typed into the empty row at the bottom. Only the ones that have been started are kept here; the empty
  // one is made fresh each time (see `withBlankRow`).
  const [drafts, setDrafts] = React.useState<DraftRow[]>([]);
  const saver = useRowSaver({ labels, bottles, view, edits, moves, drafts, setEdits, setMoves, setDrafts, onLanded: touch });
  const createdAs = saver.createdAs;
  /** One past the highest new-row key handed out, so the empty row keeps its key when earlier rows are saved and removed. */
  const [keyFloor, setKeyFloor] = React.useState(0);
  const allDrafts = React.useMemo(() => withBlankRow(drafts, keyFloor), [drafts, keyFloor]);
  const keepKeys = (key: string) => setKeyFloor((floor) => Math.max(floor, Number(key.slice(1)) + 1));
  const draftContext = React.useMemo(() => ({ view, labels, categories, groups }), [view, labels, categories, groups]);
  // A new row that has saved is hidden in the very render in which its saved row arrives in the data, not in an effect
  // after it: for a moment both would be there, and a cursor on the row below would land on the wrong one.
  const savedKeys = React.useMemo(() => new Set(savedRows.map((r) => r.key)), [savedRows]);
  const rowsFor = React.useCallback(
    (list: DraftRow[]) => [...savedRows, ...list.filter((d) => !(createdAs[d.key] && savedKeys.has(createdAs[d.key]!))).map((draft) => draftSheetRow(draft, draftContext))],
    [savedRows, savedKeys, createdAs, draftContext],
  );
  const rows = React.useMemo(() => rowsFor(allDrafts), [rowsFor, allDrafts]);

  /**
   * The cursor is on a row, not at a row number: a row can move to its sorted place under it. `row` is only where it
   * last was, kept for when the row is gone.
   */
  /** The row marked for a moment: one that has just moved, or just landed. */
  const [flashKey, setFlashKey] = React.useState<string | null>(null);
  const flashRow = (key: string) => {
    setFlashKey(key);
    setTimeout(() => setFlashKey((now) => (now === key ? null : now)), 2000);
  };
  const [active, setActive] = React.useState<{ key: string; col: number; row: number } | null>(null);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  /** The column a run of Tabs started in, which Enter returns to on the next row. */
  const anchorCol = React.useRef(0);
  const focusAfter = React.useRef(true);
  /** Set when Tab follows a row that has just moved to its sorted place: the view then goes with it. */
  const followRow = React.useRef(false);
  const sheetRef = React.useRef<HTMLDivElement>(null);

  const dims = { rows: rows.length, cols: columns.length };
  // The view or the columns can change under the cursor; keep it on the sheet.
  const indexByKey = React.useMemo(() => new Map(rows.map((r, i) => [r.key, i])), [rows]);
  const current: Pos | null = (() => {
    if (!active || dims.rows === 0 || dims.cols === 0) return null;
    // A new row that has saved is now the saved row, which is where its cursor goes.
    const saved = createdAs[active.key];
    const key = saved && indexByKey.has(saved) ? saved : active.key;
    return { row: Math.min(indexByKey.get(key) ?? active.row, dims.rows - 1), col: Math.min(active.col, dims.cols - 1) };
  })();
  /** Puts the cursor on the cell at `pos` of `list` (the rows as they are, unless the next position is worked out on others). */
  const place = (pos: Pos, list: SheetRow[] = rows) => setActive({ key: list[pos.row]?.key ?? "", col: pos.col, row: pos.row });

  const editorIn = (list: SheetRow[], pos: Pos): CellEditor | null => {
    const row = list[pos.row];
    const column = columns[pos.col];
    return row && column ? editorFor(column, view, row, unlocked, context.kinds) : null;
  };
  const editorAt = (pos: Pos): CellEditor | null => editorIn(rows, pos);
  const valueAt = (pos: Pos): string => {
    const row = rows[pos.row]!;
    const editor = editorAt(pos);
    return editor ? (edits[editKey(row, editor)]?.[columns[pos.col]!.id] ?? editor.initial(row)) : "";
  };

  function go(moved: Moved, list: SheetRow[] = rows) {
    if ("leave" in moved) return;
    focusAfter.current = true;
    place(moved.pos, list);
    anchorCol.current = moved.anchorCol;
  }

  function startEdit(pos: Pos, replace: boolean, typed?: string) {
    place(pos);
    setError(null);
    // A letter typed on a choice picks the first option that starts with it, as typing into a list does.
    const spec = editorAt(pos)?.spec;
    const chosen = typed && spec && (spec.kind === "select" || spec.kind === "slider") ? spec.options.find((o) => o.value !== "" && o.label.toLowerCase().startsWith(typed.toLowerCase())) : undefined;
    // A store, cooperage, release or label name is edited by its name; what it holds is its id.
    const refName = (value: string) => {
      const ref = decodeRef(value);
      return ref === null ? "" : "name" in ref ? ref.name : (context.refs?.[editorAt(pos)!.reference!][ref.id] ?? "");
    };
    const held = editorAt(pos)?.reference ? refName(valueAt(pos)) : valueAt(pos);
    setEditing({ value: chosen ? chosen.value : replace ? (typed ?? "") : held, replace });
  }

  /** A yes/no cell is flipped, not opened: Space, Enter or a double click. */
  function flip(pos: Pos) {
    stage(pos, valueAt(pos) === "true" ? "false" : "true");
  }

  function stage(pos: Pos, value: string) {
    const row = rows[pos.row];
    const column = columns[pos.col];
    const editor = editorAt(pos);
    if (!row || !column || !editor) return;
    if (row.draft) setDrafts((prev) => (prev.some((d) => d.key === row.key) ? prev : [...prev, emptyDraft(row.key)]));
    const key = editKey(row, editor);
    if (row.draft) {
      keepKeys(row.key);
      // A new row's cells are forgotten when put back to empty: there is nothing to send.
      setEdits((prev) => setEdit(prev, key, column.id, value, editor.initial(row)));
      return;
    }
    // A saved row saves as soon as a cell of it is committed. An edit that is already here is kept even when it is put
    // back to what the sheet shows: the earlier value may already be saved, and the sheet has not read it back yet.
    const had = edits[key]?.[column.id] !== undefined;
    if (!had && value === editor.initial(row)) return;
    touch(key);
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], [column.id]: value } }));
    saver.request(key);
  }

  /** `list` with the draft of this key changed, making it a real draft first if it is still the empty row. */
  function updatedDrafts(key: string, change: (draft: DraftRow) => DraftRow): DraftRow[] {
    keepKeys(key);
    const base = drafts.some((d) => d.key === key) ? drafts : [...drafts, emptyDraft(key)];
    return base.map((d) => (d.key === key ? change(d) : d));
  }

  function finish(result: Finish) {
    if (!current) return;
    const row = rows[current.row];
    const columnId = columns[current.col]?.id;
    if (!row || !columnId) return;

    // A choice the sheet will not take is refused in the open editor, with the reason, rather than dropped.
    if ("pick" in result && columnId === "name" && result.pick.kind === "existing" && !view.bottles) {
      focusAfter.current = result.focus;
      setError("That label already exists. Switch Bottles on to add a bottle of it.");
      return;
    }

    // Renaming a label to a name another of its brand's labels has is refused here, as the server would.
    if ("value" in result && columnId === "name" && !row.draft && !row.bottle) {
      const clash = labels.find((l) => l.id !== row.label.id && l.brandId === row.label.brandId && l.name.trim().toLowerCase() === result.value.trim().toLowerCase());
      if (clash) {
        focusAfter.current = result.focus;
        setError(`You already have ${clash.brand} ${clash.name}.`);
        return;
      }
    }

    focusAfter.current = result.focus;
    setEditing(null);
    setError(null);
    if ("cancel" in result) return;

    // The rows as they will be once this is applied: the next cell to land on can depend on what was just chosen
    // (a brand opens the Label cell), so the move is judged against them, not against the rows as they are now.
    let nextRows = rows;
    // Brand or Label on a saved row moves the bottle, or renames the label: the row goes to its sorted place at once.
    const reordered = !row.draft && (columnId === "brand" || columnId === "name") && ("pick" in result || "value" in result);
    if (reordered) flashRow(row.key);
    if ("value" in result) stage(current, result.value);
    else if ("pick" in result && editorAt(current)?.reference) stage(current, encodePick(result.pick));
    else if ("pick" in result && !row.draft) {
      // A saved row's Brand or Label. On a bottle it moves the bottle to the label picked, which already exists; with
      // only Labels on, a brand is picked (or created with Enter) for the label.
      if (row.bottle) {
        const target = result.pick.kind === "existing" ? result.pick.id : null;
        if (target !== null) {
          setMoves((prev) => setMove(prev, row.key, target, row.bottle!.expressionId));
          // A release and a label name belong to the label the bottle was on: what was picked for it is no longer one of the new label's.
          setEdits((prev) => {
            const cells = prev[row.key];
            if (!cells || !("releaseId" in cells || "expressionNameId" in cells)) return prev;
            const { releaseId: _release, expressionNameId: _name, ...rest } = cells;
            const { [row.key]: _row, ...others } = prev;
            return Object.keys(rest).length > 0 ? { ...others, [row.key]: rest } : others;
          });
          touch(row.key);
          saver.request(row.key);
        }
      } else if (columnId === "brand") stage(current, result.pick.name);
    } else if ("pick" in result || "categoryId" in result) {
      const nextDrafts = updatedDrafts(row.key, (draft) => {
        if ("categoryId" in result) return withCategory(draft, result.categoryId);
        if (columnId === "brand") return withBrand(draft, result.pick);
        const chosen = result.pick.kind === "existing" ? labels.find((l) => l.id === (result.pick as { id: number }).id) : undefined;
        return withLabel(draft, result.pick, chosen?.categoryId ?? null);
      });
      setDrafts(nextDrafts);
      nextRows = rowsFor(withBlankRow(nextDrafts, Math.max(keyFloor, Number(row.key.slice(1)) + 1)));
    }

    const landsOn = (pos: Pos) => editorIn(nextRows, pos) !== null;
    // Worked out on the rows as they were, so Enter goes to the row that was below the one just changed (even if that
    // row has since moved to its sorted place) and Tab stays on this row wherever it goes.
    if (result.move === "down" || result.move === "up") go(enterMove(current, anchorCol.current, result.move === "up", { rows: nextRows.length, cols: dims.cols }), nextRows);
    else if (result.move === "next" || result.move === "prev") {
      go(tabMove(current, result.move === "prev", { rows: nextRows.length, cols: dims.cols }, landsOn, anchorCol.current), nextRows);
      if (reordered) followRow.current = true;
    }
  }

  /** What the open Brand, Label or Category cell offers. Worked out for the active cell only. */
  function comboFor(): ComboData | null {
    if (!current || !editing) return null;
    const row = rows[current.row];
    const editor = editorAt(current);
    if (row && editor?.reference) {
      const kind = editor.reference;
      return { candidates: refCandidates(kind, row.label.id, refs), allowCreate: REF_CAN_CREATE[kind], what: REF_WHAT[kind], enterDropsDown: true, ...(REF_NO_CREATE[kind] ? { noCreateReason: REF_NO_CREATE[kind] } : {}) };
    }
    if (!row || !editor?.combo) return null;
    // A saved row: a bottle picks a label that exists to move to; a label (Labels only) picks a brand, or makes one.
    if (!row.draft) {
      if (row.bottle) {
        const column = editor.combo === "brand" ? "brand" : "name";
        return { candidates: moveCandidates(column, row, labels), allowCreate: false, what: "label", enterDropsDown: true, noCreateReason: "A bottle can only move to a label that exists. Add the label in the bottom row first." };
      }
      return { candidates: brandCandidates(brands, [], ""), allowCreate: true, what: "brand", enterDropsDown: true };
    }
    const draft = allDrafts.find((d) => d.key === row.key);
    if (!draft) return null;
    const noCreateReason = view.labels ? undefined : "Labels are off, so a new brand or label cannot be made here. Switch Labels on.";
    if (editor.combo === "brand") return { candidates: brandCandidates(brands, allDrafts, draft.key), allowCreate: view.labels, what: "brand", ...(noCreateReason ? { noCreateReason } : {}) };
    if (editor.combo === "label") return { candidates: labelCandidates(draft, labels, allDrafts), allowCreate: view.labels, what: "label", ...(noCreateReason ? { noCreateReason } : {}) };
    return { candidates: categoryCandidates(categories), allowCreate: false, what: "category" };
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
      const editor = editorAt(pos);
      if (editor) {
        event.preventDefault();
        if (editor.spec.kind === "checkbox") flip(pos);
        else startEdit(pos, false);
      }
    } else if (key === " " && !event.shiftKey && editorAt(pos)?.spec.kind === "checkbox") {
      event.preventDefault();
      flip(pos);
    } else if (key === "Delete" || key === "Backspace") {
      const editor = editorAt(pos);
      // A brand, label or category is changed by choosing another, not by emptying the cell.
      if (editor && !editor.required && !editor.combo) {
        event.preventDefault();
        stage(pos, editor.spec.kind === "checkbox" ? "false" : "");
      }
    } else if (key === " " && event.shiftKey && columns[pos.col]?.id === "brand" && rows[pos.row] && !rows[pos.row]!.draft) {
      // Shift+Space ticks the row, as in a spreadsheet.
      event.preventDefault();
      toggleSelected(rows[pos.row]!.key);
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const editor = editorAt(pos);
      if (editor) {
        event.preventDefault();
        // A choice is told which letter was typed, to pick the option that starts with it; a typed box takes it as text.
        const isChoice = editor.spec.kind === "select" || editor.spec.kind === "slider";
        startEdit(pos, editor.typeToReplace, editor.typeToReplace || isChoice ? key : undefined);
      }
    }
  }

  function onFocus(event: React.FocusEvent<HTMLTableSectionElement>) {
    const hit = cellOf(event.target);
    if (!hit?.direct) return;
    // Focus arriving by a click, or by Tab from outside, picks the cell and starts a new run from its column.
    if (!current || current.row !== hit.pos.row || current.col !== hit.pos.col) {
      place(hit.pos);
      anchorCol.current = hit.pos.col;
    }
  }

  /** Triple-clicking a locked label cell opens it, as on the single forms; it then says how many bottles it changes. */
  function onClick(event: React.MouseEvent<HTMLTableSectionElement>) {
    if (event.detail < 3) return;
    const hit = cellOf(event.target);
    const row = hit ? rows[hit.pos.row] : undefined;
    const column = hit ? columns[hit.pos.col] : undefined;
    if (!hit || !row || !column || !isLocked(column, view, row, unlocked, context.kinds)) return;
    const open = new Set(unlocked);
    open.add(unlockKey(row.label.id, column.id));
    setUnlocked(open);
    place(hit.pos);
    anchorCol.current = hit.pos.col;
  }

  function onDoubleClick(event: React.MouseEvent<HTMLTableSectionElement>) {
    const hit = cellOf(event.target);
    const editor = hit ? editorAt(hit.pos) : null;
    if (hit && editor) {
      if (editor.spec.kind === "checkbox") flip(hit.pos);
      else startEdit(hit.pos, false);
    }
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
      if (followRow.current && !withinView(el)) el.scrollIntoView({ block: "center", inline: "nearest", behavior: motionOk() ? "smooth" : "auto" });
      else el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    followRow.current = false;
    // The cursor's position is what matters, not the object that holds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.row, current?.col, editing]);

  // What has not been saved: new rows that have been started, and rows with an edit or a move that is not yet saved.
  const stateOf = saver.rowState;
  const notSaved = new Set<string>();
  for (const d of drafts) if (!isBlank(d, edits) && stateOf[d.key]?.kind !== "saved") notSaved.add(d.key);
  for (const key of [...Object.keys(edits), ...Object.keys(moves)]) if (!key.startsWith("d") && stateOf[key]?.kind !== "saved") notSaved.add(key);
  const saving = Object.values(stateOf).some((state) => state.kind === "saving");
  const unsaved = notSaved.size;

  // A new row that is not ready, or a save that failed, is blocked. A new row shows it only once the cursor has left
  // it (or has been still a while), never while it is being typed into.
  const activeKey = current ? (rows[current.row]?.key ?? null) : null;
  const activity = React.useMemo(() => ({}), [current?.row, current?.col, editing, edits, drafts]); // eslint-disable-line react-hooks/exhaustive-deps -- a new token whenever any of these changes
  const [idleToken, setIdleToken] = React.useState<object | null>(null);
  React.useEffect(() => {
    const timer = setTimeout(() => setIdleToken(activity), 3000);
    return () => clearTimeout(timer);
  }, [activity]);
  const idle = idleToken === activity && editing === null;

  // A row that has landed in its sorted place (a new row, a moved bottle, a renamed label) is followed to: scrolled into
  // view and marked for a moment. Not while a cell is open or the person is mid-entry: it waits for about a second of calm,
  // so typing the next row is never taken out from under them.
  const [calmToken, setCalmToken] = React.useState<object | null>(null);
  React.useEffect(() => {
    const timer = setTimeout(() => setCalmToken(activity), 1000);
    return () => clearTimeout(timer);
  }, [activity]);
  const calm = calmToken === activity && editing === null;
  const { reveal, clearReveal, revealFor } = saver;
  React.useEffect(() => {
    if (!calm || reveal.length === 0) return;
    const fresh = reveal.filter((r) => Date.now() - r.at < revealFor);
    const found = [...fresh].reverse().map((r) => rows.findIndex((row) => row.key === r.key || (r.key.startsWith("l") && !row.draft && `l${row.label.id}` === r.key))).find((i) => i >= 0);
    if (found === undefined) {
      if (fresh.length < reveal.length) clearReveal();
      return;
    }
    const target = rows[found]!;
    const timer = setTimeout(() => {
      const el = sheetRef.current?.querySelector<HTMLElement>(`td[data-r="${found}"]`);
      el?.scrollIntoView({ block: "center", inline: "nearest", behavior: motionOk() ? "smooth" : "auto" });
      flashRow(target.key);
      clearReveal();
    }, 0);
    return () => clearTimeout(timer);
  }, [calm, reveal, rows, clearReveal, revealFor]);

  type BlockedRow = Blocked & { column: string; short: string };
  const blockedRows: BlockedRow[] = [];
  for (const d of drafts) {
    const state = stateOf[d.key];
    if (isBlank(d, edits) || state?.kind === "saving" || state?.kind === "saved") continue;
    if (state?.kind === "blocked") blockedRows.push({ key: d.key, title: draftTitle(d), message: state.message, column: state.column, short: state.message });
    else {
      const need = draftNeeds(d);
      if (need && (activeKey !== d.key || idle)) blockedRows.push({ key: d.key, title: draftTitle(d), action: need.action, column: need.column, short: need.short });
    }
  }
  for (const [key, state] of Object.entries(stateOf)) {
    if (state.kind !== "blocked" || key.startsWith("d")) continue;
    const label = key.startsWith("l") ? labels.find((l) => `l${l.id}` === key) : rows.find((r) => r.key === key)?.label;
    blockedRows.push({ key, title: label ? `${label.brand} ${label.name}` : "A row", message: state.message, column: state.column, short: state.message });
  }
  const blockedByKey = new Map(blockedRows.map((b) => [b.key, b]));
  const blockedFor = (row: SheetRow) => blockedByKey.get(row.key) ?? (row.draft ? undefined : blockedByKey.get(`l${row.label.id}`));
  /** The glyph on a row: a failed or unready save, one on its way, one just done, or a new row not saved yet. */
  const statusOf = (row: SheetRow): RowStatus | undefined => {
    if (blockedFor(row)) return "blocked";
    const stored = stateOf[row.key] ?? (row.draft ? undefined : stateOf[`l${row.label.id}`]);
    if (stored && stored.kind !== "blocked") return stored.kind;
    return row.draft && !isBlank(allDrafts.find((d) => d.key === row.key) ?? { key: row.key, brand: null, label: null, categoryId: null }, edits) ? "draft" : undefined;
  };

  /** Where the cursor goes for "Go to first": the first blocked row, on the cell that blocks it. */
  function jumpToFirst() {
    const first = blockedRows[0];
    if (!first) return;
    const row = rows.findIndex((r) => r.key === first.key || (first.key.startsWith("l") && !r.draft && `l${r.label.id}` === first.key));
    if (row < 0) return;
    const col = Math.max(0, columns.findIndex((c) => c.id === first.column));
    focusAfter.current = true;
    place({ row, col });
    anchorCol.current = col;
  }

  // A new row saves when the cursor leaves it: moving to another row, or pressing anywhere outside the sheet.
  const prevKey = React.useRef<string | null>(null);
  React.useEffect(() => {
    const previous = prevKey.current;
    prevKey.current = activeKey;
    if (previous !== null && previous !== activeKey && previous.startsWith("d")) saver.saveDrafts(activeKey ?? undefined);
  }, [activeKey, saver]);
  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // Inside the sheet, in the rail or the autocomplete, or in a popover or dialog opened from it (they are drawn outside the sheet): not a click away.
      if (sheetRef.current?.contains(target) || target?.closest?.("[data-bulk-editor-panel], [data-radix-popper-content-wrapper], [role=dialog]")) return;
      // After the click has been handled: a cell being edited commits first.
      setTimeout(() => saver.saveDrafts(), 50);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [saver]);

  // Leaving the page with anything unsaved, blocked or on its way asks first. New rows do not survive a reload.
  const leaveWarning = unsaved > 0 || saving || blockedRows.length > 0;
  React.useEffect(() => {
    if (!leaveWarning) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    // Links inside the app do not unload the page, so they are asked about here, before the router sees the click.
    const onLinkClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.origin !== window.location.origin || link.pathname === window.location.pathname) return;
      if (!window.confirm("This sheet has rows that are not saved. Leave anyway?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onLinkClick, true);
    };
  }, [leaveWarning]);

  const comboData = comboFor();

  // The rail follows the cursor's row. Display only.
  const railRow = current ? (rows[current.row] ?? null) : null;
  const railPhoto = railRow ? ((railRow.bottle && railRow.bottle.id > 0 ? photos.bottles[railRow.bottle.id] : undefined) ?? (railRow.label.id > 0 ? photos.labels[railRow.label.id] : undefined) ?? null) : null;
  const rail = React.useMemo(() => (railRow ? railFor(railRow, context, view, edits, railPhoto) : null), [railRow, context, view, edits, railPhoto]);
  // "On your shelf": what is owned from this row's brand and label. From every label and every shelf bottle that is loaded,
  // never the filtered rows, plus the new rows in this sheet that will be bottles.
  const newBottles = React.useMemo(
    () => allDrafts.filter((d) => view.bottles && d.brand !== null && d.label !== null && indexByKey.has(d.key)).map((d) => ({ key: d.key, brand: d.brand, label: d.label, saved: saver.rowState[d.key]?.kind === "saved" })),
    [allDrafts, view.bottles, indexByKey, saver.rowState],
  );
  const shelf = React.useMemo(() => (railRow ? shelfFor({ row: railRow, labels, bottles, moves, newBottles, view }) : null), [railRow, labels, bottles, moves, newBottles, view]);
  // Only rows that can be seen are ever deleted: a row ticked and then filtered out is left alone, and not counted.
  const ticked = savedRows.filter((r) => selected.has(r.key)).map((r) => r.key);
  const allTicked = savedRows.length > 0 && ticked.length === savedRows.length;
  function afterDelete(outcome: DeleteOutcome) {
    const failed = new Set(outcome.failed.map((f) => keyOf(f.kind, f.id)));
    const gone = ticked.filter((key) => !failed.has(key));
    setDeletedKeys((prev) => new Set([...prev, ...gone]));
    setSelected(new Set(ticked.filter((key) => failed.has(key))));
    // Anything typed into a row that is gone goes with it.
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !gone.includes(key))));
    setMoves((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !gone.includes(key))));
    React.startTransition(() => router.refresh());
  }
  // Editing a cell that belongs to the label changes every bottle on it; the rail says so as well as the cell.
  const railEditor = current && editing ? editorAt(current) : null;
  const railReach = railRow && railEditor && railEditor.scope === "label" && !railEditor.combo && !railRow.draft && railRow.bottle ? railRow.label.bottleCount : null;

  // Brand and Label sit under one "Label" caption; the Bottle group has its own, after a dark rule.
  const frozenCount = columns.filter((c) => FROZEN[c.id]).length;
  const labelRest = columns.filter((c) => c.group === "label" && !FROZEN[c.id]).length;
  const bottleCount = columns.filter((c) => c.group === "bottle").length;

  return (
    <div className="flex items-start gap-4">
    <div
      ref={sheetRef}
      // From md up the sheet scrolls inside a box that fits the screen, so the headers stay put and the keyboard's
      // scroll-into-view keeps the active cell clear of them and of the frozen columns.
      className="min-w-0 border border-border bg-card md:[&>.overflow-x-auto]:max-h-[calc(100dvh-19.5rem)] md:[&>.overflow-x-auto]:min-h-80 md:[&>.overflow-x-auto]:overflow-y-auto md:[&>.overflow-x-auto]:scroll-pl-[336px] md:[&>.overflow-x-auto]:scroll-pt-16"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5">
        <div role="group" aria-label="What the sheet shows" className="inline-flex divide-x divide-border border border-border">
          <ViewToggle label="Labels" on={view.labels} onlyOne={!view.bottles} onClick={() => changeView({ ...view, labels: !view.labels })} />
          <ViewToggle label="Bottles" on={view.bottles} onlyOne={!view.labels} onClick={() => changeView({ ...view, bottles: !view.bottles })} />
        </div>
        <ColumnPicker
          label="Fields"
          groups={PICKER_GROUPS}
          visible={new Set(SHEET_COLUMNS.filter((c) => !hidden.has(c.id)).map((c) => c.id))}
          onChange={(next) => setHidden(new Set(SHEET_COLUMNS.filter((c) => !c.identity && !c.always && !next.has(c.id)).map((c) => c.id)))}
          presets={PICKER_PRESETS}
        />
        <FindBar
          find={find}
          onFind={changeFind}
          categories={findOptions.categories}
          brands={findOptions.brands}
          stores={bottlesAlone ? findOptions.stores : null}
          more={findOptions.more}
          bottlesAlone={bottlesAlone}
          active={filterCount(inForce)}
          sortable={sortable}
          onClear={() => {
            setFind((f) => ({ ...NO_FIND, sort: f.sort }));
            setTouched(new Set());
            refreeze();
          }}
        />
        {saving || unsaved > 0 ? (
          <p role="status" className="flex items-center gap-2 text-sm">
            {saving ? "Saving…" : `${unsaved} ${unsaved === 1 ? "row" : "rows"} not saved yet`}
            {!saving ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  // Only what is not saved: a saved change is kept.
                  setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !notSaved.has(key))));
                  setDrafts((prev) => prev.filter((d) => !notSaved.has(d.key)));
                  setMoves((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !notSaved.has(key))));
                  setUnlocked(new Set());
                  saver.reset();
                }}
              >
                Discard
              </Button>
            ) : null}
          </p>
        ) : null}
        <p className="ml-auto text-sm text-muted-foreground" aria-live="off">
          {filtered ? `Showing ${savedRows.length} of ${total} ${noun}` : `${total} ${noun}`}
        </p>
      </div>

      <Table role="grid" aria-label="Bulk editor" aria-rowcount={rows.length + 1} className="border-separate border-spacing-0 whitespace-nowrap tabular-nums">
        <TableHeader>
          <TableRow className="border-b-0 hover:bg-transparent">
            <TableHead colSpan={frozenCount} className="sticky top-0 z-30 h-7 bg-card text-[11px] tracking-wider md:left-0" style={{ minWidth: 336 }}>
              Label
            </TableHead>
            {labelRest > 0 ? <TableHead colSpan={labelRest} className="sticky top-0 z-20 h-7 border-l border-l-border/40 bg-card" /> : null}
            {bottleCount > 0 ? (
              <TableHead colSpan={bottleCount} className="sticky top-0 z-20 h-7 border-l border-l-foreground bg-card text-[11px] tracking-wider">
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
                  aria-sort={activeSort?.column === column.id ? (activeSort.desc ? "descending" : "ascending") : undefined}
                  className={cn(HEAD_CELL, "top-7 font-medium", column.align === "right" && "text-right", ruleClass(index, column, columns[index - 1]), frozen.className)}
                  style={{ ...frozen.style }}
                >
                  {column.id === "brand" ? (
                    <input
                      type="checkbox"
                      tabIndex={-1}
                      checked={allTicked}
                      ref={(el) => {
                        if (el) el.indeterminate = ticked.length > 0 && !allTicked;
                      }}
                      onChange={() => setSelected(allTicked ? new Set() : new Set(savedRows.map((r) => r.key)))}
                      aria-label="Select every row shown"
                      className="mr-2 size-3.5 cursor-pointer align-middle accent-foreground"
                    />
                  ) : null}
                  {isSortable(column.id) ? (
                    // A click on the header sorts. It is not a tab stop: the Sort control in the toolbar is the way by keyboard.
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => changeFind({ ...find, sort: nextSort(activeSort, column.id) })}
                      className="inline-flex items-center gap-1 uppercase hover:text-foreground"
                    >
                      {column.label}
                      {activeSort?.column === column.id ? activeSort.desc ? <ArrowDown aria-hidden className="size-3" /> : <ArrowUp aria-hidden className="size-3" /> : null}
                    </button>
                  ) : (
                    column.label
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody onKeyDown={onKeyDown} onFocus={onFocus} onClick={onClick} onDoubleClick={onDoubleClick}>
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
                labelEdits={labelEditsOf(edits, row)}
                unlocked={unlocked}
                status={statusOf(row)}
                flash={flashKey === row.key}
                selected={selected.has(row.key)}
                onSelect={toggleSelected}
                blockedColumn={blockedFor(row)?.column}
                blockedShort={blockedFor(row)?.short}
                blockedMessage={blockedFor(row) ? blockedLine(blockedFor(row)!) : undefined}
                activeCol={isActiveRow ? current.col : -1}
                editing={isActiveRow ? editing : null}
                error={isActiveRow ? error : null}
                combo={isActiveRow ? comboData : null}
                onFinish={isActiveRow ? finish : undefined}
                onInvalid={isActiveRow ? setError : undefined}
              />
            );
          })}
        </TableBody>
      </Table>

      {savedRows.length === 0 && total > 0 ? (
        <p className="border-t border-border px-3 py-4 text-center text-sm text-muted-foreground">No {noun} match. Clear the filters to see them all.</p>
      ) : null}
      {total === 0 ? (
        <p className="border-t border-border px-3 py-4 text-center text-sm text-muted-foreground">
          {view.bottles ? <>Nothing on the shelf yet. Type in the first row to add a bottle, or switch to Labels.</> : <>No labels yet. Type in the first row to add one.</>}
        </p>
      ) : null}
      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        Arrow keys move. Type or press Enter to edit. A grey cell with a lock belongs to the label and changes every bottle on it: triple-click it to edit. Brand or Label on a bottle moves it to another label. In the empty row, type a brand, then a label, then a category: Enter takes the highlighted match or creates, Tab takes an existing match only.
        Tab goes to the next cell you can edit, and Enter finishes and drops to the next row. Escape cancels.
        Rows save as you go: a saved row as soon as a cell is finished, a new row when you leave it.
      </p>
      <DeleteBar count={ticked.length} noun={view.bottles ? "bottle" : "label"} ids={idsOfKeys(ticked)} onClear={() => setSelected(new Set())} onDone={afterDelete} />
      {/* Present before anything is in it, so a screen reader announces the text when it appears. It never takes focus. */}
      <div aria-live="polite" aria-atomic="true" className={cn("pointer-events-none fixed right-4 z-40 w-[min(24rem,calc(100vw-2rem))]", ticked.length > 0 ? "bottom-24" : "bottom-4")}>
        {blockedRows.length > 0 ? (
          <div className="pointer-events-auto flex flex-col gap-2 border border-destructive bg-card p-3 text-sm shadow-md">
            <p className="flex items-start gap-2">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{noticeText(blockedRows)}</span>
            </p>
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={jumpToFirst}>
              {blockedRows.length > 1 ? "Go to the first one" : "Go to it"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
    {/* The rail: display only, and not a live region (it changes on every cell move). Clicks in it are not clicks away from the sheet. */}
    <aside
      data-bulk-editor-panel=""
      aria-label="Row details"
      className={cn("sticky top-4 hidden shrink-0 self-start md:block", railChoice === null ? "w-9 xl:w-72" : railChoice === "open" ? "w-72" : "w-9")}
    >
      <div className={cn("border border-border bg-card", railChoice === null ? "hidden xl:block" : railChoice === "open" ? "block" : "hidden")}>
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Details</h2>
            <button type="button" onClick={toggleRail} aria-label="Hide the details panel" className="p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <PanelRightClose aria-hidden className="size-4" />
            </button>
          </div>
          <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto p-3">
            <RailContent rail={rail} shelf={shelf} reach={railReach} />
          </div>
      </div>
      <button type="button" onClick={toggleRail} aria-label="Show the details panel" aria-expanded={false} className={cn("h-24 w-9 items-start justify-center border border-border bg-card pt-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", railChoice === null ? "flex xl:hidden" : railChoice === "closed" ? "flex" : "hidden")}>
        <PanelRightOpen aria-hidden className="size-4" />
      </button>
    </aside>
    </div>
  );
}
