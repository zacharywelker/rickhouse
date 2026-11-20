"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { Prefill } from "@/lib/bulk-editor/expand";
import { parsePrefill, readPrefillText } from "@/lib/popup/prefill";

const noSubscription = () => () => {};

/**
 * The bulk editor's new-row values for this page (`?prefill=token`), or null. Storage is not there on the server, so the
 * server's snapshot is null and the browser reads it once the page has hydrated: the first render always matches.
 */
export function usePrefill(): Prefill | null {
  const token = useSearchParams().get("prefill");
  const text = React.useSyncExternalStore(noSubscription, () => readPrefillText(token), () => null);
  return React.useMemo(() => parsePrefill(text), [text]);
}
