"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Check, Circle, CircleAlert, Lock, LoaderCircle } from "lucide-react";
import { ArrowDown, ArrowUp, PanelRightClose, PanelRightOpen } from "lucide-react";
import { ColumnPicker, type PickerGroup } from "@/components/bulk/column-picker";
import { GridCell } from "@/components/bulk/grid-cell";
import { useColumnWidths } from "@/components/bulk/use-column-widths";
import { useHiddenColumns } from "@/components/bulk/use-hidden-columns";
import { clampWidth } from "@/lib/bulk-editor/widths";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { abvToProof, proofToAbv } from "@/lib/bottles/proof";
import type { FieldGroup } from "@/db/schema";
import {
  brandCandidates, categoryCandidates, draftSheetRow, emptyDraft, insertionDraft, isBlank, labelCandidates, orderRows, withBlankRow, withBrand, withCategory, withLabel,
  type CategoryChoice, type DraftRow,
} from "@/lib/bulk-editor/drafts";
import { applyVintageEdits, arrange, editKey, withDraftVintages, labelEditsOf, moveCandidates, setMove, type Moves } from "@/lib/bulk-editor/changes";
import { EDITORS, editorFor, isLocked, lockKeyOf, parseCell, setEdit, staged, type CellEditor, type Edits, type Unlocked } from "@/lib/bulk-editor/editors";
import { arrowMove, enterMove, tabMove, type ArrowKey, type Moved, type Pos } from "@/lib/bulk-editor/nav";
import {
  columnsFor,
  DEFAULT_HIDDEN,
  normaliseView,
  SHEET_COLUMNS,
  sheetRows,
  type SheetBottle,
  type SheetColumn,
  type Cell,
  type SheetContext,
  type SheetLabel,
  type SheetPhoto,
  type SheetRow,
  type SheetView,
  type SheetVintage,
} from "@/lib/bulk-editor/sheet";
import { cn, humanise } from "@/lib/utils";
import { blockedLine, draftNeeds, draftTitle, nextDraftKey, noticeText, type Blocked } from "@/lib/bulk-editor/save";
import { idsOfKeys, type DeleteIds } from "@/lib/bulk-editor/delete";
import { quickCreateAction } from "@/app/(app)/admin/actions";
import { expandPrefill, expandSteps, expandStepsForDraft } from "@/lib/bulk-editor/expand";
import { clearPrefill, writePrefill } from "@/lib/popup/prefill";
import { chain, POPUP_SAVED_EVENT, type PopupSaved } from "@/lib/bulk-editor/popup-nav";
import { menuDeleteIds, rowMenuItems, type MenuItemId } from "@/lib/bulk-editor/row-menu";
import type { DeleteOutcome } from "@/lib/bulk-editor/rows";
import { railFor } from "@/lib/bulk-editor/rail";
import { shelfFor } from "@/lib/bulk-editor/shelf";
import { effectiveFind, filterCount, filterRows, isFiltered, isSortable, NO_FIND, nextSort, sortRows, type Find } from "@/lib/bulk-editor/find";
import { decodeRef, encodePick, REF_CAN_CREATE, REF_NO_CREATE, REF_WHAT, refCandidates, refNames, type RefData } from "@/lib/bulk-editor/references";
import { listsWith, type LinkKey, type LinkLists } from "@/lib/bulk-editor/links";
import { copyText, matchName, parseTsv, readPasted, toTsv } from "@/lib/bulk-editor/clipboard";
import { indexSheet, resolve, type Level, type ValueField } from "@/lib/bulk-editor/resolve";
import { LIQUID_FIELDS } from "@/lib/bulk-editor/late-mark";
import { patchBottleRowAction, patchLabelRowAction } from "@/app/(wide)/bulk-editor/actions";
import { columnFor, defaultScope, nextScope, noteText, scopeSentence, scopesFor } from "@/lib/bulk-editor/scope";
import { platformKeyName } from "@/lib/platform";
import { copyValue } from "@/lib/bulk-editor/value-cells";
import { EXISTING_LABEL_REQUIRES_BOTTLES, linesForNewRows, pastedDraftConflict, settleDraft, type RowTexts } from "@/lib/bulk-editor/paste-rows";
import { ComboEditor } from "./combo-editor";
import { LinksEditor, type LinkOptions } from "./links-editor";
import { PanelEditor } from "./panel-editor";
import { FindBar } from "./find-bar";
import { RailContent } from "./rail-panel";
import { DeleteBar, DeleteDialog } from "./delete-bar";
import { RowMenuContent } from "./row-menu";
import type { ComboData, Editing, Finish } from "./types";
import { EditNote } from "./edit-note";
import { Notices, type Notice } from "./notices";
import { ResizeHandle } from "./resize-handle";
import { Shortcuts, ShortcutsFooter } from "./shortcuts";
import { SourceTag } from "./source-tag";
import { useRowSaver } from "./use-row-saver";

const VIEW_KEY = "bulk-editor:view";
const HIDDEN_KEY = "bulk-editor:hidden";
const RAIL_KEY = "bulk-editor:rail";
const WIDTHS_KEY = "bulk-editor:widths";
/** The width from which the rail is open until the person chooses: with it open the sheet still has about 900px at this width. */
const RAIL_AUTO_OPEN = "(min-width: 1280px)";

/** Brand and Label are held at the left while the rest of the sheet scrolls. Label sits against Brand, so it is offset by Brand's width. */
const FROZEN: Record<string, { left: string; width: number }> = { brand: { left: "0px", width: 156 }, name: { left: "var(--cw-brand, 156px)", width: 180 } };

/**
 * A column's width is a CSS variable on the sheet (`--cw-<id>`), set from the widths a person has dragged. Cells only
 * name the variable, so a drag moves the column by setting one property: no row re-renders. A column with no width
 * of its own and none dragged (`auto`) sizes to its content.
 */
const widthVar = (id: string) => `--cw-${id}`;
function widthStyle(column: SheetColumn): React.CSSProperties {
  const own = FROZEN[column.id]?.width ?? column.width;
  const v = `var(${widthVar(column.id)}, ${own === undefined ? "" : `${own}px`})`;
  return own === undefined
    ? { width: `var(${widthVar(column.id)}, auto)`, minWidth: `var(${widthVar(column.id)}, 0px)`, maxWidth: `var(${widthVar(column.id)}, none)` }
    : { width: v, minWidth: v, maxWidth: v };
}

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

/**
 * The scrollbars of the sheet's scroll box, as CSS variables on its parent (`--sbw`, `--sbh`), so the pane lying over the
 * box can stop short of them: a scrollbar under the pane could not be dragged.
 */
