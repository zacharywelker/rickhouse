import { matchName } from "./clipboard";
import { categoryCandidates, labelCandidates, brandCandidates, pickOf, withBrand, withCategory, withLabel, type CategoryChoice, type DraftRow } from "./drafts";
import type { SheetLabel } from "./sheet";

/**
 * New rows made by a paste: what a pasted brand, label and category become on a new row. A complete name that only one
 * thing has is taken, in the order the row needs them (the label is one of the brand's, and a new label needs its
 * category), and anything else is left as text for the person to pick from what matches (`pending`). A paste never
 * creates a brand or label: Create is chosen deliberately, in the picker.
 */
export type RowTexts = { brand?: string; name?: string; category?: string };

export type SettleData = {
  brands: ReadonlyArray<{ id: number; name: string }>;
  labels: ReadonlyArray<SheetLabel>;
  categories: ReadonlyArray<CategoryChoice>;
  /** Every new row, for the brands and labels another of them has named. */
  drafts: ReadonlyArray<DraftRow>;
};

/**
 * Takes what can be taken of a new row's pasted texts, as far as the row's choices allow, and returns the row and the
 * texts still waiting. Running it again after a choice has been made carries on from there (a label waits for its brand).
 */
export function settleDraft(draft: DraftRow, texts: RowTexts, data: SettleData): { draft: DraftRow; left: RowTexts } {
  let next = draft;
  const left: RowTexts = { ...texts };

  if (next.brand === null && left.brand !== undefined) {
    const found = matchName(left.brand, brandCandidates(data.brands, data.drafts, next.key));
    if (found.kind === "exact") {
      next = withBrand(next, pickOf(found.match));
      delete left.brand;
    }
  }
  if (next.brand !== null && next.label === null && left.name !== undefined) {
    const found = matchName(left.name, labelCandidates(next, data.labels, data.drafts));
    if (found.kind === "exact") {
      const existing = found.match.id === null ? undefined : data.labels.find((l) => l.id === found.match.id);
      next = withLabel(next, pickOf(found.match), existing?.categoryId ?? null);
      delete left.name;
    }
  }
  // A new label has no category until one is named; an existing label brings its own.
  if (next.label?.kind === "new" && next.categoryId === null && left.category !== undefined) {
    const found = matchName(left.category, categoryCandidates(data.categories));
    if (found.kind === "exact" && found.match.id !== null) {
      next = withCategory(next, found.match.id);
      delete left.category;
    }
  }
  // A text that is blank has nothing to wait for.
  for (const key of Object.keys(left) as Array<keyof RowTexts>) if (matchName(left[key]!, []).kind === "blank") delete left[key];
  return { draft: next, left };
}
