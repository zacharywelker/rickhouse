import { describeLinks } from "@/lib/expressions/links";
import type { Marker, SheetIndex } from "./resolve";
import type { ExpressionRow } from "@/lib/expressions/queries";
import type { CategoryKind } from "@/lib/expressions/rules";
import { formatDate, formatMoney, humanise } from "@/lib/utils";
import { LABEL_AGE } from "./age";
import { INGREDIENTS_COLUMN } from "./links";
import { PANEL_COLUMNS } from "./panels";
import { designationEditor, GENERATED_BOTTLE, GENERATED_LABEL } from "./fields";
import { abvCell, proofCell, sizeCell } from "./value-cells";

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

/** A vintage (a label's known release) as the sheet reads it: its own proof and age, which a bottle on it shows. Null: it has none of its own. */
export type SheetVintage = {
  id: number;
  labelId: number;
  name: string;
  proof: string | null;
  ageYears: string | null;
  ageMonths: number | null;
  ageDays: number | null;
  ageStatement: string | null;
  ageYearsSource: "entered" | "derived";
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
/** Each label's own lists, by name, for the cells that summarise them: its older names, and its known releases. */
export type LabelLists = { versions: Record<number, string[]>; releases: Record<number, string[]> };
export type SheetContext = { currency: string; /** Lookups for resolving a value from the bottle, its vintage or the label (`resolve.ts`). */ index?: SheetIndex; kinds: Record<number, CategoryKind>; refs?: RefNames; lists?: LabelLists; /** Category names, for a saved label's Category cell. */ categories?: Record<number, string> };
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
  /** A small tag before the text: where the value comes from, when it is not the label's own (`resolve.ts`). */
  marker?: Marker;
  /** The label's vintages disagree and it has no value of its own: the cell says "Varies", and a copy leaves it blank. */
  varies?: boolean;
};

export type SheetColumn = {
  id: string;
  label: string;
  /** Label columns change the label; bottle columns change one bottle; value columns show the bottle's, its vintage's or the label's, whichever applies, in every view. */
  group: "label" | "bottle" | "value";
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

const DESIGNATION = designationEditor();

/** The columns every bottle is entered through, in order, before the rest. */
const FIRST_COLUMNS: ReadonlyArray<string> = ["brand", "name", "category", "releaseId", "singleBarrel", "privateSelection", "sizeMl", "proof", "abv", "ageYears", "ageMonths", "ageDays", "ageStatement"];

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
  { id: "sizeMl", label: "Size", group: "value", align: "right", cell: (r, c) => sizeCell(r, c) },
  { id: "proof", label: "Proof", group: "value", align: "right", cell: (r, c) => proofCell(r, c) },
  { id: "abv", label: "ABV", group: "value", align: "right", cell: (r, c) => abvCell(r, c) },
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

  { id: "pricePaid", label: "Price paid", group: "bottle", align: "right", cell: (r, c) => (r.bottle?.pricePaid == null ? DASH : { text: formatMoney(r.bottle.pricePaid, c.currency) }) },
  { id: "store", label: "Store", group: "bottle", cell: (r) => text(r.bottle?.storeName) },
  { id: "dateAcquired", label: "Purchased", group: "bottle", cell: (r) => (r.bottle?.dateAcquired ? { text: formatDate(r.bottle.dateAcquired) } : DASH) },
  { id: "status", label: "Status", group: "bottle", cell: (r) => (r.bottle ? { text: humanise(r.bottle.status) } : DASH) },
  { id: "releaseYear", label: "Release year", group: "bottle", align: "right", defaultHidden: true, cell: (r) => (r.bottle?.releaseYear == null ? DASH : { text: String(r.bottle.releaseYear) }) },
  { id: "pickName", label: "Pick name", group: "bottle", defaultHidden: true, cell: (r) => text(r.bottle?.pickName) },
  { id: "location", label: "Location", group: "bottle", defaultHidden: true, cell: (r) => text(r.bottle?.location) },
  { id: "notes", label: "Notes", group: "bottle", defaultHidden: true, cell: (r) => text(r.bottle?.notes) },
];

/**
 * Every column. The label's, then the bottle's own, since the sheet draws each group together under its own caption.
 * Past the hand-made ones come the columns made from the forms' fields (`fields.ts`), all of them hidden until switched on.
 */
export const SHEET_COLUMNS: ReadonlyArray<SheetColumn> = (() => {
  // The age boxes sit after Cask / BiB in the label's own list; they are moved up with the other values below.
  const after = (list: SheetColumn[], id: string, add: ReadonlyArray<SheetColumn>) => {
    const at = list.findIndex((c) => c.id === id);
    list.splice(at + 1, 0, ...add);
    return list;
  };
  const label = after(after(BY_HAND.filter((c) => c.group === "label" || c.group === "value"), "designation", LABEL_AGE.map((g) => g.column)), "finishes", [INGREDIENTS_COLUMN]);
  const rest = [...label, ...GENERATED_LABEL.map((g) => g.column), ...PANEL_COLUMNS, ...BY_HAND.filter((c) => c.group === "bottle"), ...GENERATED_BOTTLE.map((g) => g.column)];
  // The order a bottle is entered in: what it is (brand, label, category, vintage, single barrel, private selection), then its values.
  const head = FIRST_COLUMNS.map((id) => rest.find((c) => c.id === id)!);
  return [...head, ...rest.filter((c) => !FIRST_COLUMNS.includes(c.id))];
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
    if (column.always) return column.group === "label" ? view.labels : column.group === "bottle" ? view.bottles : true;
    if (hidden.has(column.with ?? column.id)) return false;
    if (column.group === "value") return true;
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
