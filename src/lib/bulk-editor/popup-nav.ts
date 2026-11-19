/**
 * How the bulk editor's popup moves between pages: a chain of steps (label, then bottle) carried in the url, and what a
 * page inside the popup tells the sheet when it saves. No React, no network.
 */

/** Dispatched on `window` by a popup that saved something, with a `PopupSaved` as its `detail`. */
export const POPUP_SAVED_EVENT = "bulk-editor:popup-saved";
export type PopupSaved = { labelId?: number; bottleId?: number };

function withParams(url: string, add: Record<string, string>): string {
  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(add)) params.set(key, value);
  return `${path}?${params.toString()}`;
}

/**
 * The first url of a run of steps, carrying the rest as `next` (nested), and `step` and `of` on every url so the popup
 * can say "Step 1 of 2". One step is just its url.
 */
export function chain(steps: string[]): string {
  if (steps.length <= 1) return steps[0] ?? "";
  let url = "";
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    url = withParams(steps[i]!, { ...(i < steps.length - 1 ? { next: url } : {}), step: String(i + 1), of: String(steps.length) });
  }
  return url;
}

/** The next step, if the url has one and it is a path on this site (a `next` that leaves the site would be an open redirect). */
export function nextOf(search: URLSearchParams): string | null {
  const next = search.get("next");
  if (next === null || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

export function stepOf(search: URLSearchParams): { step: number; of: number } | null {
  const [step, of] = [Number(search.get("step")), Number(search.get("of"))];
  return Number.isInteger(step) && Number.isInteger(of) && step >= 1 && step <= of ? { step, of } : null;
}
