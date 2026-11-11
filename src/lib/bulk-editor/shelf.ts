import type { Pick } from "./drafts";
import type { Moves } from "./changes";
import type { SheetBottle, SheetLabel, SheetRow, SheetView } from "./sheet";

/**
 * "On your shelf": what the person already has from the brand and label the cursor's row is about, so a duplicate is
 * visible before it is typed and a locked cell is explained. Pure, and worked out from rows the sheet has already loaded:
 * every label, and the bottles on the shelf (owned and open). Never from the filtered view, so a filter cannot change a
 * count. Bottles typed into the sheet that have not saved yet are counted too, and said to be "not saved".
 */

/** A new row that will be a bottle, as far as the counts are concerned. */
export type NewBottle = { key: string; brand: Pick | null; label: Pick | null; /** Saved, waiting for the sheet to read it back. */ saved: boolean };

export type ShelfLabel = { name: string; owned: number; unsaved: number; chosen: boolean; isNew: boolean };

export type Shelf = {
  state: "no-brand" | "known-brand" | "existing-label" | "new-label" | "new-brand";
  /** "New label" or "New brand", with what saving will do. */
  badge: { text: string; note: string } | null;
  summary: string;
  /** Count lines: "Your sixth Four Roses bottle", "Third Single Barrel". */
  lines: string[];
  /** At most five, the ones owned most of (the chosen label always among them). */
  labels: ShelfLabel[];
  /** How many more labels the brand has than are listed. */
  more: number;
};

const MAX_LABELS = 5;

