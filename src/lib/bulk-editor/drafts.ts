import type { FieldGroup } from "@/db/schema";
import type { Edits } from "./editors";
import type { DraftMeta, SheetBottle, SheetLabel, SheetRow, SheetView } from "./sheet";
import { nextDraftKey } from "./save";
import type { Candidate, Suggestion } from "./suggest";

/**
 * New rows, typed into the empty row at the bottom of the sheet. A new row is not saved yet, so it can name a brand or
 * a label that does not exist: those are `new` picks. Choosing one that does exist is an `existing` pick, with its id.
 *
 * A row's brand, label and category are what it has chosen; every other value typed into it is an edit, kept with the
 * others (see `editors.ts`), under the row's key.
 */

export type Pick = { kind: "existing"; id: number; name: string } | { kind: "new"; name: string };
export type DraftRow = { key: string; brand: Pick | null; label: Pick | null; categoryId: number | null };
export type CategoryChoice = { id: number; name: string; hint?: string };

export const emptyDraft = (key: string): DraftRow => ({ key, brand: null, label: null, categoryId: null });

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The same brand or label: the same id, or, for ones that do not exist yet, the same name in any case. */
export function samePick(a: Pick | null, b: Pick | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "existing" && b.kind === "existing") return a.id === b.id;
  return a.kind === b.kind && sameText(a.name, b.name);
}

/** What a suggestion becomes when it is chosen: an existing one keeps its id; one that only this sheet knows is new. */
export function pickOf(suggestion: Suggestion | { name: string }): Pick {
  return "id" in suggestion && suggestion.id !== null ? { kind: "existing", id: suggestion.id, name: suggestion.name } : { kind: "new", name: suggestion.name };
}

/** A different brand empties the label and the category, which belonged to the old one. The same brand changes nothing. */
export function withBrand(draft: DraftRow, brand: Pick): DraftRow {
  return samePick(draft.brand, brand) ? draft : { ...draft, brand, label: null, categoryId: null };
}

/**
 * Choosing a label. An existing label brings its category, which is then not the row's to change. A new label starts
 * with none: the category is typed for every new label and never worked out for it.
 */
export function withLabel(draft: DraftRow, label: Pick, existingCategoryId: number | null): DraftRow {
  if (samePick(draft.label, label)) return draft;
  return { ...draft, label, categoryId: label.kind === "existing" ? existingCategoryId : null };
}

export const withCategory = (draft: DraftRow, categoryId: number): DraftRow => (draft.categoryId === categoryId ? draft : { ...draft, categoryId });

/** Nothing chosen and nothing typed: the empty row at the bottom. */
export function isBlank(draft: DraftRow, edits: Edits): boolean {
  return draft.brand === null && draft.label === null && draft.categoryId === null && Object.keys(edits[draft.key] ?? {}).length === 0;
}

/** How many new rows have anything in them. */
export const countNewRows = (drafts: ReadonlyArray<DraftRow>, edits: Edits): number => drafts.filter((draft) => !isBlank(draft, edits)).length;

/**
 * The rows to show: the drafts, then always one empty one, so there is a row to type into. The empty one is not kept in
 * state; it is made from the next unused key (earlier drafts are removed once saved), and becomes a real draft the moment something is chosen or typed in it.
 */
export function withBlankRow(drafts: ReadonlyArray<DraftRow>, floor = 0): DraftRow[] {
  return [...drafts, emptyDraft(nextDraftKey(drafts, floor))];
}

// ---------------------------------------------------------------------------
// What each cell offers
// ---------------------------------------------------------------------------

/** Brands that exist, and ones that only another new row has named, so the same new brand is picked and not typed twice. */
export function brandCandidates(brands: ReadonlyArray<{ id: number; name: string }>, drafts: ReadonlyArray<DraftRow>, selfKey: string): Candidate[] {
  const out: Candidate[] = brands.map((b) => ({ id: b.id, name: b.name }));
  for (const draft of drafts) {
    if (draft.key === selfKey || draft.brand?.kind !== "new") continue;
    const name = draft.brand.name;
    if (!out.some((c) => sameText(c.name, name))) out.push({ id: null, name });
  }
  return out;
}

