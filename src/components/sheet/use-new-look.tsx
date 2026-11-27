"use client";

import * as React from "react";

/**
 * The per-browser switch for the data-sheet look (design: 2026-11-25-data-sheet-forms-design.md). Off by default, kept in
 * `localStorage` (which can be missing or throw: private windows, blocked site data, previews), and overridden for a session by
 * `?look=new` or `?look=old` in the address (for tests and screenshots). Server renders and first paint are the old look.
 */
const KEY = "rickhouse.newLook";
const listeners = new Set<() => void>();
let override: boolean | null = null;
let readQuery = false;

function stored(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function snapshot(): boolean {
  if (!readQuery && typeof window !== "undefined") {
    readQuery = true;
    const look = new URLSearchParams(window.location.search).get("look");
    if (look === "new") override = true;
    else if (look === "old") override = false;
  }
  return override ?? stored();
}

export function setNewLook(on: boolean): void {
  override = on;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Storage is blocked: the choice lasts until the page is closed.
  }
  for (const listener of listeners) listener();
}

export function useNewLook(): boolean {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    () => false,
  );
}

/** A small link that switches the look; it is on the forms' pages so the new one can be tried and left. */
export function NewLookToggle({ className }: { className?: string }) {
  const on = useNewLook();
  return (
    <button type="button" onClick={() => setNewLook(!on)} className={className ?? "self-end text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"}>
      {on ? "Back to the old look" : "Try the new look"}
    </button>
  );
}
