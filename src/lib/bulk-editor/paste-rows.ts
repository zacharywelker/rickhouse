import { matchName } from "./clipboard";
import { categoryCandidates, labelCandidates, brandCandidates, ownChoice, pickOf, withBrand, withCategory, withLabel, type CategoryChoice, type DraftRow } from "./drafts";
import type { SheetLabel } from "./sheet";

/**
 * New rows made by a paste: what a pasted brand, label and category become on a new row. A complete name that only one
 * thing has is taken, in the order the row needs them (the label is one of the brand's, and a new label needs its
 * category), and anything else is left as text for the person to pick from what matches (`pending`). A paste never
 * creates a brand or label: Create is chosen deliberately, in the picker.
 */
export type RowTexts = { brand?: string; name?: string; category?: string };

export const EXISTING_LABEL_REQUIRES_BOTTLES = "That label already exists. Switch Bottles on to add a bottle of it.";

export type SettleData = {
  bottles: boolean;
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
    if (found.kind === "exact" && (data.bottles || found.match.id === null)) {
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
  if (next.label?.kind === "existing" && left.category !== undefined) {
    const category = data.categories.find((c) => c.id === next.categoryId);
    if (category && matchName(left.category, [category]).kind === "exact") delete left.category;
  }
  // A text that is blank has nothing to wait for.
  for (const key of Object.keys(left) as Array<keyof RowTexts>) if (matchName(left[key]!, []).kind === "blank") delete left[key];
  return { draft: next, left };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A paste onto a new row that has already chosen replaces the choice, as choosing again would: a different brand empties
 * the label and category, a different label empties its category (a new label's only), a different category on a new
 * label empties it. The empty level then waits for the pasted text, which `settleDraft` takes. A pasted name equal to
 * what the row already has changes nothing and is not waited on. Existing labels keep their own category.
 */
export function replaceChosen(draft: DraftRow, texts: RowTexts, data: Pick<SettleData, "categories">): { draft: DraftRow; texts: RowTexts } {
  let next = draft;
  const rest: RowTexts = { ...texts };
  const filled = (t: string | undefined): t is string => t !== undefined && t.trim() !== "";

  if (next.brand && filled(rest.brand)) {
    if (sameName(rest.brand, next.brand.name)) {
      delete rest.brand;
      next = ownChoice(next);
    } else next = { ...ownChoice(next), brand: null, label: null, categoryId: null };
  }
  if (next.label && filled(rest.name)) {
    if (sameName(rest.name, next.label.name)) {
      delete rest.name;
      next = ownChoice(next);
    } else next = { ...ownChoice(next), label: null, categoryId: null };
  }
  if (next.label?.kind === "new" && next.categoryId !== null && filled(rest.category)) {
    const current = data.categories.find((c) => c.id === next.categoryId);
    if (current && sameName(rest.category, current.name)) {
      delete rest.category;
      next = ownChoice(next);
    } else next = { ...ownChoice(next), categoryId: null };
  }
  return { draft: next, texts: rest };
}

/** Explains why a pasted value needs attention when its cell cannot resolve it through the usual picker. */
export function pastedDraftConflict(draft: DraftRow, pending: RowTexts, data: Pick<SettleData, "bottles" | "labels" | "categories">): { column: "name" | "category"; message: string } | null {
  if (!data.bottles) {
    const label = pending.name === undefined ? null : matchName(pending.name, labelCandidates(draft, data.labels, []));
    if (draft.label?.kind === "existing" || label?.kind === "exact") {
      return { column: "name", message: EXISTING_LABEL_REQUIRES_BOTTLES };
    }
  }
  if (draft.label?.kind === "existing" && pending.category !== undefined) {
    const category = data.categories.find((c) => c.id === draft.categoryId)?.name ?? "a different category";
    return {
      column: "category",
      message: `The existing label uses ${category}. Clear the pasted category with Delete, or choose a different label.`,
    };
  }
  return null;
}

export type PasteRoute = { line: number; into: string | null };
/** For each pasted row that does not land on a saved row, in order: `into` is the key of the new row it lands on, or null when it is past the last row. */
export function routePasteRows(rows: ReadonlyArray<{ key: string; draft?: unknown }>, atRow: number, count: number): PasteRoute[] {
  const routes: PasteRoute[] = [];
  for (let line = 0; line < count; line += 1) {
    const target = rows[atRow + line];
    if (!target || target.draft) routes.push({ line, into: target?.key ?? null });
  }
  return routes;
}
