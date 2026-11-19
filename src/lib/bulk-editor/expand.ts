import type { SheetRow, SheetView } from "./sheet";

/**
 * Expand record: which of the app's real pages a row opens in the popup, in order. Which form follows the sheet's view
 * toggle: only Labels on is the label's page, only Bottles on is the bottle's, both on is the label's and then the
 * bottle's (a row that is a label with no bottle has only the first). No React, no network.
 */

/** The popup urls for a saved row, or null for a new row (whose pages depend on what it has typed). */
export function expandSteps(row: SheetRow, view: SheetView): string[] | null {
  if (row.draft) return null;
  const label = `/expressions/${row.label.id}/edit`;
  const bottle = row.bottle ? `/bottles/${row.bottle.id}/edit` : null;
  if (view.bottles && !view.labels) return bottle ? [bottle] : [label];
  if (view.bottles && view.labels) return bottle ? [label, bottle] : [label];
  return [label];
}