/** The chosen brand's labels, and ones another new row has named under the same brand. Nothing until a brand is chosen. */
export function labelCandidates(draft: DraftRow, labels: ReadonlyArray<SheetLabel>, drafts: ReadonlyArray<DraftRow>): Candidate[] {
  const { brand } = draft;
  if (brand === null) return [];
  const out: Candidate[] = brand.kind === "existing" ? labels.filter((l) => l.brandId === brand.id).map((l) => ({ id: l.id, name: l.name })) : [];
  for (const other of drafts) {
    if (other.key === draft.key || other.label?.kind !== "new" || !samePick(other.brand, brand)) continue;
    const name = other.label.name;
    if (!out.some((c) => sameText(c.name, name))) out.push({ id: null, name });
  }
  return out;
}

export const categoryCandidates = (categories: ReadonlyArray<CategoryChoice>): Candidate[] =>
  categories.map((c) => ({ id: c.id, name: c.name, ...(c.hint ? { hint: c.hint } : {}) }));

// ---------------------------------------------------------------------------
// A draft as a sheet row
// ---------------------------------------------------------------------------

type DraftContext = {
  view: SheetView;
  labels: ReadonlyArray<SheetLabel>;
  categories: ReadonlyArray<CategoryChoice>;
  groups: Readonly<Record<number, FieldGroup>>;
};

/** A label that does not exist yet, as the sheet's cells read a label: only what the row has chosen is filled in. */
function placeholderLabel(draft: DraftRow, ctx: DraftContext): SheetLabel {
  const category = draft.categoryId === null ? undefined : ctx.categories.find((c) => c.id === draft.categoryId);
  return {
    id: -1,
    name: draft.label?.name ?? "",
    slug: "",
    description: null,
    brand: draft.brand?.name ?? "",
    brandId: draft.brand?.kind === "existing" ? draft.brand.id : -1,
    category: category?.name ?? "",
    categoryId: draft.categoryId ?? -1,
    fieldGroup: (draft.categoryId === null ? "other" : ctx.groups[draft.categoryId]) ?? "other",
    proof: null,
    abv: null,
    ageStatement: null,
    ageYears: null,
    ageMonths: null,
    ageDays: null,
    isCaskStrength: false,
    isStillProof: false,
    isStraight: false,
    isNas: false,
    isBottledInBond: false,
    isAged: false,
    msrp: null,
    sizeMl: 750,
    bottleCount: 0,
    pickCount: 0,
    links: { distilleries: [], mashbills: [], finishes: [] },
  } as unknown as SheetLabel;
}

/** A bottle that does not exist yet: every value empty, for the row's typed-in edits to fill. */
const placeholderBottle = (expressionId: number): SheetBottle => ({
  id: -1, expressionId, status: "owned", pricePaid: null, storeName: null, dateAcquired: null, isSingleBarrel: false, isSingleBarrelPick: false,
  pickName: null, releaseYear: null, location: null, notes: null, sizeMl: null, proof: null, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null,
});

/** The sheet row for a draft. An existing label is shown as it is (and is read-only here); a new one starts empty and editable. */
export function draftSheetRow(draft: DraftRow, ctx: DraftContext): SheetRow {
  const chosen = draft.label;
  const existing = chosen?.kind === "existing" ? ctx.labels.find((l) => l.id === chosen.id) : undefined;
  const label = existing ?? placeholderLabel(draft, ctx);
  const meta: DraftMeta = {
    brandChosen: draft.brand !== null,
    labelChosen: draft.label !== null,
    brandIsNew: draft.brand?.kind === "new",
    labelIsNew: draft.label !== null && draft.label.kind === "new",
  };
  return { key: draft.key, label, bottle: ctx.view.bottles ? placeholderBottle(label.id) : null, draft: meta };
}
