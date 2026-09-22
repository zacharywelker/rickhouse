"use client";

import * as React from "react";

/**
 * A media query as React state. useSyncExternalStore rather than an effect so
 * the value is right on the first client render instead of one frame later.
 *
 * The server snapshot is always `false`: there is no viewport during SSR, and
 * guessing "probably a phone" would be wrong exactly as often as it was right.
 * Callers should read `false` as "assume the roomy layout".
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
