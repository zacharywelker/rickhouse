import { describeLinks } from "@/lib/expressions/links";
import type { ExpressionRow } from "@/lib/expressions/queries";
import type { CategoryKind } from "@/lib/expressions/rules";
import { formatDate, formatMoney, formatNumeric, humanise } from "@/lib/utils";
import { BOTTLE_AGE, LABEL_AGE } from "./age";
import { INGREDIENTS_COLUMN } from "./links";
import { designationEditor, GENERATED_BOTTLE, GENERATED_LABEL, singleBarrelEditor } from "./fields";

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
  /** Which store, release and label name (version) the bottle has, by id. */
  storeId: number | null;
  releaseId: number | null;
  expressionNameId: number | null;
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
  ageYearsSource: "entered" | "derived";
  /** The rest of what a bottle can say that the sheet edits: where it came from, which release, the barrel. */
  acquisition: string;
  batch: string | null;
  pickedBy: string | null;
  barrelNumber: string | null;
  /** How many bottles there are in the release. */
  bottleCount: number | null;
  warehouse: string | null;
  rickFloor: string | null;
  barrelFilledOn: string | null;
  bottledOn: string | null;
  ginIsNas: boolean | null;
  tequilaClass: string | null;
  brandyGrade: string | null;
  /** Where the bottle is in its life: the level, whether it is open and since when, when it was killed, and whether it is a favourite. */
  fillPct: number;
  isOpen: boolean;
  dateOpened: string | null;
  dateKilled: string | null;
  isFavorite: boolean;
};

/** A thumbnail on the uploads volume. `isCutout` is whether the photo is a cutout (null: not yet known, drawn as one). */
export type SheetPhoto = { path: string; isCutout: boolean | null };

export type SheetView = { labels: boolean; bottles: boolean };
/** What a new, unsaved row has chosen so far (see `drafts.ts`). */
export type DraftMeta = { brandChosen: boolean; labelChosen: boolean; brandIsNew: boolean; labelIsNew: boolean };
export type SheetRow = {
  key: string;
  label: SheetLabel;
  bottle: SheetBottle | null;
  /** Present on a new, unsaved row. */
  draft?: DraftMeta;
  /** The bottle is moving to this label (`label` is the one it is moving to), not saved yet. */
  moved?: boolean;
};
/** What the picking cells name their choices by: id to name, for the stores, cooperages, releases and label names. */
export type RefNames = { store: Record<number, string>; cooperage: Record<number, string>; release: Record<number, string>; version: Record<number, string> };
export type SheetContext = { currency: string; kinds: Record<number, CategoryKind>; refs?: RefNames };
export type Cell = {
  text: string;
  /** Said on hover, and to a screen reader: why a cell is empty or cannot be edited ("Not used for this spirit"). */
  note?: string;
  /** Grey: the value is inherited, or there is none. */
  muted?: boolean;
  /** A small tag after the text: "new" on a brand or label that does not exist yet. */
  badge?: string;
  /** Worked out, not stored (an age a designation implies): drawn in italics, with `note` as its reason. */
  inferred?: boolean;
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
  /** The form section it belongs to ("Rum detail", "Release"…): the Fields picker groups by it. */
  section?: string;
  /** A caption over this column and its neighbours that share it (the three age boxes under "Age"). */
  band?: string;
  /** A narrow column, in pixels. */
  width?: number;
  /** Shown and hidden with this other column, and not offered in the Fields picker on its own. */
  with?: string;
  /** What the Sort control calls it, when its own label is only a letter. */
  sortLabel?: string;
  /** Hidden until switched on in the Fields picker. */
  defaultHidden?: boolean;
  /** Only when the sheet is one row per label. */
  labelsOnly?: boolean;
  cell: (row: SheetRow, ctx: SheetContext) => Cell;
};

const DASH: Cell = { text: "—", muted: true };
const text = (value: string | null | undefined): Cell => (value ? { text: value } : DASH);

