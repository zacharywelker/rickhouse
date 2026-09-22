"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Global shortcuts (SPEC M6): `n` new bottle, `/` focus search. Escape is not
 * here — Radix already closes its own dialogs and popovers, and the two
 * disclosures this app hand-rolls handle it themselves. A single global
 * Escape handler would fight all three.
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
      // Never steal a browser or OS chord.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;

      if (event.key === "/") {
        const search = document.getElementById(SEARCH_INPUT_ID);
        if (search instanceof HTMLInputElement) {
          event.preventDefault();
          search.focus();
          search.select();
        } else {
          // No search box here; the collection is where searching happens.
          event.preventDefault();
          router.push("/bottles");
        }
        return;
      }

      if (event.key === "n") {
        event.preventDefault();
        router.push("/bottles/new");
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  return null;
}
