"use client";

import * as React from "react";

/**
 * The columns a bulk grid is hiding, remembered in this browser.
 *
 * Unlike the tables, a bulk grid has no URL state to put this in — you always
 * arrive at a fresh, empty sheet — and which fields you fill in is a habit,
 * not a view you would bookmark: someone who never buys rum wants the rum
 * columns gone every time. Hidden ids are stored rather than shown ones, so a
 * field added to the form later appears instead of silently staying hidden.
 *
 * Storage can be unavailable (private windows, blocked site data); the grid
 * then simply starts with everything shown.
 */
export function useHiddenColumns(storageKey: string) {
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(() => new Set());

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setHidden(new Set(parsed.filter((id): id is string => typeof id === "string")));
    } catch {
      // Unreadable or unavailable: keep everything shown.
    }
  }, [storageKey]);

  const update = React.useCallback(
    (next: ReadonlySet<string>) => {
      setHidden(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // Not remembered this time; the choice still applies until you leave.
      }
    },
    [storageKey],
  );

  return [hidden, update] as const;
}