const NO_MASHBILL = new Set(["rum", "agave", "brandy", "gin", "vodka", "amaro", "liqueur"]);

/** The bottle's own value when it has one; otherwise the label's, in grey, so it is plain it is inherited. */
function own(value: Cell | null, inherited: Cell): Cell {
  return value ? value : { ...inherited, muted: true };
}

const DESIGNATION = designationEditor();
const SINGLE_BARREL = singleBarrelEditor();

/** The columns made by hand, in the order a bottle is entered at the shelf: label facts, then the bottle's own. */
const BY_HAND: ReadonlyArray<SheetColumn> = [
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
    cell: (r, c) => (DESIGNATION.applies?.(r, c.kinds) === false ? { text: "—", muted: true, note: "Not used for this spirit" } : DESIGNATION.display(DESIGNATION.initial(r), c, r)),
  },
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
    cell: (r, c) => (SINGLE_BARREL.applies?.(r, c.kinds) === false ? { text: "—", muted: true, note: "Only for aged gin" } : SINGLE_BARREL.display(SINGLE_BARREL.initial(r), c, r)),
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
    id: "ownSize",
    label: "This bottle's size",
    group: "bottle",
    align: "right",
    defaultHidden: true,
    cell: (r) => own(r.bottle?.sizeMl == null ? null : { text: `${r.bottle.sizeMl} mL` }, { text: `${r.label.sizeMl} mL` }),
  },
];

/**
 * Every column. The label's, then the bottle's own, since the sheet draws each group together under its own caption.
 * Past the hand-made ones come the columns made from the forms' fields (`fields.ts`), all of them hidden until switched on.
 */
export const SHEET_COLUMNS: ReadonlyArray<SheetColumn> = (() => {
  // The age boxes sit where the Age column was: after Cask / BiB, and after the bottle's own proof.
  const after = (list: SheetColumn[], id: string, add: ReadonlyArray<SheetColumn>) => {
    const at = list.findIndex((c) => c.id === id);
    list.splice(at + 1, 0, ...add);
    return list;
  };
  const label = after(after(BY_HAND.filter((c) => c.group === "label"), "designation", LABEL_AGE.map((g) => g.column)), "finishes", [INGREDIENTS_COLUMN]);
  const bottle = after(BY_HAND.filter((c) => c.group === "bottle"), "ownProof", BOTTLE_AGE.map((g) => g.column));
  return [...label, ...GENERATED_LABEL.map((g) => g.column), ...bottle, ...GENERATED_BOTTLE.map((g) => g.column)];
})();

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
    if (hidden.has(column.with ?? column.id)) return false;
    if (column.group === "label") return view.labels && (!column.labelsOnly || !view.bottles);
    return view.bottles;
  });
}

const byName = (a: SheetLabel, b: SheetLabel) =>
  a.brand.localeCompare(b.brand, undefined, { sensitivity: "base" }) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id - b.id;

/** The order rows are in: by brand and label, and a label's bottles together, oldest first. */
export function compareRows(a: SheetRow, b: SheetRow): number {
  return byName(a.label, b.label) || (a.bottle?.id ?? 0) - (b.bottle?.id ?? 0);
}

/**
 * The rows for a view: one per bottle when Bottles is on (a bottle is the thing you hold), one per label when only
 * Labels is. Both are in brand and label order, so a label's bottles sit together.
 */
export function sheetRows(view: SheetView, labels: ReadonlyArray<SheetLabel>, bottles: ReadonlyArray<SheetBottle>): SheetRow[] {
  const sorted = [...labels].sort(byName);
  if (!view.bottles) return sorted.map((label) => ({ key: `l${label.id}`, label, bottle: null }));
  const labelById = new Map(sorted.map((label) => [label.id, label]));
  return bottles
    .filter((bottle) => labelById.has(bottle.expressionId))
    .map((bottle): SheetRow => ({ key: `b${bottle.id}`, label: labelById.get(bottle.expressionId)!, bottle }))
    .sort(compareRows);
}