const WORDS = ["zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"];
/** "sixth", and past twenty "21st", in plain words. */
export function ordinal(n: number): string {
  if (n >= 0 && n < WORDS.length) return WORDS[n]!;
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function shelfFor(input: { row: SheetRow; labels: ReadonlyArray<SheetLabel>; bottles: ReadonlyArray<SheetBottle>; moves: Moves; newBottles: ReadonlyArray<NewBottle>; view: SheetView }): Shelf {
  const { row, labels, bottles, moves, newBottles } = input;
  const draft = row.draft;
  const none = (state: Shelf["state"], summary: string): Shelf => ({ state, badge: null, summary, lines: [], labels: [], more: 0 });
  if (draft && !draft.brandChosen) return none("no-brand", "Choose a brand to see what you already own from it.");

  const brandName = row.label.brand;
  const brandId = draft ? (draft.brandIsNew ? null : row.label.brandId) : row.label.brandId;
  const ofBrand = (b: Pick | null) => b !== null && (brandId !== null ? b.kind === "existing" && b.id === brandId : b.kind === "new" && same(b.name, brandName));
  const mine = newBottles.filter((n) => ofBrand(n.brand));
  const unsavedOf = (n: ReadonlyArray<NewBottle>) => n.filter((x) => !x.saved).length;

  // A new brand: nothing of it is on the shelf.
  if (brandId === null) {
    const typed = unsavedOf(mine);
    const place = unsavedBefore(mine, row.key) + 1;
    return {
      state: "new-brand",
      badge: { text: "New brand", note: `Nothing from ${brandName} is on your shelf. Saving creates the brand and its first label, so check the spelling.` },
      // The badge already says nothing of it is on the shelf; the summary only adds how many are typed and not saved.
      summary: typed > 1 ? `${typed} ${brandName} bottles not saved yet` : "",
      lines: draft?.labelChosen ? [place === 1 ? `Your first ${brandName} bottle` : `Your ${ordinal(place)} ${brandName} bottle`] : [],
      labels: [],
      more: 0,
    };
  }

  // The brand's labels, and what is on the shelf (and typed but not saved) for each.
  const brandLabels = labels.filter((l) => l.brandId === brandId);
  const ownedBy = new Map<number, number>();
  for (const b of bottles) {
    const at = moves[`b${b.id}`] ?? b.expressionId;
    ownedBy.set(at, (ownedBy.get(at) ?? 0) + 1);
  }
  // A new row that has saved is a bottle on the shelf, though the sheet has not read it back yet.
  for (const n of newBottles) if (n.saved && n.label?.kind === "existing") ownedBy.set(n.label.id, (ownedBy.get(n.label.id) ?? 0) + 1);
  const unsavedBy = new Map<number, number>();
  for (const n of mine) if (n.label?.kind === "existing" && !n.saved) unsavedBy.set(n.label.id, (unsavedBy.get(n.label.id) ?? 0) + 1);
  const ownedTotal = brandLabels.reduce((sum, l) => sum + (ownedBy.get(l.id) ?? 0), 0);
  const unsavedTotal = unsavedOf(mine);

  const chosenId = draft ? (draft.labelChosen && !draft.labelIsNew ? row.label.id : null) : row.label.id;
  const newName = draft?.labelChosen && draft.labelIsNew ? row.label.name : null;
  const rows: ShelfLabel[] = brandLabels.map((l) => ({ name: l.name, owned: ownedBy.get(l.id) ?? 0, unsaved: unsavedBy.get(l.id) ?? 0, chosen: l.id === chosenId, isNew: false }));
  rows.sort((a, b) => b.owned + b.unsaved - (a.owned + a.unsaved) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  // The label being added is listed too, with what is typed for it.
  if (newName !== null) rows.unshift({ name: newName, owned: 0, unsaved: mine.filter((n) => n.label?.kind === "new" && same(n.label.name, newName) && !n.saved).length, chosen: true, isNew: true });
  // Five at most, and the one the cursor is about is always among them.
  let shown = rows.slice(0, MAX_LABELS);
  const pinned = rows.find((r) => r.chosen);
  if (pinned && !shown.includes(pinned)) shown = [...shown.slice(0, MAX_LABELS - 1), pinned];

  const unsaved = unsavedTotal > 0 ? ` · ${unsavedTotal} not saved` : "";
  const summary =
    ownedTotal === 0
      ? `None of your ${brandName} is on your shelf yet${unsaved}`
      : `${plural(ownedTotal, "bottle", "bottles")} from ${plural(brandLabels.length, `${brandName} label`, `${brandName} labels`)}${unsaved}`;

  const base = { summary, labels: shown, more: Math.max(0, rows.length - shown.length) };
  if (!draft && !row.bottle) {
    // A label on its own (Labels only): what the label has, no ordinal, since there is no bottle in hand.
    const n = ownedBy.get(row.label.id) ?? 0;
    return { state: "existing-label", badge: null, ...base, lines: [n === 0 ? `None of ${row.label.name} on your shelf` : `${plural(n, "bottle", "bottles")} of ${row.label.name} on your shelf`] };
  }
  if (draft && !draft.labelChosen) return { state: "known-brand", badge: null, ...base, lines: [] };
  if (newName !== null) {
    return {
      state: "new-label",
      badge: { text: "New label", note: `Saving adds it under ${brandName}.` },
      ...base,
      lines: [ownedTotal + unsavedBefore(mine, row.key) === 0 ? `Your first ${brandName} bottle` : `Your ${ordinal(ownedTotal + unsavedBefore(mine, row.key) + 1)} ${brandName} bottle`, `First ${newName}`],
    };
  }

  // An existing label: this bottle's place among the brand's, and among the label's.
  const place = (forBrand: boolean): number => {
    if (draft) {
      const owned = forBrand ? ownedTotal : (ownedBy.get(row.label.id) ?? 0);
      const earlier = mine.filter((n) => !n.saved && n.key !== row.key && (forBrand || (n.label?.kind === "existing" && n.label.id === row.label.id)));
      // Typed above this row, in the order of the sheet.
      const before = earlier.filter((n) => order(newBottles, n.key) < order(newBottles, row.key)).length;
      return owned + before + 1;
    }
    const ids = bottles
      .filter((b) => (moves[`b${b.id}`] ?? b.expressionId) === row.label.id || (forBrand && brandLabels.some((l) => l.id === (moves[`b${b.id}`] ?? b.expressionId))))
      .map((b) => b.id)
      .sort((a, b) => a - b);
    return ids.indexOf(row.bottle!.id) + 1;
  };
  const n = place(true);
  const m = place(false);
  return {
    state: "existing-label",
    badge: null,
    ...base,
    lines: [n === 1 ? `Your first ${brandName} bottle` : `Your ${ordinal(n)} ${brandName} bottle`, `${cap(ordinal(m))} ${row.label.name}`],
  };
}

const order = (list: ReadonlyArray<NewBottle>, key: string) => list.findIndex((n) => n.key === key);
/** How many bottles of the brand were typed above this row and are not saved. */
const unsavedBefore = (mine: ReadonlyArray<NewBottle>, key: string): number => {
  const at = mine.findIndex((n) => n.key === key);
  return at < 0 ? mine.filter((n) => !n.saved).length : mine.slice(0, at).filter((n) => !n.saved).length;
};