function useScrollbarInsets(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const body = ref.current;
    const box = body?.querySelector<HTMLElement>(":scope > .overflow-x-auto");
    if (!body || !box) return;
    const measure = () => {
      body.style.setProperty("--sbw", `${box.offsetWidth - box.clientWidth}px`);
      body.style.setProperty("--sbh", `${box.offsetHeight - box.clientHeight}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => observer.disconnect();
  }, [ref]);
}

/** Where the delete bar sits from `md` up: over the bottom of the sheet, to the left of the pane (18rem) while it is shown, clear of the scrollbars. */
const DELETE_BAR_OVER =
  "md:absolute md:bottom-[calc(1rem+var(--sbh,0px))] md:left-4 md:group-data-[rail=open]/body:right-[calc(19rem+var(--sbw,0px))] md:group-data-[rail=closed]/body:right-[calc(1rem+var(--sbw,0px))] md:group-data-[rail=auto]/body:right-[calc(1rem+var(--sbw,0px))] xl:group-data-[rail=auto]/body:right-[calc(19rem+var(--sbw,0px))]";

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
const PICKER_GROUPS: ReadonlyArray<PickerGroup> = (["label", "bottle", "value"] as const).flatMap((group) => {
  const title = group === "label" ? "Label" : group === "bottle" ? "Bottle" : "Values";
  const columns = SHEET_COLUMNS.filter((c) => c.group === group);
  const sections = [...new Set(columns.flatMap((c) => (c.section ? [c.section] : [])))];
  return [
    { id: group, title, columns: columns.filter((c) => !c.section && !c.with).map((c) => ({ id: c.id, label: c.band ?? c.label, locked: c.identity === true || c.always === true })) },
    ...sections.map((section) => ({ id: `${group}-${section.replace(/\W+/g, "-").toLowerCase()}`, title: `${title}: ${section}`, columns: columns.filter((c) => c.section === section && !c.with).map((c) => ({ id: c.id, label: c.band ?? c.label })) })),
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
    style: { left: frozen.left },
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
function ActiveEditor({ editor, row, kinds, initial, error, reach, scopeNote, onStep, onFinish, onInvalid, onInput }: { editor: CellEditor; row: SheetRow; kinds: SheetContext["kinds"]; initial: Editing; error: string | null; reach: number | null; /** For a value cell: who the edit is for, and the step to the next level. */ scopeNote: string | null; onStep: ((step: 1 | -1) => void) | undefined; onFinish: (finish: Finish) => void; onInvalid: (message: string) => void; onInput: (value: string) => void }) {
  const [draft, setDraft] = React.useState(initial.value);
  const input = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const el = input.current;
    if (el instanceof HTMLSelectElement) {
      el.focus();
      return;
    }
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
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
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter" && event.shiftKey && editor.spec.kind === "textarea") return;
        // Alt (Option) and the arrows step through the levels an edit can change; Tab, Enter and Escape keep their jobs.
        if (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          event.stopPropagation();
          onStep?.(event.key === "ArrowDown" ? 1 : -1);
          return;
        }
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
        onChange={(value) => {
          setDraft(String(value));
          onInput(String(value));
        }}
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
      ) : scopeNote !== null ? (
        <EditNote text={scopeNote} keyName={platformKeyName()} {...(onStep ? { onStep } : {})} />
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
  /** The columns of this row that are in the selected block (from, to), or -1 when none. */
  rangeFrom: number;
  rangeTo: number;
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
  /** Cells of this row that a paste left to be chosen, by column, with the text pasted. */
  pendingCols: Readonly<Record<string, string>> | undefined;
  /** The open editor of a distillery, mashbill, finish or ingredients cell (the label form's own picker); only for the active row. */
  linksNode: React.ReactNode;
  /** The open editor of a regions, older names or vintages cell (the label form's own control); only for the active row. */
  panelNode: React.ReactNode;
  onFinish: ((finish: Finish) => void) | undefined;
  onInvalid: ((message: string) => void) | undefined;
  onInput: ((value: string) => void) | undefined;
  /** The short note for the open value cell (who the edit is for), and the step to the next level; only for the active row. */
  scopeNote: string | null;
  onStep: ((step: 1 | -1) => void) | undefined;
};

/** The columns that hold a value which can come from the bottle, its vintage or the label (`resolve.ts`): what an edit changes is chosen. */
const VALUE_FIELD: Readonly<Record<string, ValueField>> = { sizeMl: "sizeMl", proof: "proof", abv: "proof", ageYears: "ageYears", ageMonths: "ageMonths", ageDays: "ageDays", ageStatement: "ageStatement", tequilaClass: "tequilaClass", brandyGrade: "brandyGrade", isNas: "ginIsNas" };

/** The values that move to a bottle marked a single barrel or private selection, in words: "proof and age". */
function liquidWords(fields: ReadonlyArray<string>): string {
  const words = new Set<string>();
  for (const field of fields) words.add(field === "proof" ? "proof" : field.startsWith("age") ? "age" : field === "tequilaClass" ? "tequila class" : "age designation");
  return [...words].join(" and ");
}

/** Two typed values are the same when the text is, or they are the same number (112 and 112.00). */
/** Edits of ABV are kept as proof, under Proof. */
const storedId = (column: string): string => (column === "abv" ? "proof" : column);
const sameValue = (a: string, b: string): boolean => a === b || (a !== "" && b !== "" && Number.isFinite(Number(a)) && Number(a) === Number(b));

/** A row of text cells. Memoised: moving between cells re-renders two rows, not the whole sheet. */
const SheetRowView = React.memo(function SheetRowView({ row, rowIndex, columns, view, context, rowEdits, labelEdits, unlocked, status, flash, rangeFrom, rangeTo, selected, onSelect, blockedColumn, blockedShort, blockedMessage, activeCol, editing, error, combo, linksNode, panelNode, pendingCols, onFinish, onInvalid, onInput, scopeNote, onStep }: RowProps) {
  return (
    <TableRow key={row.key} className="group">
      {columns.map((column, index) => {
        const editor = row.draft && (status === "saving" || status === "saved") ? null : editorFor(column, view, row, unlocked, context.kinds);
        const locked = isLocked(column, view, row, unlocked, context.kinds);
        const spec = EDITORS[column.id];
        // A label's cell keeps its edit under the label; it still shows if the view has since changed and the cell cannot be edited.
        const edited = staged(column.id, (spec?.scope === "label" && !row.draft ? labelEdits : rowEdits)?.[storedId(column.id)]);
        const waiting = pendingCols?.[column.id];
        const cell: Cell = waiting !== undefined ? { text: waiting, muted: true, inferred: true, badge: "Choose" } : edited !== undefined && spec && (column.group !== "value" || row.draft) ? spec.display(edited, context, row) : column.cell(row, context);
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
            aria-selected={isActive || (index >= rangeFrom && index <= rangeTo) || undefined}
            aria-readonly={editor ? undefined : true}
            data-r={rowIndex}
            data-c={index}
            className={cn(
              "relative h-9 border-b border-border py-0",
              column.align === "right" && "text-right",
              cell.muted && "text-muted-foreground",
              cell.inferred && "italic",
              column.width && "px-2",
              column.identity && !cell.muted && "font-medium",
              (edited !== undefined || moved) && "bg-muted",
              flash && "bg-muted",
              index >= rangeFrom && index <= rangeTo && "bg-primary/15",
              locked && "cursor-not-allowed bg-muted/50 text-muted-foreground",
              editor && "cursor-cell",
              // The outline is the sheet's own: a `focus:outline-none` here would beat it whenever the cell has focus, which is always while it is the active one.
              isBlocked ? "outline outline-2 -outline-offset-2 outline-destructive" : isActive && !isEditing ? "outline outline-2 -outline-offset-2 outline-ring" : "outline-none",
              ruleClass(index, column, columns[index - 1]),
              frozen.className,
            )}
            style={{ ...frozen.style, ...widthStyle(column) }}
          >
            <span className={cn("flex items-center gap-1.5", column.align === "right" && "justify-end", isEditing && "invisible")} title={isBlocked ? blockedMessage : locked ? (spec?.lock?.(row, context.kinds) ?? "Triple-click to edit") : reach !== null ? changesText(reach) : (cell.note ?? cell.text)}>
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
                  {cell.marker ? <SourceTag marker={cell.marker} /> : null}
                  <span className="block truncate" style={{ maxWidth: `var(${widthVar(column.id)}, ${column.identity ? "none" : "14rem"})` }}>{cell.text}</span>
                  {isBlocked ? <CircleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" /> : null}
                </>
              )}
              {locked ? <Lock aria-hidden className="size-3 shrink-0" /> : null}
              {cell.badge ? <span className="shrink-0 border border-border px-1 text-[10px] uppercase leading-4 tracking-wide text-muted-foreground">{cell.badge}</span> : null}
            </span>
            {isEditing && editing && editor && onFinish && onInvalid && onInput ? (
              editor.panel && panelNode ? (
                panelNode
              ) : editor.links && linksNode ? (
                linksNode
              ) : (editor.combo || editor.reference) && combo ? (
                <ComboEditor kind={editor.combo ?? "reference"} column={column.id} initial={editing} data={combo} error={error} onFinish={onFinish} onInvalid={onInvalid} onInput={onInput} />
              ) : (
                <ActiveEditor editor={editor} row={row} kinds={context.kinds} initial={editing} error={error} reach={reach} scopeNote={scopeNote} onStep={onStep} onFinish={onFinish} onInvalid={onInvalid} onInput={onInput} />
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
export function BulkEditor({ labels, bottles, vintages, brands, categories, groups, kinds, photos, refs, linkOptions, currency }: {
  labels: SheetLabel[];
  bottles: SheetBottle[];
  /** Each vintage's own proof and age, for the bottles on them. */
  vintages: SheetVintage[];
  brands: Array<{ id: number; name: string }>;
  categories: CategoryChoice[];
  groups: Record<number, FieldGroup>;
  kinds: SheetContext["kinds"];
  /** Thumbnails for the rail, by bottle and by label. */
  photos: { bottles: Record<number, SheetPhoto>; labels: Record<number, SheetPhoto> };
  /** What the store, cooperage, release and label-name cells choose from. */
  refs: RefData;
  /** What the distillery, mashbill and finish cells choose from: the label form's lists. */
  linkOptions: LinkOptions;
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
  const { widths, set: setWidth, clear: clearWidths } = useColumnWidths(WIDTHS_KEY);
  const [edits, setEdits] = React.useState<Edits>({});
  // Each vintage as it stands with what has been typed at the vintage level, so a bottle on it shows it at once. Rebuilt only when a vintage edit changes.
  const vintageEditsKey = JSON.stringify(Object.entries(edits).filter(([key]) => key.startsWith("v")));
  const index = React.useMemo(
    () => indexSheet(labels, bottles, applyVintageEdits(vintages, Object.fromEntries(JSON.parse(vintageEditsKey) as Array<[string, Record<string, string>]>))),
    [labels, bottles, vintages, vintageEditsKey],
  );
  const context = React.useMemo<SheetContext>(
    () => ({
      currency,
      kinds,
      refs: refNames(refs),
      categories: Object.fromEntries(categories.map((c) => [c.id, c.name])),
      index,
      lists: {
        versions: Object.fromEntries(Object.entries(refs.versions).map(([id, rows]) => [id, rows.map((r) => r.name)])),
        releases: Object.fromEntries(Object.entries(refs.releases).map(([id, rows]) => [id, rows.map((r) => r.name)])),
      },
    }),
    [currency, kinds, refs, categories, index],
  );
  const categoryInfo = React.useMemo(() => Object.fromEntries(categories.map((c) => [c.id, { name: c.name, group: groups[c.id] ?? "other", ...(c.slug ? { slug: c.slug } : {}) }])), [categories, groups]);

  const columns = React.useMemo(() => columnsFor(view, hidden), [view, hidden]);
  /** Bottles moved to another label, and the label cells a person has triple-clicked open. Neither is saved yet. */
  const [moves, setMoves] = React.useState<Moves>({});
  const [unlocked, setUnlocked] = React.useState<Unlocked>(new Set());
  const rawRows = React.useMemo(() => sheetRows(view, labels, bottles), [view, labels, bottles]);
  // Rows are in their sorted place as soon as a move or a rename is made, not once it has been saved and read back.
  const arranged = React.useMemo(() => arrange(rawRows, moves, edits, labels, categoryInfo), [rawRows, moves, edits, labels, categoryInfo]);

  // Search, filters and sort change what is shown, never what is saved. A row that has been worked on this session
  // (edited, moved, or just saved) is kept on screen whatever the filter says, and in place whatever the sort says,
  // until the filters are cleared or the page is reloaded.
  const router = useRouter();
  /** Rows ticked for deleting, and rows deleted that the page has not yet been reloaded without. */
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [deletedKeys, setDeletedKeys] = React.useState<ReadonlySet<string>>(new Set());
  /** The row the right-click menu was opened on (by key, since the row can change or go while it is open), and a delete it has asked about. */
  const [menuRowKey, setMenuRowKey] = React.useState<string | null>(null);
  const [deleteAsk, setDeleteAsk] = React.useState<DeleteIds | null>(null);
  const askedDelete = React.useRef(false);
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
  const sortable = React.useMemo(() => columns.filter((c) => isSortable(c.id)).map((c) => ({ id: c.id, label: c.sortLabel ?? c.label })), [columns]);

  // New rows: typed into the empty row at the bottom. Only the ones that have been started are kept here; the empty
  // one is made fresh each time (see `withBlankRow`).
  const [drafts, setDrafts] = React.useState<DraftRow[]>([]);
  /** New rows being expanded in the popup (see `useRowSaver`'s `held`). */
  const [held, setHeld] = React.useState<ReadonlySet<string>>(new Set());
  const editingDraft = React.useRef<string | null>(null);
  /** Bottles that have just been given a status that takes them off the shelf: said once, so the row going is not a surprise. */
  const [gone, setGone] = React.useState<Array<{ key: string; text: string; jump?: boolean }>>([]);
  /** Choice cells a paste left for the person to pick (what was pasted was only part of a name): by row and column, with the text pasted. Not saved. */
  const [pending, setPending] = React.useState<Record<string, string>>({});
  const pendKey = (rowKey: string, columnId: string) => `${rowKey}\u0000${columnId}`;
  const dropPending = (rowKey: string, columnId: string) =>
    setPending((prev) => {
      const key = pendKey(rowKey, columnId);
      if (!(key in prev)) return prev;
      const { [key]: _gone, ...rest } = prev;
      return rest;
    });
  const pendingByRow = React.useMemo(() => {
    const out = new Map<string, Record<string, string>>();
    for (const [key, text] of Object.entries(pending)) {
      const [rowKey, columnId] = key.split("\u0000") as [string, string];
      out.set(rowKey, { ...out.get(rowKey), [columnId]: text });
    }
    return out;
  }, [pending]);
  function leftShelf(key: string, status: string) {
    const bottle = bottles.find((b) => `b${b.id}` === key);
    const label = bottle ? labels.find((l) => l.id === bottle.expressionId) : undefined;
    const title = label ? `${label.brand} ${label.name}` : "A bottle";
    setGone((prev) => [...prev.filter((g) => g.key !== key), { key, text: `${title} is now ${humanise(status).toLowerCase()}, so it is no longer listed here. This sheet shows the bottles you own or have open.` }]);
  }
  // Notices in the corner: what the sheet did for the person (a proof and age moved to a bottle), with Undo, going by themselves.
  const [notices, setNotices] = React.useState<Notice[]>([]);
  const noticeCount = React.useRef(0);
  const pushNotice = React.useCallback((text: string, undo?: () => void) => {
    noticeCount.current += 1;
    const id = `n${noticeCount.current}`;
    setNotices((prev) => [...prev, { id, text, ...(undo ? { undo } : {}) }]);
  }, []);
  const dismissNotice = React.useCallback((id: string) => setNotices((prev) => prev.filter((n) => n.id !== id)), []);
  /** Gives a bottle's proof and age back to its label. The bottle's are cleared only once the label has taken them, and a refusal is said. */
  const putBack = React.useCallback(
    async (labelId: number, bottleId: number, values: Record<string, string>) => {
      const onLabel = await patchLabelRowAction(labelId, values);
      if (!onLabel.ok) {
        pushNotice(`Could not put ${liquidWords(Object.keys(values))} back on the label: ${onLabel.error}`);
        return;
      }
      const onBottle = await patchBottleRowAction(bottleId, Object.fromEntries(Object.keys(values).map((field) => [field, null])));
      if (!onBottle.ok) pushNotice(`Put ${liquidWords(Object.keys(values))} on the label, but could not clear them from the bottle: ${onBottle.error}`);
      router.refresh();
    },
    [pushNotice, router],
  );
  /** The labels made on this visit: only these can have their proof and age moved to a bottle marked a single barrel or private selection after they were saved. */
  const createdLabels = React.useRef(new Set<number>());
  /** The rows as drawn, for a notice that is made from inside a save (which runs outside the render that knows them). */
  const rowsNow = React.useRef<SheetRow[]>([]);
  const saver = useRowSaver({
    labels,
    bottles,
    view,
    edits,
    moves,
    drafts,
    setEdits,
    setMoves,
    setDrafts,
    onLanded: touch,
    held,
    onLeftShelf: leftShelf,
    onLabelCreated: (labelId) => createdLabels.current.add(labelId),
    onMoved: (key, moved) => {
      const row = rowsNow.current.find((r) => r.key === key);
      const labelId = row?.label.id;
      pushNotice(`${row ? `${row.label.brand} ${row.label.name}` : "This bottle"}: ${liquidWords(Object.keys(moved))} moved from the label to this bottle.`, labelId === undefined ? undefined : () => void putBack(labelId, Number(key.slice(1)), moved));
    },
    editingDraft,
    pendingByRow,
  });
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
    (list: DraftRow[]) => {
      const shown = list.filter((d) => !(createdAs[d.key] && savedKeys.has(createdAs[d.key]!)));
      const draftRows = withDraftVintages(shown.map((draft) => draftSheetRow(draft, draftContext)), edits);
      // New rows follow the saved ones, except one inserted below another, which sits directly under it (see `orderRows`).
      return orderRows(savedRows, draftRows.map((row, i) => ({ row, after: shown[i]!.insertAfter })));
    },
    [savedRows, savedKeys, createdAs, draftContext, edits],
  );
  const rows = React.useMemo(() => rowsFor(allDrafts), [rowsFor, allDrafts]);
  React.useLayoutEffect(() => {
    rowsNow.current = rows;
  }, [rows]);

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
  const [openEditor, setEditing] = React.useState<(Editing & { rowKey: string; columnId: string; original: string; /** For a value cell: the level the edit will change. */ scope: Level | null }) | null>(null);
  const [inputChanged, setInputChanged] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** The column a run of Tabs started in, which Enter returns to on the next row. */
  const anchorCol = React.useRef(0);
  const focusAfter = React.useRef(false);
  /** Set when Tab follows a row that has just moved to its sorted place: the view then goes with it. */
  const followRow = React.useRef(false);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  useScrollbarInsets(bodyRef);

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
  const editing = current && openEditor && openEditor.rowKey === rows[current.row]?.key && openEditor.columnId === columns[current.col]?.id
    ? openEditor
    : null;
  React.useLayoutEffect(() => {
    editingDraft.current = editing?.rowKey.startsWith("d") ? editing.rowKey : null;
  }, [editing]);
  /** Puts the cursor on the cell at `pos` of `list` (the rows as they are, unless the next position is worked out on others). */
  /**
   * A block of cells selected with Shift and the arrows or a Shift-click, from the cursor's cell (`anchor`) to `end`. Delete
   * clears every cell in it that can be cleared. Moving the cursor or editing a cell puts it away.
   */
  const [range, setRange] = React.useState<{ anchor: Pos; end: Pos } | null>(null);
  const place = (pos: Pos, list: SheetRow[] = rows) => {
    setRange(null);
    setActive({ key: list[pos.row]?.key ?? "", col: pos.col, row: pos.row });
  };

  const editorIn = (list: SheetRow[], pos: Pos): CellEditor | null => {
    const row = list[pos.row];
    const column = columns[pos.col];
    const savingDraft = row?.draft && (saver.rowState[row.key]?.kind === "saving" || createdAs[row.key] !== undefined);
    return row && column && !savingDraft ? editorFor(column, view, row, unlocked, context.kinds) : null;
  };
  const editorAt = (pos: Pos): CellEditor | null => editorIn(rows, pos);
  const valueAt = (pos: Pos): string => {
    const row = rows[pos.row]!;
    const editor = editorAt(pos);
    return editor ? (staged(columns[pos.col]!.id, edits[editKey(row, editor)]?.[storedId(columns[pos.col]!.id)]) ?? editor.initial(row)) : "";
  };

  function go(moved: Moved, list: SheetRow[] = rows) {
    if ("leave" in moved) return;
    focusAfter.current = true;
    place(moved.pos, list);
    anchorCol.current = moved.anchorCol;
  }

  function startEdit(pos: Pos, replace: boolean, typed?: string) {
    const row = rows[pos.row];
    const column = columns[pos.col];
    if (!row || !column || (row.draft && saver.draftSaving(row.key))) return;
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
    const categoryName = (value: string) => (value.startsWith("id:") ? (context.categories?.[Number(value.slice(3))] ?? "") : value);
    // A value cell opens on the value it shows (the bottle's, its vintage's or the label's), and an age only implied by a designation is not copied in.
    const valueField = VALUE_FIELD[column.id];
    const resolved = valueField ? resolve(valueField, row, context) : null;
    const heldRaw = resolved ? (resolved.derived || resolved.varies ? "" : (resolved.value ?? "")) : editorAt(pos)?.reference ? refName(valueAt(pos)) : editorAt(pos)?.combo === "category" ? categoryName(valueAt(pos)) : valueAt(pos);
    const held = column.id === "abv" ? proofToAbv(heldRaw) : heldRaw;
    // A cell a paste left to be chosen opens searching what was pasted.
    const waiting = pending[pendKey(row.key, column.id)];
    const value = waiting ?? chosen?.value ?? (replace ? (typed ?? "") : held);
    const original = waiting ?? held;
    editingDraft.current = row.draft ? row.key : null;
    setInputChanged(value !== original);
    setEditing({ value, replace: replace || waiting !== undefined, rowKey: row.key, columnId: column.id, original, scope: valueField && !row.draft && row.bottle ? defaultScope(row, valueField) : valueField && row.draft?.vintageName !== undefined ? "vintage" : null });
  }

  /** A yes/no cell is flipped, not opened: Space, Enter or a double click. */
  function flip(pos: Pos) {
    stage(pos, valueAt(pos) === "true" ? "false" : "true");
  }

  function stage(pos: Pos, value: string): { level: Level | undefined; key: string } | undefined {
    const row = rows[pos.row];
    const column = columns[pos.col];
    const editor = editorAt(pos);
    if (!row || !column || !editor) return;
    if (row.draft) setDrafts((prev) => (prev.some((d) => d.key === row.key) ? prev : [...prev, emptyDraft(row.key)]));
    // A value is written at the level chosen for it (or where it starts, for a paste or a clear): the bottle, its vintage, or the label.
    const level = levelFor(row, column.id);
    const key = editKey(row, editor, level);
    const storedAs = level ? columnFor(column.id, level) : storedId(column.id);
    // ABV is typed as a percentage and kept as proof.
    const stored = column.id === "abv" ? abvToProof(value) : value;
    const linkedOrigin = column.id === "originCountry" || column.id === "originRegion" ? `${column.id}Linked` : undefined;
    const withoutLinkedOrigin = (prev: Edits): Edits => {
      if (!linkedOrigin || prev[key]?.[linkedOrigin] === undefined) return prev;
      const { [linkedOrigin]: _linked, ...rest } = prev[key];
      return { ...prev, [key]: rest };
    };
    if (row.draft) {
      if (saver.draftSaving(row.key)) return;
      keepKeys(row.key);
      // A new row's cells are forgotten when put back to empty: there is nothing to send.
      setEdits((prev) => setEdit(withoutLinkedOrigin(prev), key, storedAs, stored, EDITORS[storedAs]?.initial(row) ?? editor.initial(row)));
      // Marked a single barrel or private selection after its proof and age were typed: they are the bottle's now, and the notice says so.
      if ((column.id === "singleBarrel" || column.id === "privateSelection") && value === "true") {
        const typed = LIQUID_FIELDS.filter((field) => (edits[row.key]?.[field] ?? "") !== "");
        const draft = allDrafts.find((d) => d.key === row.key);
        if (typed.length > 0 && draft) {
          const words = liquidWords(typed);
          const typedValues = Object.fromEntries(typed.map((field) => [field, edits[row.key]![field]!]));
          pushNotice(
            `${draftTitle(draft)}: ${words} ${words.includes(" and ") ? "are" : "is"} now this bottle's, since it's a ${column.id === "singleBarrel" ? "single barrel" : "private selection"}. Size stays on the label.`,
            () => {
              // The row may have been saved while the notice was up: then the values are already on the bottle, and go back the way a moved label's do.
              const savedKey = saver.createdAs[row.key];
              const saved = savedKey ? rowsNow.current.find((r) => r.key === savedKey) : undefined;
              if (savedKey && saved) void putBack(saved.label.id, Number(savedKey.slice(1)), typedValues);
              else setDrafts((prev) => prev.map((d) => (d.key === row.key ? { ...d, keepOnLabel: true } : d)));
            },
          );
        }
      }
      return undefined;
    }
    // A saved row saves as soon as a cell of it is committed. An edit that is already here is kept even when it is put
    // back to what the sheet shows: the earlier value may already be saved, and the sheet has not read it back yet.
    const had = edits[key]?.[storedAs] !== undefined || (linkedOrigin !== undefined && edits[key]?.[linkedOrigin] !== undefined);
    // A level that was stepped to is a decision: the same number written at another level is a change, not a no-op.
    const field = VALUE_FIELD[column.id];
    const stepped = field !== undefined && openEditor?.rowKey === row.key && openEditor.columnId === column.id && openEditor.scope !== null && openEditor.scope !== defaultScope(row, field);
    const current = levelText(row, column.id, level, editor);
    // Reopening a rounded ABV and leaving it alone must not rewrite the proof it came from.
    const same = column.id === "abv" ? sameValue(value, proofToAbv(current)) : sameValue(value, current);
    if (!had && !stepped && same) return undefined;
    touch(key);
    // Marked a single barrel or private selection on a label made on this visit that has only this bottle: ask for its proof and age to move too (the server checks the count).
    const net = (column.id === "singleBarrel" || column.id === "privateSelection") && value === "true" && row.bottle !== null && createdLabels.current.has(row.label.id) && row.label.bottleCount === 1;
    setEdits((prev) => ({ ...prev, [key]: { ...withoutLinkedOrigin(prev)[key], [storedAs]: stored, ...(net ? { moveLiquidFromLabel: "true" } : {}) } }));
    saver.request(key);
    return { level, key };
  }

  /** The level a value written to this cell goes to: the one stepped to in the open editor, else where it starts. Nothing for a cell that is not a value. */
  function levelFor(row: SheetRow, columnId: string): Level | undefined {
    const field = VALUE_FIELD[columnId];
    if (!field || row.draft || !row.bottle) return undefined;
    if (openEditor && openEditor.rowKey === row.key && openEditor.columnId === columnId && openEditor.scope) return openEditor.scope;
    return defaultScope(row, field);
  }

  /** What a level holds of a value now, as text: the bottle's own, the vintage's own, or the label's. */
  function levelText(row: SheetRow, columnId: string, level: Level | undefined, editor: CellEditor): string {
    const field = VALUE_FIELD[columnId];
    if (!field || !level) return editor.initial(row);
    const vintage = row.bottle?.releaseId == null ? undefined : context.index?.vintageById.get(row.bottle.releaseId);
    const raw = level === "bottle" ? (row.bottle as unknown as Record<string, unknown> | null)?.[field] : level === "vintage" ? (vintage as unknown as Record<string, unknown> | undefined)?.[field] : (row.label as unknown as Record<string, unknown>)[field === "ginIsNas" ? "isNas" : field];
    return raw === null || raw === undefined ? "" : String(raw);
  }

  /** Steps the level an open value cell will change: on with a positive step, back with a negative one. */
  function stepScope(step: 1 | -1) {
    const row = current ? rows[current.row] : undefined;
    const field = openEditor ? VALUE_FIELD[openEditor.columnId] : undefined;
    if (!row || !field || !openEditor?.scope) return;
    const levels = scopesFor(row, field);
    if (levels.length < 2) return;
    const to = nextScope(levels, openEditor.scope, step);
    setEditing((prev) => (prev ? { ...prev, scope: to } : prev));
  }

  /** The quiet time after a change made in a list's picker before it is saved, so typing a share is one save, not one per digit. */
  const LINKS_SAVE_AFTER_MS = 600;
  const linkTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  React.useEffect(() => () => linkTimers.current.forEach((timer) => clearTimeout(timer)), []);

  /** Records an edit to a column of a row without needing the cursor to be on it (a list changed in its picker, or what a link brings along). */
  function stageColumn(row: SheetRow, columnId: string, value: string) {
    const editor = EDITORS[columnId];
    const key = row.draft ? row.key : `l${row.label.id}`;
    if (row.draft) {
      setDrafts((prev) => (prev.some((d) => d.key === row.key) ? prev : [...prev, emptyDraft(row.key)]));
      keepKeys(row.key);
      setEdits((prev) => setEdit(prev, key, columnId, value, editor ? editor.initial(row) : ""));
      return key;
    }
    touch(key);
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], [columnId]: value } }));
    return key;
  }

  /** A list was changed in its picker: kept at once, saved after a quiet moment (or when the picker closes). */
  function changeLists(row: SheetRow, lists: LinkLists, changed: LinkKey[], brought: Record<string, string>) {
    let key = "";
    for (const which of changed) key = stageColumn(row, which, JSON.stringify(lists[which]));
    for (const [column, value] of Object.entries(brought)) key = stageColumn(row, column, value);
    if (row.draft || key === "") return;
    const pending = linkTimers.current.get(key);
    if (pending) clearTimeout(pending);
    linkTimers.current.set(key, setTimeout(() => {
      linkTimers.current.delete(key);
      saver.request(key);
    }, LINKS_SAVE_AFTER_MS));
  }

  /** A regions, older names or releases cell was changed in its control: kept at once, saved after a quiet moment (or when it closes). */
  function changePanel(row: SheetRow, columnId: string, value: string) {
    const key = stageColumn(row, columnId, value);
    if (row.draft || key === "") return;
    const pending = linkTimers.current.get(key);
    if (pending) clearTimeout(pending);
    linkTimers.current.set(key, setTimeout(() => {
      linkTimers.current.delete(key);
      saver.request(key);
    }, LINKS_SAVE_AFTER_MS));
  }

  /** The picker closed: anything not saved yet is saved now. */
  function flushLists(row: SheetRow) {
    const key = row.draft ? row.key : `l${row.label.id}`;
    const pending = linkTimers.current.get(key);
    if (pending) {
      clearTimeout(pending);
      linkTimers.current.delete(key);
      saver.request(key);
    }
  }

  /** `list` with the draft of this key changed, making it a real draft first if it is still the empty row. */
  function updatedDrafts(key: string, change: (draft: DraftRow) => DraftRow): DraftRow[] {
    keepKeys(key);
    const base = drafts.some((d) => d.key === key) ? drafts : [...drafts, emptyDraft(key)];
    return base.map((d) => (d.key === key ? change(d) : d));
  }

  /** A saved bottle is moved to another label that exists, and saved. */
  function moveBottleTo(row: SheetRow, target: number) {
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

  /** The cells a paste left to be chosen, in sheet order, except `except` (the one just dealt with). */
  function pendingCells(except?: string): Pos[] {
    const out: Pos[] = [];
    rows.forEach((row, r) => columns.forEach((column, c) => {
      const key = pendKey(row.key, column.id);
      if (key !== except && pending[key] !== undefined) out.push({ row: r, col: c });
    }));
    return out;
  }

  function finish(result: Finish) {
    if (!current) return;
    const row = rows[current.row];
    const columnId = columns[current.col]?.id;
    if (!row || !columnId) return;

    // A choice the sheet will not take is refused in the open editor, with the reason, rather than dropped.
    if ("pick" in result && columnId === "name" && result.pick.kind === "existing" && !view.bottles) {
      focusAfter.current = result.focus;
      setError(EXISTING_LABEL_REQUIRES_BOTTLES);
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
    setInputChanged(false);
    setError(null);
    // A pending choice remains until a value is accepted or the cell is explicitly cleared with Delete.
    if ("cancel" in result) return;
    const wasPending = pending[pendKey(row.key, columnId)] !== undefined && !("keep" in result);
    if (wasPending) dropPending(row.key, columnId);

    // The rows as they will be once this is applied: the next cell to land on can depend on what was just chosen
    // (a brand opens the Label cell), so the move is judged against them, not against the rows as they are now.
    let nextRows = rows;
    // Brand or Label on a saved row moves the bottle, or renames the label: the row goes to its sorted place at once.
    const reordered = !row.draft && (columnId === "brand" || columnId === "name") && ("pick" in result || "value" in result);
    if (reordered) flashRow(row.key);
    if ("value" in result) stage(current, result.value);
    else if ("pick" in result && editorAt(current)?.reference) stage(current, encodePick(result.pick));
    else if ("categoryId" in result && !row.draft) stage(current, `id:${result.categoryId}`);
    else if ("pick" in result && !row.draft) {
      // A saved row's Brand or Label. On a bottle it moves the bottle to the label picked, which already exists; with
      // only Labels on, a brand is picked (or created with Enter) for the label.
      if (row.bottle) {
        const target = result.pick.kind === "existing" ? result.pick.id : null;
        if (target !== null) moveBottleTo(row, target);
      } else if (columnId === "brand") stage(current, result.pick.name);
    } else if ("pick" in result || "categoryId" in result) {
      const nextDrafts = updatedDrafts(row.key, (draft) => {
        if ("categoryId" in result) return withCategory(draft, result.categoryId);
        if (columnId === "brand") return withBrand(draft, result.pick);
        const chosen = result.pick.kind === "existing" ? labels.find((l) => l.id === (result.pick as { id: number }).id) : undefined;
        return withLabel(draft, result.pick, chosen?.categoryId ?? null);
      });
      const settledDrafts = settleRow(nextDrafts, row.key, columnId);
      setDrafts(settledDrafts);
      nextRows = rowsFor(withBlankRow(settledDrafts, Math.max(keyFloor, Number(row.key.slice(1)) + 1)));
    }

    // Others still waiting to be chosen: the cursor goes to the next of them rather than along the row.
    if (wasPending) {
      const waiting = pendingCells(pendKey(row.key, columnId));
      const next = waiting.find((p) => p.row > current.row || (p.row === current.row && p.col > current.col)) ?? waiting[0];
      if (next) return go({ pos: next, anchorCol: next.col }, nextRows);
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
    // A saved label's category: an existing one, never a new one.
    if (row && editor?.combo === "category" && !row.draft) return { candidates: categoryCandidates(categories), allowCreate: false, what: "category", enterDropsDown: true };
    if (row && editor?.reference) {
      const kind = editor.reference;
      return { candidates: refCandidates(kind, row.label.id, refs), allowCreate: REF_CAN_CREATE[kind], what: REF_WHAT[kind], // On a new row, Enter on the vintage goes on to the next cell (its proof and age are the vintage's), as Brand and Label do, rather than leaving the row and saving it.
        enterDropsDown: !(row.draft && kind === "release"), ...(REF_NO_CREATE[kind] ? { noCreateReason: REF_NO_CREATE[kind] } : {}) };
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

  /** A column's width as drawn now, whether it was dragged, has its own, or sizes to its content. */
  function headWidth(id: string): number {
    return sheetRef.current?.querySelector<HTMLElement>(`#bulk-editor-col-${CSS.escape(id)}`)?.getBoundingClientRect().width ?? 0;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTableSectionElement>) {
    // While editing, the editor has the keys.
    if (editing) return;
    const hit = cellOf(event.target);
    if (!hit?.direct) return;
    const { pos } = hit;
    const { key } = event;

    // Ctrl+Z (Cmd+Z on a Mac), as in a spreadsheet: takes back the newest change that still has an Undo showing. With none showing it does nothing.
    const newest = [...notices].reverse().find((notice) => notice.undo);
    if (key.toLowerCase() === "z" && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && newest) {
      event.preventDefault();
      newest.undo?.();
      dismissNotice(newest.id);
      return;
    }

    // Alt+Shift+Left/Right narrows or widens the active column by 10px; Alt+Shift+Backspace gives it its own width back.
    if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && (key === "ArrowLeft" || key === "ArrowRight" || key === "Backspace")) {
      event.preventDefault();
      const id = columns[pos.col]?.id;
      if (id) {
        if (key === "Backspace") setWidth(id, null);
        else setWidth(id, clampWidth(headWidth(id) + (key === "ArrowRight" ? 10 : -10)));
      }
      return;
    }

    if (key === "Escape" && range) {
      event.preventDefault();
      setRange(null);
    } else if (ARROWS.has(key) && event.shiftKey) {
      // Shift extends a block from the cursor's cell, which stays where it is.
      event.preventDefault();
      const moved = arrowMove(range?.end ?? pos, key as ArrowKey, dims, event.ctrlKey || event.metaKey);
      if ("leave" in moved) return;
      const end = moved.pos;
      setRange({ anchor: range?.anchor ?? pos, end });
      sheetRef.current?.querySelector<HTMLElement>(`td[data-r="${end.row}"][data-c="${end.col}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else if (ARROWS.has(key)) {
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
      } else if (rows[pos.row] && columns[pos.col] && pending[pendKey(rows[pos.row]!.key, columns[pos.col]!.id)] !== undefined) {
        // A label waits for its brand, and a category for its label.
        event.preventDefault();
        const draft = drafts.find((d) => d.key === rows[pos.row]!.key);
        const conflict = draft && pastedDraftConflict(draft, pendingByRow.get(draft.key) ?? {}, { bottles: view.bottles, labels, categories });
        const text = conflict && conflict.column === columns[pos.col]!.id ? conflict.message : "Choose the brand first, then the label, then the category: each opens once the one before it is chosen.";
        setGone((prev) => [...prev.filter((g) => g.key !== "choose-first"), { key: "choose-first", text }]);
      }
    } else if (key === " " && !event.shiftKey && editorAt(pos)?.spec.kind === "checkbox") {
      event.preventDefault();
      flip(pos);
    } else if ((key === "Delete" || key === "Backspace") && range) {
      event.preventDefault();
      clearRange();
    } else if ((key === "Delete" || key === "Backspace") && rows[pos.row] && columns[pos.col] && pending[pendKey(rows[pos.row]!.key, columns[pos.col]!.id)] !== undefined) {
      // Drops what a paste left waiting.
      event.preventDefault();
      dropPending(rows[pos.row]!.key, columns[pos.col]!.id);
    } else if (key === "Delete" || key === "Backspace") {
      const editor = editorAt(pos);
      // A brand, label or category is changed by choosing another, not by emptying the cell.
      // A list is changed in its own picker, one row at a time, not emptied from the cell.
      if (editor && !editor.required && !editor.combo && !editor.links && !editor.panel) {
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
    open.add(lockKeyOf(EDITORS[column.id]!, row, column.id));
    setUnlocked(open);
    place(hit.pos);
    anchorCol.current = hit.pos.col;
  }

  /** Shift-click extends a block from the cursor's cell to the one clicked (the click must not move the cursor). */
  function onMouseDown(event: React.MouseEvent<HTMLTableSectionElement>) {
    // A plain click puts a selected block away, even on the cell the block started from (which takes no new focus).
    if (!event.shiftKey) {
      if (range) setRange(null);
      return;
    }
    if (!current) return;
    const hit = cellOf(event.target);
    if (!hit) return;
    event.preventDefault();
    setRange({ anchor: range?.anchor ?? current, end: hit.pos });
  }

  /** Clears every cell in the block that has something to clear and can be cleared (not a required cell, a pick of a brand or label, or a locked one). */
  function clearRange() {
    if (!range) return;
    const [r1, r2] = [Math.min(range.anchor.row, range.end.row), Math.max(range.anchor.row, range.end.row)];
    const [c1, c2] = [Math.min(range.anchor.col, range.end.col), Math.max(range.anchor.col, range.end.col)];
    let cleared = 0;
    for (let r = r1; r <= r2; r += 1) {
      for (let c = c1; c <= c2; c += 1) {
        const row = rows[r];
        const column = columns[c];
        if (row && column && pending[pendKey(row.key, column.id)] !== undefined) {
          dropPending(row.key, column.id);
          cleared += 1;
          continue;
        }
        const pos = { row: r, col: c };
        const editor = editorAt(pos);
        if (!editor || editor.required || editor.combo || editor.links || editor.panel) continue;
        const blank = editor.spec.kind === "checkbox" ? "false" : "";
        if (valueAt(pos) === blank) continue;
        stage(pos, blank);
        cleared += 1;
      }
    }
    setRange(null);
    setGone((prev) => [...prev.filter((g) => g.key !== "clear"), { key: "clear", text: cleared === 0 ? "Nothing in the selected cells could be cleared." : `Cleared ${cleared} ${cleared === 1 ? "cell" : "cells"}.` }]);
  }

  /** The block the cursor or the selection covers. */
  function blockOf(): { r1: number; r2: number; c1: number; c2: number } | null {
    if (range) return { r1: Math.min(range.anchor.row, range.end.row), r2: Math.max(range.anchor.row, range.end.row), c1: Math.min(range.anchor.col, range.end.col), c2: Math.max(range.anchor.col, range.end.col) };
    return current ? { r1: current.row, r2: current.row, c1: current.col, c2: current.col } : null;
  }

  /** A cell as it is drawn: what has been typed into it, else what the row holds. */
  function shownCell(row: SheetRow, column: SheetColumn): { shown: Cell; editor: CellEditor | null; value: string } {
    const editor = EDITORS[column.id] ?? null;
    const edited = editor ? staged(column.id, edits[editKey(row, editor)]?.[storedId(column.id)]) : undefined;
    const shown = edited !== undefined && editor ? editor.display(edited, context, row) : column.cell(row, context);
    return { shown, editor, value: edited ?? (editor ? editor.initial(row) : "") };
  }

  /** Ctrl+C: the cell, or the selected block, as tab-separated text (what Excel and Sheets copy, so it pastes there). */
  function onCopy(event: React.ClipboardEvent<HTMLTableSectionElement>) {
    if (editing) return;
    const block = blockOf();
    if (!block) return;
    const lines: string[][] = [];
    for (let r = block.r1; r <= block.r2; r += 1) {
      const row = rows[r];
      if (!row) continue;
      lines.push(columns.slice(block.c1, block.c2 + 1).map((column) => {
        // A value column holds what resolves for the row (the bottle's, its vintage's or the label's), which is not what its editor starts from.
        if (column.group === "value" && edits[editKey(row, EDITORS[column.id]!)]?.[column.id] === undefined) return copyValue(column.id, row, context);
        const { shown, editor, value } = shownCell(row, column);
        return copyText(editor, value, shown);
      }));
    }
    event.clipboardData.setData("text/plain", toTsv(lines));
    event.preventDefault();
  }

  /** Ctrl+V: tab-separated text pasted at the cursor, or one value over a selected block. */
  function onPaste(event: React.ClipboardEvent<HTMLTableSectionElement>) {
    if (editing || !current) return;
    const grid = parseTsv(event.clipboardData.getData("text/plain"));
    if (grid.length === 0) return;
    event.preventDefault();
    pasteGrid(grid);
  }

  function pasteGrid(grid: string[][]) {
    if (!current) return;
    const today = new Date().toISOString().slice(0, 10);
    const block = blockOf()!;
    const single = grid.length === 1 && grid[0]!.length === 1;
    const at = range ? { row: block.r1, col: block.c1 } : current;
    const targets: Array<{ pos: Pos; text: string; line: number }> = [];
    if (range && single) {
      for (let r = block.r1; r <= block.r2; r += 1) for (let c = block.c1; c <= block.c2; c += 1) targets.push({ pos: { row: r, col: c }, text: grid[0]![0]!, line: r - block.r1 });
    } else {
      grid.forEach((line, i) => line.forEach((text, j) => targets.push({ pos: { row: at.row + i, col: at.col + j }, text, line: i })));
    }

    let pasted = 0;

    /** The shared levels (a vintage, a label) this paste wrote to, so it never changes more bottles than it says. */

    const shared = new Map<string, string>();
    /** What each shared level was given in this paste: a level that is given two different values keeps only the last. */
    const given = new Map<string, { values: Set<string>; last: string }>();
    let toChoose = 0;
    let beyondColumns = 0;
    const beyondRows = new Set<number>();
    const skipped: string[] = [];
    const wait = (row: SheetRow, column: SheetColumn, text: string) => {
      setPending((prev) => ({ ...prev, [pendKey(row.key, column.id)]: text.trim() }));
      toChoose += 1;
    };

    for (const { pos, text, line } of targets) {
      const row = rows[pos.row];
      const column = columns[pos.col];
      if (!column) {
        beyondColumns += 1;
        continue;
      }
      // Lines that land on a new row, or past the last row, make new rows (below); a block filled with one value does not.
      if (!row || row.draft) {
        if (range && single) beyondRows.add(line);
        continue;
      }
      const where = `${row.label.brand} ${row.label.name} · ${column.band ? `${column.band} ${column.label}` : column.label}`;
      const skip = (why: string) => skipped.push(`${where}: ${why}`);
      const editor = editorAt(pos);
      if (!editor) {
        skip(isLocked(column, view, row, unlocked, context.kinds) ? "locked (triple-click it to open it)" : EDITORS[column.id]?.applies?.(row, context.kinds) === false ? "not used for this spirit" : "cannot be edited here");
        continue;
      }
      if (editor.links || editor.panel) {
        skip("a list is changed in its picker");
        continue;
      }
      // A cell that picks from a list: a complete name is taken, and a part of one is only something to search for.
      if (editor.reference || editor.combo) {
        const named = editor.reference
          ? refCandidates(editor.reference, row.label.id, refs)
          : editor.combo === "category"
            ? categoryCandidates(categories)
            : row.bottle
            ? moveCandidates(editor.combo === "brand" ? "brand" : "name", row, labels)
            : brandCandidates(brands, [], "");
        const found = matchName(text, named);
        if (found.kind === "blank") {
          if (editor.reference) {
            stage(pos, "");
            dropPending(row.key, column.id);
            pasted += 1;
          } else skip("a brand or label is changed by choosing another");
        } else if (found.kind === "exact") {
          if (editor.reference || editor.combo === "category") stage(pos, `id:${found.match.id}`);
          else if (row.bottle) moveBottleTo(row, found.match.id!);
          else stage(pos, found.match.name);
          dropPending(row.key, column.id);
          pasted += 1;
        } else wait(row, column, text);
        continue;
      }
      const read = readPasted(editor, text);
      if (!read.ok) {
        skip(read.message);
        continue;
      }
      const checked = parseCell(editor, read.value, today, row, context.kinds);
      if (!checked.ok) {
        skip(checked.message);
        continue;
      }
      // A label renamed to a name its brand already has is refused, as when typed.
      if (column.id === "name" && !row.bottle && checked.value !== "") {
        const clash = labels.find((l) => l.id !== row.label.id && l.brandId === row.label.brandId && l.name.trim().toLowerCase() === checked.value.trim().toLowerCase());
        if (clash) {
          skip(`you already have ${clash.brand} ${clash.name}`);
          continue;
        }
      }
      const written = stage(pos, checked.value);
      if (written?.level && written.level !== "bottle") {
        shared.set(written.key, scopeSentence(written.level, row, context));
        const seen = given.get(`${written.key}:${column.id}`) ?? { values: new Set<string>(), last: "" };
        seen.values.add(checked.value);
        seen.last = checked.value;
        given.set(`${written.key}:${column.id}`, seen);
      }
      pasted += 1;
    }

    // Lines that land on a new row, or past the last row, become new rows.
    let added = 0;
    if (!(range && single)) {
      const lines = linesForNewRows(rows, at.row, grid.length).map((i) => grid[i]!);
      if (lines.length > 0) {
        const made = makeNewRows(lines.slice(0, MAX_NEW_ROWS), at.col, today, skipped);
        added = made.rows;
        toChoose += made.waiting;
        beyondColumns += made.beyondColumns;
        if (lines.length > MAX_NEW_ROWS) skipped.push(`only the first ${MAX_NEW_ROWS} new rows were added`);
      }
    }

    setRange(null);
    const parts = [`Pasted ${pasted} ${pasted === 1 ? "cell" : "cells"}.`];
    if (shared.size > 0) parts.push(`Changed ${[...shared.values()].join(" and ")}.`);
    const clashes = [...given.values()].filter((g) => g.values.size > 1);
    if (clashes.length > 0) parts.push(`Different values were pasted to the same ${clashes.length === 1 ? "level" : "levels"}; the last ${clashes.length === 1 ? "one" : "of each"} (${clashes.map((g) => g.last).join(", ")}) was kept. Press ${platformKeyName()} and the down arrow in a cell to change only one bottle.`);
    if (added > 0) parts.push(`Added ${added} new ${added === 1 ? "row" : "rows"}.`);
    if (toChoose > 0) parts.push(`${toChoose} to choose: press Enter on a marked cell to pick from what matches. A new row saves once its required fields and pending choices are resolved.`);
    if (beyondRows.size > 0) parts.push(`${beyondRows.size} ${beyondRows.size === 1 ? "line" : "lines"} past the last row ${beyondRows.size === 1 ? "was" : "were"} not pasted.`);
    if (beyondColumns > 0) parts.push(`${beyondColumns} ${beyondColumns === 1 ? "cell" : "cells"} past the last column ${beyondColumns === 1 ? "was" : "were"} not pasted.`);
    if (skipped.length > 0) parts.push(`Not pasted: ${skipped.slice(0, 4).join("; ")}${skipped.length > 4 ? `; and ${skipped.length - 4} more` : ""}.`);
    setGone((prev) => [...prev.filter((g) => g.key !== "paste"), { key: "paste", text: parts.join(" "), jump: toChoose > 0 }]);
  }

  const MAX_NEW_ROWS = 300;

  /**
   * New rows from the lines a paste has below the last saved row. Each is a new row as if typed: a brand, label and
   * category that are complete names that exist are chosen, the rest wait to be picked, and every other value is kept
   * in the row (a label's facts are sent only if the label turns out to be a new one).
   */
  function makeNewRows(lines: string[][], startCol: number, today: string, skipped: string[]): { rows: number; waiting: number; beyondColumns: number } {
    let floor = keyFloor;
    let waiting = 0;
    let beyondColumns = 0;
    const made: DraftRow[] = [];
    const newEdits: Record<string, Record<string, string>> = {};
    const newPending: Record<string, string> = {};
    lines.forEach((cells, n) => {
      const key = `d${floor}`;
      floor += 1;
      const texts: RowTexts = {};
      const typed: Record<string, string> = {};
      cells.forEach((text, j) => {
        const column = columns[startCol + j];
        if (!column) {
          beyondColumns += 1;
          return;
        }
        const where = `New row ${n + 1} · ${column.band ? `${column.band} ${column.label}` : column.label}`;
        const blank = matchName(text, []).kind === "blank";
        if (column.id === "brand" || column.id === "name" || column.id === "category") {
          if (!blank) texts[column.id === "name" ? "name" : (column.id as "brand" | "category")] = text.trim();
          return;
        }
        if (blank) return;
        const editor = EDITORS[column.id];
        if (!editor) return void skipped.push(`${where}: cannot be edited here`);
        if (editor.links || editor.panel) return void skipped.push(`${where}: a list is changed in its picker`);
        if (editor.reference) {
          if (editor.reference === "release" || editor.reference === "version") return void skipped.push(`${where}: choose the label first`);
          const found = matchName(text, refCandidates(editor.reference, -1, refs));
          if (found.kind === "exact") typed[column.id] = `id:${found.match.id}`;
          else {
            newPending[pendKey(key, column.id)] = text.trim();
            waiting += 1;
          }
          return;
        }
        if (editor.combo) return;
        const read = readPasted(editor, text);
        if (!read.ok) return void skipped.push(`${where}: ${read.message}`);
        const checked = parseCell(editor, read.value, today);
        if (!checked.ok) return void skipped.push(`${where}: ${checked.message}`);
        if (checked.value === "") return;
        if (column.id === "abv") typed.proof ??= abvToProof(checked.value);
        else typed[column.id] = checked.value;
      });
      const settled = settleDraft(emptyDraft(key), texts, { bottles: view.bottles, brands, labels, categories, drafts: [...drafts, ...made] });
      made.push(settled.draft);
      for (const [name, text] of Object.entries(settled.left)) {
        newPending[pendKey(key, name)] = text;
        waiting += 1;
      }
      if (Object.keys(typed).length > 0) newEdits[key] = typed;
    });
    setDrafts((prev) => [...prev, ...made]);
    setKeyFloor((prev) => Math.max(prev, floor));
    setEdits((prev) => ({ ...prev, ...newEdits }));
    setPending((prev) => ({ ...prev, ...newPending }));
    return { rows: made.length, waiting, beyondColumns };
  }

  /** After a choice on a new row: what it was waiting for that the choice now allows (a label for its brand, a category for its label). */
  function settleRow(list: DraftRow[], key: string, except: string): DraftRow[] {
    const draft = list.find((d) => d.key === key);
    if (!draft) return list;
    const texts: RowTexts = {};
    for (const name of ["brand", "name", "category"] as const) {
      const waitingText = pending[pendKey(key, name)];
      if (name !== except && waitingText !== undefined) texts[name] = waitingText;
    }
    if (Object.keys(texts).length === 0) return list;
    const settled = settleDraft(draft, texts, { bottles: view.bottles, brands, labels, categories, drafts: list });
    for (const name of Object.keys(texts)) if (!(name in settled.left)) dropPending(key, name);
    return list.map((d) => (d.key === key ? settled.draft : d));
  }

  /** Puts the cursor on the first cell a paste left to be chosen. */
  function jumpToPending() {
    const first = pendingCells()[0];
    if (!first) return;
    focusAfter.current = true;
    place(first);
    anchorCol.current = first.col;
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
    const requested = focusAfter.current;
    focusAfter.current = false;
    const focusedCell = document.activeElement?.closest("td[data-r]");
    if (!requested && !sheetRef.current?.contains(focusedCell ?? null)) return;
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

  // Showing the Details pane puts it over the right edge, where the selected cell may be: bring the cell back into view, clear of the pane.
  React.useEffect(() => {
    if (railChoice !== "open" || !current) return;
    sheetRef.current?.querySelector<HTMLElement>(`td[data-r="${current.row}"][data-c="${current.col}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // Only the pane being shown matters, not where the cursor is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railChoice]);

  // What has not been saved: new rows that have been started, and rows with an edit or a move that is not yet saved.
  const stateOf = saver.rowState;
  const notSaved = new Set<string>();
  for (const d of drafts) if (!isBlank(d, edits, pendingByRow.has(d.key)) && stateOf[d.key]?.kind !== "saved") notSaved.add(d.key);
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
    const pendingColumn = Object.keys(pendingByRow.get(d.key) ?? {})[0];
    if (isBlank(d, edits, pendingColumn !== undefined) || state?.kind === "saving" || state?.kind === "saved") continue;
    if (state?.kind === "blocked") blockedRows.push({ key: d.key, title: draftTitle(d), message: state.message, column: state.column, short: state.message });
    else {
      const conflict = pastedDraftConflict(d, pendingByRow.get(d.key) ?? {}, { bottles: view.bottles, labels, categories });
      if (conflict) {
        blockedRows.push({ key: d.key, title: draftTitle(d), message: conflict.message, column: conflict.column, short: conflict.message });
        continue;
      }
      const need = draftNeeds(d) ?? (pendingColumn ? { column: pendingColumn, action: "choose or clear the pasted value", short: "Choose a value" } : null);
      if (need && (activeKey !== d.key || idle)) blockedRows.push({ key: d.key, title: draftTitle(d), action: need.action, column: need.column, short: need.short });
    }
  }
  for (const [key, state] of Object.entries(stateOf)) {
    if (state.kind !== "blocked" || key.startsWith("d")) continue;
    // A vintage's key is `v<releaseId>`: named by its label and its own name.
    const vintage = key.startsWith("v") ? vintages.find((v) => v.id === Number(key.slice(1))) : undefined;
    const label = vintage ? labels.find((l) => l.id === vintage.labelId) : key.startsWith("l") ? labels.find((l) => `l${l.id}` === key) : rows.find((r) => r.key === key)?.label;
    blockedRows.push({ key, title: label ? `${label.brand} ${label.name}${vintage ? ` ${vintage.name}` : ""}` : "A row", message: state.message, column: state.column, short: state.message });
  }
  const blockedByKey = new Map(blockedRows.map((b) => [b.key, b]));
  const vintageKeyOf = (row: SheetRow) => (row.bottle?.releaseId == null ? undefined : `v${row.bottle.releaseId}`);
  const blockedFor = (row: SheetRow) => blockedByKey.get(row.key) ?? (row.draft ? undefined : (blockedByKey.get(`l${row.label.id}`) ?? blockedByKey.get(vintageKeyOf(row) ?? "")));
  /** The glyph on a row: a failed or unready save, one on its way, one just done, or a new row not saved yet. */
  const statusOf = (row: SheetRow): RowStatus | undefined => {
    if (blockedFor(row)) return "blocked";
    const stored = stateOf[row.key] ?? (row.draft ? undefined : (stateOf[`l${row.label.id}`] ?? stateOf[vintageKeyOf(row) ?? ""]));
    if (stored && stored.kind !== "blocked") return stored.kind;
    return row.draft && !isBlank(allDrafts.find((d) => d.key === row.key) ?? { key: row.key, brand: null, label: null, categoryId: null }, edits, pendingByRow.has(row.key)) ? "draft" : undefined;
  };

  /** Where the cursor goes for "Go to first": the first blocked row, on the cell that blocks it. */
  function jumpToFirst() {
    const first = blockedRows[0];
    if (!first) return;
    const row = rows.findIndex((r) => r.key === first.key || (first.key.startsWith("l") && !r.draft && `l${r.label.id}` === first.key) || (first.key.startsWith("v") && vintageKeyOf(r) === first.key));
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
      if (sheetRef.current?.contains(target) || target?.closest?.("[data-bulk-editor-panel], [data-notice], [data-radix-popper-content-wrapper], [role=dialog]")) return;
      // After the click has been handled: a cell being edited commits first.
      setTimeout(() => saver.saveDrafts(), 50);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [saver]);

  // Leaving the page with anything unsaved, blocked or on its way asks first. New rows do not survive a reload.
  const leaveWarning = unsaved > 0 || saving || blockedRows.length > 0 || (editing !== null && inputChanged);
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
      if (!window.confirm("This sheet has unsaved changes. Leave anyway?")) {
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
  const panelNode = (() => {
    if (!current || !editing) return null;
    const row = rows[current.row];
    const editor = editorAt(current);
    if (!row || !editor?.panel) return null;
    const own = edits[row.draft ? row.key : `l${row.label.id}`];
    return (
      <PanelEditor
        key={`${row.key}:${editor.panel}`}
        which={editor.panel}
        labelId={row.draft ? null : row.label.id}
        regions={row.label.regions ?? []}
        edited={own?.[editor.panel]}
        onChange={(value) => changePanel(row, editor.panel!, value)}
        onClose={() => {
          flushLists(row);
          finish({ keep: true, move: "stay", focus: true });
        }}
      />
    );
  })();
  const linksNode = (() => {
    if (!current || !editing) return null;
    const row = rows[current.row];
    const editor = editorAt(current);
    if (!row || !editor?.links) return null;
    const own = edits[row.draft ? row.key : `l${row.label.id}`];
    const edited = (["distilleries", "mashbills", "finishes", "ingredients"] as const).filter((key) => own?.[key] !== undefined);
    return (
      <LinksEditor
        key={`${row.key}:${editor.links}`}
        which={editor.links}
        label={row.label}
        kind={context.kinds[row.label.categoryId] ?? null}
        labelId={row.draft ? null : row.label.id}
        start={listsWith(row.label, own)}
        edited={edited}
        staged={own}
        options={linkOptions}
        onChange={(lists, changed, brought) => changeLists(row, lists, changed, brought)}
        onClose={() => {
          flushLists(row);
          finish({ keep: true, move: "stay", focus: true });
        }}
      />
    );
  })();

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
    const gone = new Set([...outcome.deletedLabelIds.map((id) => `l${id}`), ...outcome.deletedBottleIds.map((id) => `b${id}`)]);
    setDeletedKeys((prev) => new Set([...prev, ...gone]));
    setSelected(new Set(ticked.filter((key) => !gone.has(key))));
    // Anything typed into a row that is gone goes with it.
    for (const key of gone) {
      clearTimeout(linkTimers.current.get(key));
      linkTimers.current.delete(key);
    }
    saver.forgetDeleted(gone);
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !gone.has(key))));
    setMoves((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !gone.has(key))));
    React.startTransition(() => router.refresh());
  }

  // The right-click menu. It acts on the row that was clicked, found again by its key when an item is chosen: the row may have gone.
  const menuTarget = () => (menuRowKey === null ? undefined : rows.find((r) => r.key === menuRowKey));
  const menuRow = menuTarget();
  const menuItems = menuRow
    ? rowMenuItems(menuRow, view, { blank: menuRow.draft !== undefined && !drafts.some((d) => d.key === menuRow.key) })
    : [];
  function onContextMenu(event: React.MouseEvent<HTMLTableSectionElement>) {
    // While a cell is being edited the browser's menu stays (Paste); see the trigger's `disabled`.
    if (editing) return;
    const hit = cellOf(event.target);
    const row = hit ? rows[hit.pos.row] : undefined;
    if (!hit || !row) {
      // Not on a cell: neither menu.
      event.preventDefault();
      return;
    }
    place(hit.pos);
    setMenuRowKey(row.key);
  }
  // A touch or pen long-press opens the menu without a contextmenu event, so the row is taken from the press itself.
  function onPointerDown(event: React.PointerEvent<HTMLTableSectionElement>) {
    if (event.pointerType === "mouse" || editing) return;
    const hit = cellOf(event.target);
    const row = hit ? rows[hit.pos.row] : undefined;
    if (row) setMenuRowKey(row.key);
  }
  /** Takes a new row that is not saved away, with everything typed into it. */
  function discardDraft(key: string) {
    if (saver.draftSaving(key)) return;
    clearTimeout(linkTimers.current.get(key));
    linkTimers.current.delete(key);
    saver.forgetDeleted(new Set([key]));
    setDrafts((prev) => prev.filter((d) => d.key !== key));
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));
    setMoves((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));
    setPending((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k.split("\u0000")[0] !== key)));
  }
  const askDelete = (id: "deleteLabel" | "deleteBottle") => {
    const row = menuTarget();
    if (!row || row.draft || (id === "deleteBottle" && !row.bottle)) return;
    askedDelete.current = true;
    setDeleteAsk(menuDeleteIds(id, row));
  };
  /** A new row directly below the clicked one, starting with its brand (and label), and the cursor on its first empty cell that can be typed in. */
  function insertBelow() {
    const source = menuTarget();
    if (!source) return;
    const key = nextDraftKey(drafts, keyFloor);
    // Reserved like every other new row's key: a key given out again after its row was discarded would be one the saver treats as gone.
    keepKeys(key);
    const made = insertionDraft(key, source, view, source.draft ? drafts.find((d) => d.key === source.key) : undefined);
    const nextDrafts = [...drafts, made];
    const nextRows = rowsFor(withBlankRow(nextDrafts, keyFloor));
    setDrafts(nextDrafts);
    const at = nextRows.findIndex((r) => r.key === key);
    if (at < 0) return;
    const empty = columns.findIndex((_, col) => {
      const editor = editorIn(nextRows, { row: at, col });
      return editor !== null && editor.initial(nextRows[at]!) === "";
    });
    const col = empty >= 0 ? empty : Math.max(0, columns.findIndex((c) => c.id === "name"));
    go({ pos: { row: at, col }, anchorCol: col }, nextRows);
  }
  /** Opens one of the app's real pages in the popup over the sheet (the `@modal` slot renders it). */
  const openPopup = (url: string) => router.push(url as Route);
  /**
   * Expand record on a saved row: what is waiting to be saved on it is saved first (the popup reads the database, so it
   * would show old values and its own save would clash with the cells still waiting), and if that fails the popup does
   * not open: the failure is already on the cell.
   */
  async function expandRow() {
    const row = menuTarget();
    if (row?.draft) {
      await expandDraft(row);
      return;
    }
    const steps = row && !row.draft ? expandSteps(row, view) : null;
    if (!row || !steps) return;
    const keys = [row.key, `l${row.label.id}`, vintageKeyOf(row)].filter((key): key is string => Boolean(key));
    for (const key of keys) {
      if (Object.keys(edits[key] ?? {}).length === 0 && moves[key] === undefined) continue;
      if ((await saver.settle(key))?.kind === "blocked") return;
    }
    openPopup(chain(steps));
  }
  /**
   * Expand record on a new row: its typed values go to the real form through the prefill, and the row is held back from
   * saving until the popup is over (the popup takes focus, which would otherwise save a finished row behind its back). A
   * brand that does not exist yet is made first, as the Brand picker's own "create" would.
   */
  async function expandDraft(row: SheetRow) {
    const draft = allDrafts.find((d) => d.key === row.key);
    if (!draft) return;
    if (saver.draftSaving(draft.key)) {
      pushNotice("This row is saving. Try again in a moment.");
      return;
    }
    const prefill = expandPrefill(draft, edits[draft.key], pendingByRow.get(draft.key), view);
    let target = draft;
    if (prefill.newBrand !== null) {
      const made = await quickCreateAction("brands", prefill.newBrand);
      if (!made.ok) {
        pushNotice(`Could not make the brand "${prefill.newBrand}": ${made.error}`);
        return;
      }
      prefill.label.brandId = Number(made.option.value);
      const brand = { kind: "existing" as const, id: Number(made.option.value), name: made.option.label };
      // The row now names a brand that exists; its label and category are its own and stay.
      if (draft.brand?.kind === "new") {
        target = { ...draft, brand };
        setDrafts((prev) => prev.map((d) => (d.key === draft.key ? { ...d, brand } : d)));
      }
      prefill.newBrand = null;
    }
    const token = writePrefill(prefill);
    const steps = expandStepsForDraft(target, view, token);
    if (!steps) {
      clearPrefill(token);
      return;
    }
    // What was typed there is gone once the form saves and the row is replaced, so say so before the form opens.
    if (prefill.dropped.length > 0) pushNotice(`Not carried into the form: ${prefill.dropped.join(", ")}. Add them there, or cancel and switch the view; they are lost once it saves.`);
    heldRef.current = { key: draft.key, token };
    heldAway.current = false;
    setHeld((prev) => new Set(prev).add(draft.key));
    openPopup(chain(steps));
  }
  const menuHandlers: Partial<Record<MenuItemId, () => void>> = {
    expand: () => void expandRow(),
    insert: insertBelow,
    duplicateLabel: () => {
      const row = menuTarget();
      if (row && !row.draft) openPopup(`/expressions/new?duplicate=${row.label.id}`);
    },
    duplicateBottle: () => {
      const row = menuTarget();
      if (row?.bottle && !row.draft) openPopup(`/bottles/new?duplicate=${row.bottle.id}`);
    },
    deleteLabel: () => askDelete("deleteLabel"),
    deleteBottle: () => askDelete("deleteBottle"),
    discard: () => {
      const row = menuTarget();
      if (row?.draft) discardDraft(row.key);
    },
  };
  // A new row being expanded: held back from saving while its popup is open, and let go (or replaced by what the popup made) when it is over.
  const pathname = usePathname();
  const heldRef = React.useRef<{ key: string; token: string } | null>(null);
  /** The popup's url has been seen since the hold began, so being back on the sheet means it is over. */
  const heldAway = React.useRef(false);
  const releaseHeld = React.useCallback((): string | null => {
    const now = heldRef.current;
    if (!now) return null;
    heldRef.current = null;
    heldAway.current = false;
    clearPrefill(now.token);
    setHeld((prev) => {
      const next = new Set(prev);
      next.delete(now.key);
      return next;
    });
    return now.key;
  }, []);
  const onHeldSaved = React.useRef<() => void>(() => {});
  React.useLayoutEffect(() => {
    onHeldSaved.current = () => {
      const key = releaseHeld();
      if (key) discardDraft(key);
    };
  });
  // Back on the sheet without a save having been reported: the popup was cancelled, and the row is as it was.
  React.useEffect(() => {
    const now = heldRef.current;
    if (!now) return;
    // A ref written from an effect, which is what it is for: no render depends on it.
    // eslint-disable-next-line react-hooks/immutability
    if (pathname !== "/bulk-editor") heldAway.current = true;
    else if (heldAway.current) releaseHeld();
  }, [pathname, releaseHeld]);

  // The popup over the sheet saved a label or a bottle: once the reloaded data has it, keep it on screen, flash it and scroll to it.
  const popupLanded = React.useRef<PopupSaved | null>(null);
  React.useEffect(() => {
    const onSaved = (event: Event) => {
      const saved = (event as CustomEvent<PopupSaved>).detail;
      if (!saved || (saved.bottleId === undefined && saved.labelId === undefined)) return;
      // The popup made what a new row was for: the row is replaced by the saved one.
      onHeldSaved.current();
      popupLanded.current = saved;
      // A label's id keeps every row of that label from being filtered out, a bottle's keeps just that row.
      setTouched((prev) => new Set(prev).add(saved.bottleId !== undefined ? `b${saved.bottleId}` : `l${saved.labelId}`));
    };
    window.addEventListener(POPUP_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(POPUP_SAVED_EVENT, onSaved);
  }, []);
  React.useEffect(() => {
    const saved = popupLanded.current;
    if (!saved) return;
    const at = rows.findIndex((r) => !r.draft && (saved.bottleId !== undefined ? r.key === `b${saved.bottleId}` : r.label.id === saved.labelId));
    if (at < 0) return;
    popupLanded.current = null;
    flashRow(rows[at]!.key);
    sheetRef.current?.querySelector<HTMLElement>(`td[data-r="${at}"]`)?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [rows]);
  /** The dialog the menu's delete items open has no trigger to return focus to, so it goes back to the cursor's cell. */
  const deleteDialogCloseFocus = (event: Event) => {
    event.preventDefault();
    if (current) sheetRef.current?.querySelector<HTMLElement>(`td[data-r="${current.row}"][data-c="${current.col}"]`)?.focus({ preventScroll: true });
  };
  const menuCloseFocus = (event: Event) => {
    event.preventDefault();
    // An item that opened the delete dialog leaves focus to the dialog.
    if (askedDelete.current) {
      askedDelete.current = false;
      return;
    }
    if (current) sheetRef.current?.querySelector<HTMLElement>(`td[data-r="${current.row}"][data-c="${current.col}"]`)?.focus({ preventScroll: true });
  };

  // Editing a cell that belongs to the label changes every bottle on it; the rail says so as well as the cell.
  const railEditor = current && editing ? editorAt(current) : null;
  const railField = current ? VALUE_FIELD[columns[current.col]?.id ?? ""] : undefined;
  const railReach = railRow && railEditor && railEditor.scope === "label" && !railEditor.combo && !railRow.draft && railRow.bottle && !railField ? railRow.label.bottleCount : null;
  // For a value cell, where the value comes from and what typing would change, said in full (the short note is under the cell while it is edited).
  const railChanges = railRow && railField && railRow.bottle && !railRow.draft ? `Typing changes ${scopeSentence(editing?.scope ?? defaultScope(railRow, railField), railRow, context)}.` : null;

  // Brand and Label sit under one "Label" caption; the Bottle group has its own, after a dark rule.
  const frozenCount = columns.filter((c) => FROZEN[c.id]).length;
  // After the frozen Brand and Label, a caption for each run of columns of one group: the sheet interleaves what a bottle is (Label, Bottle) with its values.
  const runs = columns
    .filter((c) => !FROZEN[c.id])
    .reduce<Array<{ group: SheetColumn["group"]; span: number }>>((out, c) => {
      const last = out[out.length - 1];
      if (last && last.group === c.group) last.span += 1;
      else out.push({ group: c.group, span: 1 });
      return out;
    }, []);
  const hasBand = columns.some((c) => c.band !== undefined);

  return (
    <div
      ref={sheetRef}
      style={Object.fromEntries(Object.entries(widths).map(([id, w]) => [widthVar(id), `${w}px`])) as React.CSSProperties}
      className="flex min-w-0 flex-col gap-3 md:min-h-0 md:flex-1"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="w-full text-3xl text-accent md:mr-3 md:w-auto">Bulk editor</h1>
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
        {Object.keys(widths).length > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearWidths}>
            Reset widths
          </Button>
        ) : null}
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
                  setPending((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !notSaved.has(key.split("\u0000")[0]!))));
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

      <div className="flex min-w-0 flex-col border border-border bg-card md:min-h-80 md:flex-1">
        {/* From md up the sheet scrolls inside a box that fits the window, so the headers stay put and the keyboard's scroll-into-view keeps the active cell clear of them, of the frozen columns and, while the Details pane is over the sheet, of the pane (the pane's width is the scroll box's right padding and scroll padding). */}
        <div ref={bodyRef} data-rail={railChoice ?? "auto"} data-bar={ticked.length > 0 ? "on" : "off"} className="group/body relative flex min-h-0 flex-1 flex-col md:[&>.overflow-x-auto]:min-h-0 md:[&>.overflow-x-auto]:flex-1 md:[&>.overflow-x-auto]:overflow-y-auto md:[&>.overflow-x-auto]:scroll-pl-[calc(var(--cw-brand,156px)+var(--cw-name,180px))] md:[&>.overflow-x-auto]:scroll-pt-16 md:data-[rail=open]:[&>.overflow-x-auto]:pr-72 md:data-[rail=open]:[&>.overflow-x-auto]:scroll-pr-72 xl:data-[rail=auto]:[&>.overflow-x-auto]:pr-72 xl:data-[rail=auto]:[&>.overflow-x-auto]:scroll-pr-72 md:data-[bar=on]:[&>.overflow-x-auto]:pb-20 md:data-[bar=on]:[&>.overflow-x-auto]:scroll-pb-20">
      <Table role="grid" aria-label="Bulk editor" aria-rowcount={rows.length + 1} className="border-separate border-spacing-0 whitespace-nowrap tabular-nums">
        <TableHeader>
          <TableRow className="border-b-0 hover:bg-transparent">
            <TableHead colSpan={frozenCount} className="sticky top-0 z-30 h-7 bg-card text-[11px] tracking-wider md:left-0" style={{ minWidth: "calc(var(--cw-brand, 156px) + var(--cw-name, 180px))" }}>
              Label
            </TableHead>
            {runs.map((run, i) => (
              <TableHead
                key={i}
                colSpan={run.span}
                className={cn("sticky top-0 z-20 h-7 bg-card text-[11px] tracking-wider", i === 0 && run.group === "label" ? "border-l border-l-border/40" : "border-l border-l-foreground")}
              >
                {/* The first label run continues the frozen Label caption, so it is not named again. */}
                {run.group === "label" ? (i === 0 ? <span className="sr-only">Label, continued</span> : "Label") : run.group === "bottle" ? "Bottle" : <span className="sr-only">Values</span>}
              </TableHead>
            ))}
          </TableRow>
          {/* A caption over columns that belong together (the three age boxes). Only here when one is shown, so the last row is always the column headers. */}
          {hasBand ? (
            <TableRow className="hover:bg-transparent">
              {columns.map((column, index) => {
                if (column.band && columns[index - 1]?.band === column.band) return null;
                let span = 1;
                while (column.band && columns[index + span]?.band === column.band) span += 1;
                const frozen = frozenProps(column, true);
                return (
                  <TableHead
                    key={column.id}
                    colSpan={span}
                    className={cn(HEAD_CELL, "h-6 text-center text-[10px] tracking-wider", ruleClass(index, column, columns[index - 1]), frozen.className)}
                    style={{ ...frozen.style, top: 28 }}
                  >
                    {column.band ?? null}
                  </TableHead>
                );
              })}
            </TableRow>
          ) : null}
          <TableRow className="hover:bg-transparent">
            {columns.map((column, index) => {
              const frozen = frozenProps(column, true);
              return (
                <TableHead
                  key={column.id}
                  id={`bulk-editor-col-${column.id}`}
                  scope="col"
                  aria-sort={activeSort?.column === column.id ? (activeSort.desc ? "descending" : "ascending") : undefined}
                  className={cn(HEAD_CELL, "font-medium", column.align === "right" && "text-right", column.width && "px-2", ruleClass(index, column, columns[index - 1]), frozen.className)}
                  style={{ ...frozen.style, top: hasBand ? 52 : 28, ...widthStyle(column) }}
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
                  <ResizeHandle
                    measure={() => headWidth(column.id)}
                    live={(px) => sheetRef.current?.style.setProperty(widthVar(column.id), `${px}px`)}
                    commit={(px) => setWidth(column.id, px)}
                    reset={() => {
                      sheetRef.current?.style.removeProperty(widthVar(column.id));
                      setWidth(column.id, null);
                    }}
                  />
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        {/* The row is forgotten when the menu closes, so a menu can never open on an earlier row's items. */}
        <ContextMenu onOpenChange={(open) => { if (!open) setMenuRowKey(null); }}>
          {/* While a cell editor is open the browser's own menu stays, so Paste is there. */}
          <ContextMenuTrigger asChild disabled={editing !== null}>
                <TableBody onKeyDown={onKeyDown} onFocus={onFocus} onCopy={onCopy} onPaste={onPaste} onMouseDown={onMouseDown} onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu} onPointerDown={onPointerDown}>
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
                        rangeFrom={range && rowIndex >= Math.min(range.anchor.row, range.end.row) && rowIndex <= Math.max(range.anchor.row, range.end.row) ? Math.min(range.anchor.col, range.end.col) : -1}
                        rangeTo={range && rowIndex >= Math.min(range.anchor.row, range.end.row) && rowIndex <= Math.max(range.anchor.row, range.end.row) ? Math.max(range.anchor.col, range.end.col) : -1}
                        selected={selected.has(row.key)}
                        onSelect={toggleSelected}
                        blockedColumn={blockedFor(row)?.column}
                        blockedShort={blockedFor(row)?.short}
                        blockedMessage={blockedFor(row) ? blockedLine(blockedFor(row)!) : undefined}
                        activeCol={isActiveRow ? current.col : -1}
                        editing={isActiveRow ? editing : null}
                        error={isActiveRow ? error : null}
                        combo={isActiveRow ? comboData : null}
                        linksNode={isActiveRow ? linksNode : null}
                        panelNode={isActiveRow ? panelNode : null}
                        pendingCols={pendingByRow.get(row.key)}
                        onFinish={isActiveRow ? finish : undefined}
                        onInvalid={isActiveRow ? setError : undefined}
                        onInput={isActiveRow && editing ? (value) => setInputChanged(value !== editing.original) : undefined}
                        scopeNote={isActiveRow && editing?.scope ? (row.draft ? `${row.draft.vintageName ?? "Vintage"} vintage (new) · 1 bottle` : noteText(editing.scope, row, context)) : null}
                        onStep={isActiveRow && editing?.scope && scopesFor(row, VALUE_FIELD[columns[current!.col]?.id ?? ""]).length > 1 ? stepScope : undefined}
                      />
                    );
                  })}
                </TableBody>
          </ContextMenuTrigger>
          <RowMenuContent items={menuItems} handlers={menuHandlers} onCloseAutoFocus={menuCloseFocus} />
        </ContextMenu>
      </Table>
        {/* The Details pane lies over the right edge of the sheet's scroll box, stopping short of its scrollbars. Display only, and not a live region (it changes on every cell move). Clicks in it are not clicks away from the sheet. */}
        <aside data-bulk-editor-panel="" aria-label="Row details" className="pointer-events-none absolute bottom-[var(--sbh,0px)] right-[var(--sbw,0px)] top-0 z-20 hidden md:block">
          <div className={cn("pointer-events-auto h-full w-72 flex-col border-l border-foreground bg-card shadow-[-2px_0_0_rgb(20_33_61/0.12)]", railChoice === null ? "hidden xl:flex" : railChoice === "open" ? "flex" : "hidden")}>
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Details</h2>
              <button type="button" onClick={toggleRail} aria-label="Hide the details panel" className="p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <PanelRightClose aria-hidden className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <RailContent rail={rail} shelf={shelf} reach={railReach} changes={railChanges} />
            </div>
          </div>
          <button type="button" onClick={toggleRail} aria-label="Show the details panel" aria-expanded={false} className={cn("pointer-events-auto h-24 w-9 items-start justify-center border border-r-0 border-border bg-card pt-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", railChoice === null ? "flex xl:hidden" : railChoice === "closed" ? "flex" : "hidden")}>
            <PanelRightOpen aria-hidden className="size-4" />
          </button>
        </aside>
        <DeleteBar className={DELETE_BAR_OVER} count={ticked.length} noun={view.bottles ? "bottle" : "label"} ids={idsOfKeys(ticked)} onClear={() => setSelected(new Set())} onDone={afterDelete} />
        </div>

      {savedRows.length === 0 && total > 0 ? (
        <p className="border-t border-border px-3 py-4 text-center text-sm text-muted-foreground">No {noun} match. Clear the filters to see them all.</p>
      ) : null}
      {total === 0 ? (
        <p className="border-t border-border px-3 py-4 text-center text-sm text-muted-foreground">
          {view.bottles ? <>Nothing on the shelf yet. Type in the first row to add a bottle, or switch to Labels.</> : <>No labels yet. Type in the first row to add one.</>}
        </p>
      ) : null}
      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground md:hidden">
        <Shortcuts />
      </p>
      <DeleteDialog onCloseAutoFocus={deleteDialogCloseFocus} open={deleteAsk !== null} onOpenChange={(open) => { if (!open) setDeleteAsk(null); }} ids={deleteAsk ?? { labelIds: [], bottleIds: [] }} onDone={afterDelete} />
      {/* Present before anything is in it, so a screen reader announces the text when it appears. It never takes focus. */}
      <div aria-live="polite" aria-atomic="false" className={cn("pointer-events-none fixed right-4 z-40 w-[min(24rem,calc(100vw-2rem))]", ticked.length > 0 ? "bottom-24" : "bottom-4")}>
        <Notices notices={notices} onDismiss={dismissNotice} />
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
        {gone.length > 0 ? (
          <div className={cn("pointer-events-auto flex flex-col gap-2 border border-border bg-card p-3 text-sm shadow-md", blockedRows.length > 0 && "mt-2")}>
            {gone.map((g) => (
              <p key={g.key}>{g.text}</p>
            ))}
            {gone.some((g) => g.jump) && pendingCells().length > 0 ? (
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={jumpToPending}>
                Go to the first one
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setGone([])}>
              Dismiss
            </Button>
          </div>
        ) : null}
      </div>
    </div>
      <ShortcutsFooter />
    </div>
  );
}
