import { describeAgeParts } from "@/lib/expressions/display";
import { describeLinks } from "@/lib/expressions/links";
import type { ExpressionRow } from "@/lib/expressions/queries";
import type { CategoryKind } from "@/lib/expressions/rules";
import { whiskeyAge } from "@/lib/expressions/whiskey-age";
import { formatDate, formatMoney, formatNumeric, humanise } from "@/lib/utils";

/**
 * The bulk editor's sheet as plain data: which rows it has in each view, which columns, and what each cell says.
 * No React and no database, so the rules are testable on their own. The sheet component only draws this.
 */

/** A label as the Labels table lists it, with its three ordered lists. */
export type SheetLabel = ExpressionRow;

/** A bottle's own columns, raw: what the label gives it and what it says itself are kept apart. */
export type SheetBottle = {
  id: number;
  expressionId: number;
  status: string;
  pricePaid: string | null;
  storeName: string | null;
  dateAcquired: string | null;
  isSingleBarrel: boolean;
  isSingleBarrelPick: boolean;
  pickName: string | null;
  releaseYear: number | null;
  location: string | null;
  notes: string | null;
  /** The bottle's own say on size, proof and age. Null inherits the label's. */
  sizeMl: number | null;
  proof: string | null;
  ageYears: string | null;
  ageMonths: number | null;
  ageDays: number | null;
  ageStatement: string | null;
};

export type SheetView = { labels: boolean; bottles: boolean };
/** What a new, unsaved row has chosen so far (see `drafts.ts`). */
export type DraftMeta = { brandChosen: boolean; labelChosen: boolean; brandIsNew: boolean; labelIsNew: boolean };
export type SheetRow = { key: string; label: SheetLabel; bottle: SheetBottle | null; /** Present on a new, unsaved row. */ draft?: DraftMeta };
export type SheetContext = { currency: string; kinds: Record<number, CategoryKind> };
export type Cell = {
  text: string;
  /** Grey: the value is inherited, or there is none. */
  muted?: boolean;
  /** A small tag after the text: "new" on a brand or label that does not exist yet. */
  badge?: string;
};

export type SheetColumn = {
  id: string;
  label: string;
  /** Label columns change the label; bottle columns change one bottle. */
  group: "label" | "bottle";
  align?: "right";
  /** Brand and Label: always shown, and held at the left while the sheet scrolls. */
  identity?: boolean;
  /** Shown whenever its group is, and cannot be hidden in the Fields picker: a new label cannot be saved without it. */
  always?: boolean;
  /** Hidden until switched on in the Fields picker. */
  defaultHidden?: boolean;
  /** Only when the sheet is one row per label. */
  labelsOnly?: boolean;
  cell: (row: SheetRow, ctx: SheetContext) => Cell;
};

const DASH: Cell = { text: "—", muted: true };
const text = (value: string | null | undefined): Cell => (value ? { text: value } : DASH);

/** A label's age as the Labels table shows it. */
function labelAge(label: SheetLabel, kinds: Record<number, CategoryKind>): Cell {
  const { fieldGroup } = label;
  if (fieldGroup === "vodka" || ((fieldGroup === "amaro" || fieldGroup === "liqueur") && !label.isAged)) return DASH;
  if (fieldGroup === "whiskey") return text(whiskeyAge(label, kinds[label.categoryId] ?? "other").text);
  return text(describeAgeParts(label.ageYears, label.ageMonths, label.ageDays) ?? label.ageStatement ?? (label.isNas ? "NAS" : label.isStraight ? "Straight" : null));
}

const NO_MASHBILL = new Set(["rum", "agave", "brandy", "gin", "vodka", "amaro", "liqueur"]);

/** The bottle's own value when it has one; otherwise the label's, in grey, so it is plain it is inherited. */
function own(value: Cell | null, inherited: Cell): Cell {
  return value ? value : { ...inherited, muted: true };
}

