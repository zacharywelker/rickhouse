import type { Prefill } from "@/lib/bulk-editor/expand";

/**
 * A new row's typed values, handed from the bulk editor to the page that opens in its popup. They travel in this tab's
 * sessionStorage under a token that goes in the url: values (a long note, say) do not belong in a url, and nothing
 * leaves the browser. Reading does not remove the entry, so a re-render or a double effect still finds it.
 */
const PREFIX = "bulk-editor:prefill:";

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Stores the prefill and returns its token (the token is made even where there is no storage, and then reads back nothing). */
export function writePrefill(prefill: Prefill): string {
  const token = crypto.randomUUID();
  try {
    storage()?.setItem(PREFIX + token, JSON.stringify(prefill));
  } catch {
    // Storage full or refused: the form opens empty rather than the popup failing.
  }
  return token;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The stored text for a token (a string, so a caller can watch it for change without it being a new object each read). */
export function readPrefillText(token: string | null): string | null {
  if (!token) return null;
  try {
    return storage()?.getItem(PREFIX + token) ?? null;
  } catch {
    return null;
  }
}

export function parsePrefill(raw: string | null): Prefill | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || !isObject(parsed.label) || !isObject(parsed.bottle) || !Array.isArray(parsed.dropped)) return null;
    return { label: parsed.label, bottle: parsed.bottle, dropped: parsed.dropped.map(String), newBrand: typeof parsed.newBrand === "string" ? parsed.newBrand : null };
  } catch {
    return null;
  }
}

export const readPrefill = (token: string | null): Prefill | null => parsePrefill(readPrefillText(token));

export function clearPrefill(token: string): void {
  try {
    storage()?.removeItem(PREFIX + token);
  } catch {
    // Nothing to clear.
  }
}
