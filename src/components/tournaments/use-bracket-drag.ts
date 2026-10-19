"use client";

import * as React from "react";
import { describeOutcome, dropOutcome, refusalText, type Drag, type DragView, type DropOutcome, type DropTarget } from "@/lib/tournaments/drag-model";
import type { BracketActions } from "./use-bracket-actions";

/** What a target shows while something is dragged: `ok` it would take the drop, `hovered` the pointer is over it, `text` says what a drop does. */
export type DropCue = { ok: boolean; hovered: boolean; text: string | null };

const key = (t: DropTarget) => (t.kind === "flight" ? `f${t.heatId}` : t.kind === "bottle" ? `b${t.heatId}-${t.entryId}` : `s${t.index}`);
const EDGE = 80;

/**
 * Native HTML5 drag and drop for the bracket: which bottle or flight is held, which target the pointer is over, what
 * a drop there would do (the pure `dropOutcome`), and the call to make on drop. Nothing here knows the rules.
 * The payload carries no names, so a drag never leaks what a hidden flight holds; the held thing lives in a ref.
 */
export function useBracketDrag(view: DragView, actions: BracketActions, names: { target: (t: DropTarget) => string | null }) {
  const held = React.useRef<Drag | null>(null);
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [overKey, setOver] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");
  const pointerY = React.useRef(0);

  const end = React.useCallback(() => {
    held.current = null;
    setDrag(null);
    setOver(null);
  }, []);

  // Native drag scrolls the page poorly: while something is held, scroll near the top and bottom edges.
  React.useEffect(() => {
    if (!drag) return;
    let frame = 0;
    const track = (e: DragEvent) => {
      pointerY.current = e.clientY;
    };
    const tick = () => {
      const y = pointerY.current;
      const h = window.innerHeight;
      if (y > 0 && y < EDGE) window.scrollBy(0, -Math.ceil(((EDGE - y) / EDGE) * 18));
      else if (y > h - EDGE && y < h) window.scrollBy(0, Math.ceil(((y - (h - EDGE)) / EDGE) * 18));
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener("dragover", track);
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("dragover", track);
      window.removeEventListener("dragend", end);
      window.removeEventListener("drop", end);
    };
  }, [drag, end]);

  const start = (e: React.DragEvent, what: Drag, image?: HTMLElement | null) => {
    if (actions.pending) return e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", what.kind); // Firefox starts no drag without data; the payload names nothing
    if (image) e.dataTransfer.setDragImage(image, 16, 16);
    held.current = what;
    // After the browser has taken its drag image: changing the DOM inside dragstart can cancel the drag.
    window.setTimeout(() => setDrag(what), 0);
  };

  const outcomeOf = (target: DropTarget): DropOutcome => (held.current ? dropOutcome(view, held.current, target) : { kind: "none", reason: "gone" });

  const cue = (target: DropTarget): DropCue | null => {
    if (!drag) return null;
    const outcome = dropOutcome(view, drag, target);
    const hovered = overKey === key(target);
    if (outcome.kind === "none") return { ok: false, hovered, text: hovered && outcome.reason !== "same" ? refusalText(outcome.reason) : null };
    const what = names.target(target);
    const text = outcome.kind === "move" ? "Drop to move here" : outcome.kind === "swap" ? `Drop to swap with ${what ?? "this bottle"}` : "Drop to place the flight here";
    return { ok: true, hovered, text: hovered ? text : null };
  };

  /** Spread on an element that can take a drop. A row handles a bottle dropped on it; anything it passes on reaches its flight. */
  const dropProps = (target: DropTarget, handles: (o: DropOutcome) => boolean = () => true) => {
    const hover: (e: React.DragEvent) => void = (e) => {
      if (!held.current) return;
      const outcome = outcomeOf(target);
      if (!handles(outcome)) return; // let the flight around a row answer
      e.stopPropagation();
      setOver((was) => (was === key(target) ? was : key(target)));
      if (outcome.kind === "none") {
        e.dataTransfer.dropEffect = "none";
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    };
    return {
    onDragEnter: hover,
    onDragOver: hover,
    onDragLeave: (e: React.DragEvent) => {
      // relatedTarget is often null in a drag: judge by where the pointer is, so moving between children keeps the target lit.
      const box = e.currentTarget.getBoundingClientRect();
      const inside = e.clientX > box.left && e.clientX < box.right && e.clientY > box.top && e.clientY < box.bottom;
      if (!inside) setOver((was) => (was === key(target) ? null : was));
    },
    onDrop: (e: React.DragEvent) => {
      if (!held.current) return;
      const outcome = outcomeOf(target);
      if (!handles(outcome)) return;
      e.preventDefault();
      e.stopPropagation();
      end();
      if (outcome.kind === "none") return;
      const said = describeOutcome(view, outcome);
      const done = () => setMessage(said ?? "");
      setMessage("");
      if (outcome.kind === "move") actions.move(outcome.entryId, outcome.toHeatId, done);
      else if (outcome.kind === "swap") actions.swap(outcome.entryId, outcome.withEntryId, done);
      else actions.reorder(outcome.heatId, outcome.toSlot, done);
    },
    };
  };

  /** Say what a menu edit did, as a drop does. */
  const announce = (outcome: DropOutcome) => setMessage(describeOutcome(view, outcome) ?? "");

  return { drag, message, announce, start, end, cue, dropProps, disabled: actions.pending };
}

export type BracketDrag = ReturnType<typeof useBracketDrag>;