/** Every column, in the order a bottle is entered at the shelf: label facts, then the bottle's own. */
export const SHEET_COLUMNS: ReadonlyArray<SheetColumn> = [
  {
    id: "brand",
    label: "Brand",
    group: "label",
    identity: true,
    // An empty new row says what it is for.
    cell: (r) => (r.draft && r.label.brand === "" ? { text: r.bottle ? "Add a bottle" : "Add a label", muted: true } : { text: r.label.brand, ...(r.draft?.brandIsNew ? { badge: "new" } : {}) }),
  },
  { id: "name", label: "Label", group: "label", identity: true, cell: (r) => (r.draft && r.label.name === "" ? DASH : { text: r.label.name, ...(r.draft?.labelIsNew && r.draft.labelChosen ? { badge: "new" } : {}) }) },
  { id: "category", label: "Category", group: "label", always: true, cell: (r) => (r.label.category === "" ? DASH : { text: r.label.category }) },
  { id: "sizeMl", label: "Size", group: "label", align: "right", cell: (r) => ({ text: `${r.label.sizeMl} mL` }) },
  { id: "proof", label: "Proof", group: "label", align: "right", cell: (r) => (r.label.proof === null ? DASH : { text: formatNumeric(r.label.proof) }) },
  {
    id: "designation",
    label: "Cask / BiB",
    group: "label",
    cell: (r) => text([r.label.isCaskStrength ? "Cask Strength" : null, r.label.isBottledInBond ? "Bottled in Bond" : null].filter(Boolean).join(" · ")),
  },
  { id: "age", label: "Age", group: "label", cell: (r, c) => labelAge(r.label, c.kinds) },
  { id: "distilleries", label: "Distillery", group: "label", cell: (r) => text(describeLinks("distilleries", r.label.links.distilleries)) },
  {
    id: "mashbills",
    label: "Mashbill",
    group: "label",
    cell: (r) => (NO_MASHBILL.has(r.label.fieldGroup) ? DASH : text(describeLinks("mashbills", r.label.links.mashbills))),
  },
  { id: "finishes", label: "Finish", group: "label", cell: (r) => text(describeLinks("finishes", r.label.links.finishes)) },
  { id: "msrp", label: "MSRP", group: "label", align: "right", cell: (r, c) => (r.label.msrp === null ? DASH : { text: formatMoney(r.label.msrp, c.currency) }) },
  { id: "bottleCount", label: "Bottles", group: "label", align: "right", labelsOnly: true, cell: (r) => ({ text: String(r.label.bottleCount) }) },

  {
    id: "singleBarrel",
    label: "Single barrel / pick",
    group: "bottle",
    cell: (r) => text([r.bottle?.isSingleBarrel ? "Single barrel" : null, r.bottle?.isSingleBarrelPick ? "Private pick" : null].filter(Boolean).join(" · ")),
  },
  { id: "pricePaid", label: "Price paid", group: "bottle", align: "right", cell: (r, c) => (r.bottle?.pricePaid == null ? DASH : { text: formatMoney(r.bottle.pricePaid, c.currency) }) },
  { id: "store", label: "Store", group: "bottle", cell: (r) => text(r.bottle?.storeName) },
  { id: "dateAcquired", label: "Purchased", group: "bottle", cell: (r) => (r.bottle?.dateAcquired ? { text: formatDate(r.bottle.dateAcquired) } : DASH) },
  { id: "status", label: "Status", group: "bottle", cell: (r) => (r.bottle ? { text: humanise(r.bottle.status) } : DASH) },
  { id: "releaseYear", label: "Release year", group: "bottle", align: "right", defaultHidden: true, cell: (r) => (r.bottle?.releaseYear == null ? DASH : { text: String(r.bottle.releaseYear) }) },
  { id: "pickName", label: "Pick name", group: "bottle", defaultHidden: true, cell: (r) => text(r.bottle?.pickName) },
  { id: "location", label: "Location", group: "bottle", defaultHidden: true, cell: (r) => text(r.bottle?.location) },
  { id: "notes", label: "Notes", group: "bottle", defaultHidden: true, cell: (r) => text(r.bottle?.notes) },
  {
    id: "ownProof",
    label: "This bottle's proof",
    group: "bottle",
    align: "right",
    defaultHidden: true,
    cell: (r) => own(r.bottle?.proof == null ? null : { text: formatNumeric(r.bottle.proof) }, r.label.proof === null ? DASH : { text: formatNumeric(r.label.proof) }),
  },
  {
    id: "ownAge",
    label: "This bottle's age",
    group: "bottle",
    defaultHidden: true,
    cell: (r, c) => {
      const b = r.bottle;
      const mine = b ? (describeAgeParts(b.ageYears, b.ageMonths, b.ageDays) ?? b.ageStatement) : null;
      return own(mine ? { text: mine } : null, labelAge(r.label, c.kinds));
    },
  },
  {
    id: "ownSize",
    label: "This bottle's size",
    group: "bottle",
    align: "right",
    defaultHidden: true,
    cell: (r) => own(r.bottle?.sizeMl == null ? null : { text: `${r.bottle.sizeMl} mL` }, { text: `${r.label.sizeMl} mL` }),
  },
];

/** The ids the Fields picker starts with switched off. */
export const DEFAULT_HIDDEN: ReadonlySet<string> = new Set(SHEET_COLUMNS.filter((c) => c.defaultHidden).map((c) => c.id));

/** Which of the two views is on. At least one always is; if neither is asked for, both are. */
export function normaliseView(view: Partial<SheetView> | null | undefined): SheetView {
  const labels = view?.labels !== false;
  const bottles = view?.bottles !== false;
  return labels || bottles ? { labels, bottles } : { labels: true, bottles: true };
}

/**
 * The columns shown for a view. Brand and Label always, whatever is hidden. With Labels off, only the bottle's
 * own columns follow them; with Bottles off, only the label's, and the count of bottles on each label. A
 * column the person has hidden stays hidden.
 */
export function columnsFor(view: SheetView, hidden: ReadonlySet<string>): SheetColumn[] {
  return SHEET_COLUMNS.filter((column) => {
    if (column.identity) return true;
    if (column.always) return column.group === "label" ? view.labels : view.bottles;
    if (hidden.has(column.id)) return false;
    if (column.group === "label") return view.labels && (!column.labelsOnly || !view.bottles);
    return view.bottles;
  });
}

const byName = (a: SheetLabel, b: SheetLabel) =>
  a.brand.localeCompare(b.brand, undefined, { sensitivity: "base" }) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id - b.id;

/**
 * The rows for a view: one per bottle when Bottles is on (a bottle is the thing you hold), one per label when only
 * Labels is. Both are in brand and label order, so a label's bottles sit together.
 */
export function sheetRows(view: SheetView, labels: ReadonlyArray<SheetLabel>, bottles: ReadonlyArray<SheetBottle>): SheetRow[] {
  const sorted = [...labels].sort(byName);
  if (!view.bottles) return sorted.map((label) => ({ key: `l${label.id}`, label, bottle: null }));
  const labelById = new Map(sorted.map((label) => [label.id, label]));
  const rank = new Map(sorted.map((label, index) => [label.id, index]));
  return bottles
    .filter((bottle) => labelById.has(bottle.expressionId))
    .sort((a, b) => rank.get(a.expressionId)! - rank.get(b.expressionId)! || a.id - b.id)
    .map((bottle) => ({ key: `b${bottle.id}`, label: labelById.get(bottle.expressionId)!, bottle }));
}
