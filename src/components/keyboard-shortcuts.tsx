"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { OPEN_SEARCH_EVENT, shortcutFor } from "@/lib/nav-search/shortcuts";

/**
 * Global shortcuts (SPEC M6): `n` new bottle; `/` focuses the Collection's
 * filter box where there is one, and opens the nav search where there is not;
 * ⌘K / Ctrl+K opens the nav search everywhere. The rules live in
 * `shortcutFor` (pure, tested). Escape is not here — Radix already closes its
 * own dialogs and popovers, and the disclosures this app hand-rolls handle it
 * themselves. A single global Escape handler would fight them.
 */
export const SEARCH_INPUT_ID = "grid-search";

/** Typing "n" into a field must type an n, not navigate away. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function KeyboardShortcuts() {
  const router = useRouter();

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const filterBox = document.getElementById(SEARCH_INPUT_ID);
      const action = shortcutFor({
        key: event.key,
        meta: event.metaKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        typing: isTyping(event.target),
        hasFilterBox: filterBox instanceof HTMLInputElement,
      });
      if (action === null) return;

      event.preventDefault();
      if (action === "open-search") window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
      else if (action === "focus-filter" && filterBox instanceof HTMLInputElement) {
        filterBox.focus();
        filterBox.select();
      } else if (action === "new-bottle") router.push("/bottles/new");
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  return null;
}
