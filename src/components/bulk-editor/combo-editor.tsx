"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { pickOf } from "@/lib/bulk-editor/drafts";
import type { ComboKind } from "@/lib/bulk-editor/editors";
import { defaultHighlight, moveHighlight, resolveKey, suggest, type Highlight, type Suggestion } from "@/lib/bulk-editor/suggest";
import { cn } from "@/lib/utils";
import type { ComboData, Editing, Finish, Move } from "./types";

const LIST_HEIGHT = 280;

/**
 * The editor for a Brand, Label or Category cell: a box with a list under it, mounted over the active cell like the
 * other editor. The list is in a portal, so the sheet's own scrolling never clips it.
 *
 * Keys: Up and Down move through the matches and then the *Create "…"* option. Enter takes what is highlighted, and
 * creates when Create is highlighted. Tab takes an existing match and nothing else, so tabbing past a typo cannot make
 * a brand or label (`resolveKey` holds that rule). Escape cancels. Clicking away takes an exact match, and otherwise
 * drops what was typed: leaving a cell never creates anything.
 */
export function ComboEditor({ kind, column, initial, data, error, onFinish, onInvalid }: {
  kind: ComboKind | "reference";
  column: string;
  initial: Editing;
  data: ComboData;
  error: string | null;
  onFinish: (finish: Finish) => void;
  onInvalid: (message: string) => void;
}) {
  const [text, setText] = React.useState(initial.value);
  const [highlight, setHighlight] = React.useState<Highlight>(() => defaultHighlight(suggest(initial.value, data.candidates, { allowCreate: data.allowCreate })));
  /** Whether the arrow keys have been used, which is what makes a highlighted match the person's choice on an empty box. */
  const moved = React.useRef(false);
  const wrap = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const listId = React.useId();

  const suggestions = React.useMemo(() => suggest(text, data.candidates, { allowCreate: data.allowCreate }), [text, data.candidates, data.allowCreate]);

  React.useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    if (!initial.replace) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [initial.replace]);

  // Keep the list where the cell is, through scrolling the sheet or the page.
  React.useLayoutEffect(() => {
    const update = () => setRect(wrap.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, []);

  React.useEffect(() => {
    document.getElementById(`${listId}-${highlight?.kind === "create" ? "create" : (highlight?.index ?? "none")}`)?.scrollIntoView({ block: "nearest" });
  }, [highlight, listId]);

  function choose(item: Suggestion, move: Move, focus: boolean) {
    onFinish(kind === "category" ? { categoryId: item.id as number, move, focus } : { pick: pickOf(item), move, focus });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const { key } = event;
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      moved.current = true;
      setHighlight(moveHighlight(suggestions, highlight, key === "ArrowDown" ? 1 : -1));
    } else if (key === "Enter" || key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      // On a new row Enter confirms a choice and does not finish the row: the next cell (Label after Brand, Category after
      // Label) has just opened, so both keys go on to it, and Enter differs from Tab only in being able to create. On a
      // saved row the pick is the whole change, so Enter drops down a row and Tab goes along the row.
      const move: Move = key === "Enter" && data.enterDropsDown ? (event.shiftKey ? "up" : "down") : event.shiftKey ? "prev" : "next";
      // Nothing typed and nothing picked from the list: no choice has been made.
      if (text.trim() === "" && !moved.current) {
        if (initial.value === "") onFinish({ keep: true, move, focus: true });
        else onInvalid(`Choose a ${data.what} from the list.`);
        return;
      }
      // Opened with a value and left alone: keep it.
      if (text === initial.value && !initial.replace && !moved.current) {
        onFinish({ keep: true, move, focus: true });
        return;
      }
      const outcome = resolveKey(key === "Tab" ? "Tab" : "Enter", suggestions, highlight, data.what);
      if ("accept" in outcome) choose(outcome.accept, move, true);
      else if ("create" in outcome) onFinish({ pick: { kind: "new", name: outcome.create }, move, focus: true });
      else onInvalid(outcome.block);
    } else if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onFinish({ cancel: true, focus: true });
    }
  }

  const below = rect ? rect.bottom + LIST_HEIGHT < window.innerHeight : true;
  const panel =
    rect === null
      ? null
      : createPortal(
          <div
            data-bulk-editor-panel=""
            // Mouse presses must not take focus from the box, or clicking an option would count as clicking away.
            onMouseDown={(event) => event.preventDefault()}
            className="fixed z-50 flex max-h-72 min-w-56 max-w-80 flex-col overflow-hidden border border-border bg-card text-sm shadow-md"
            style={{ left: rect.left, width: Math.max(rect.width, 224), ...(below ? { top: rect.bottom + 1 } : { bottom: window.innerHeight - rect.top + 1 }) }}
          >
            {error ? (
              <p role="alert" className="border-b border-destructive bg-card px-3 py-1.5 text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <ul id={listId} role="listbox" aria-label={`${data.what} choices`} className="overflow-y-auto">
              {suggestions.items.map((item, index) => {
                const on = highlight?.kind === "item" && highlight.index === index;
                return (
                  <li
                    key={`${item.id ?? "new"}:${item.name}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={on}
                    onClick={() => choose(item, "stay", true)}
                    className={cn("flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5", on && "bg-muted font-medium")}
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">
                      {item.near ? "close match" : item.id === null ? "in this sheet" : (item.hint ?? "")}
                    </span>
                  </li>
                );
              })}
              {suggestions.create ? (
                <li
                  id={`${listId}-create`}
                  role="option"
                  aria-selected={highlight?.kind === "create"}
                  onClick={() => onFinish({ pick: { kind: "new", name: suggestions.create!.name }, move: "stay", focus: true })}
                  className={cn("cursor-pointer border-t border-border px-3 py-1.5", highlight?.kind === "create" && "bg-muted font-medium")}
                >
                  Create “{suggestions.create.name}”
                </li>
              ) : null}
            </ul>
            {suggestions.hint ? <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">{suggestions.hint} Press Tab to use it.</p> : null}
            {!data.allowCreate && data.noCreateReason && text.trim() !== "" && !suggestions.exact ? (
              <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">{data.noCreateReason}</p>
            ) : null}
            {suggestions.items.length === 0 && !suggestions.create && !(data.noCreateReason && text.trim() !== "") ? (
              <p className="px-3 py-1.5 text-xs text-muted-foreground">No match.</p>
            ) : null}
          </div>,
          document.body,
        );

  return (
    <div
      ref={wrap}
      className="absolute left-0 top-0 z-20 h-9 w-max min-w-full max-w-72 bg-card"
      style={{ minWidth: "max(100%, 9rem)" }}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        // Clicking away takes an exact match, and otherwise drops what was typed. It never creates.
        if (suggestions.exact && text !== initial.value) choose(suggestions.exact, "stay", false);
        else onFinish({ cancel: true, focus: false });
      }}
    >
      <Input
        ref={input}
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={highlight ? `${listId}-${highlight.kind === "create" ? "create" : highlight.index}` : undefined}
        aria-labelledby={`bulk-editor-col-${column}`}
        aria-invalid={error !== null || undefined}
        autoComplete="off"
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          moved.current = false;
          setHighlight(defaultHighlight(suggest(next, data.candidates, { allowCreate: data.allowCreate })));
        }}
        className={cn("h-9 w-full rounded-none", error !== null && "border-destructive")}
      />
      {panel}
    </div>
  );
}
