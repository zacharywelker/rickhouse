"use client";

import * as React from "react";
import { parseWidths } from "@/lib/bulk-editor/widths";

/**
 * The widths a person has dragged columns to, by column id, remembered in this browser. A column with no entry keeps
 * its own width. Like the hidden columns, unavailable storage just means the widths last until you leave.
 */
export function useColumnWidths(storageKey: string) {
  const [widths, setWidths] = React.useState<Readonly<Record<string, number>>>({});

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable after hydration
      if (raw !== null) setWidths(parseWidths(JSON.parse(raw)));
    } catch {
      // Unreadable or unavailable: columns keep their own widths.
    }
  }, [storageKey]);

  const save = React.useCallback(
    (next: Readonly<Record<string, number>>) => {
      setWidths(next);
      try {
        if (Object.keys(next).length === 0) window.localStorage.removeItem(storageKey);
        else window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Not remembered this time.
      }
    },
    [storageKey],
  );

  /** Set one column's width, or give it back its own (`null`). */
  const set = React.useCallback(
    (id: string, width: number | null) => {
      const { [id]: _old, ...rest } = widths;
      save(width === null ? rest : { ...rest, [id]: width });
    },
    [widths, save],
  );
  const clear = React.useCallback(() => save({}), [save]);

  return { widths, set, clear };
}
