import { ageSummary, ownAgeSummary } from "./age";
import { applyEdits, editKey } from "./changes";
import { EDITORS, type Edits } from "./editors";
import { SHEET_COLUMNS, type SheetContext, type SheetPhoto, type SheetRow, type SheetView } from "./sheet";

/**
 * What the rail shows for the row the cursor is in. The rail is display only: this is the whole of what it knows, worked
 * out from the row and the edits not yet read back, so it agrees with the sheet beside it. No React, no database.
 */

/** Where a fact comes from: the label, this bottle's own, or the bottle itself (a thing only a bottle has). */
export type FactSource = "label" | "own" | "bottle";

export type RailFact = {
  label: string;
  value: string;
  source: FactSource;
  /** For this bottle's own value: what the label says, alongside. */
  alongside?: string;
};

export type Rail = {
  /** What the cursor is on: a bottle, a label (the Labels-only view), or a new row that has no label yet. */
  kind: "bottle" | "label" | "new";
  brand: string;
  label: string;
  category: string;
  /** Labels-only: how many bottles the label has. */
  bottleCount: number | null;
  photo: SheetPhoto | null;
  facts: RailFact[];
  /** The few worth filling in that are still empty. */
  blank: string[];
};

const DASH = "—";
const isBlank = (text: string) => text === "" || text === DASH;

/** The label's facts, in the order the sheet has them. */
const LABEL_FACTS = [
  { id: "sizeMl", own: "ownSize" },
  { id: "proof", own: "ownProof" },
  { id: "designation" },
  { id: "age", own: "ownAge" }, // not columns: the age reads as one value here (see `ageSummary`)
  { id: "distilleries" },
  { id: "mashbills" },
  { id: "finishes" },
  { id: "msrp" },
] as const;

/** What only a bottle has. */
const BOTTLE_FACTS = ["pricePaid", "store", "dateAcquired", "singleBarrel", "pickName", "releaseYear", "location", "notes", "status"] as const;

/** Worth asking for when empty: few, so the list stays short. */
const WORTH_FILLING = ["proof", "distilleries", "msrp", "pricePaid", "store", "dateAcquired"] as const;

const column = (id: string) => SHEET_COLUMNS.find((c) => c.id === id)!;
const MAX_BLANK = 4;

/** The rail for a row, with its photo (the caller looks it up), as it stands with the edits not yet read back. */
export function railFor(row: SheetRow, ctx: SheetContext, view: SheetView, edits: Edits, photo: SheetPhoto | null): Rail {
  /** A column's cell for this row, with an edit not yet read back shown in place of the saved value. */
  const cellOf = (id: string) => {
    if (id === "age") return ageSummary(applied.label, ctx.kinds);
    if (id === "ownAge") return ownAgeSummary(applied, ctx.kinds);
    const editor = EDITORS[id];
    const typed = editor ? edits[editKey(row, editor)]?.[id] : undefined;
    return typed !== undefined && editor ? editor.display(typed, ctx, row) : column(id).cell(row, ctx);
  };

  const onBottle = row.bottle !== null && view.bottles;
  /** The row as it stands with what has been typed but not yet read back, for the age (four cells that read as one value). */
  const applied = applyEdits([row], edits)[0]!;
  const facts: RailFact[] = [];
  const empty = new Set<string>();

  for (const fact of LABEL_FACTS) {
    const own = onBottle && "own" in fact ? cellOf(fact.own) : null;
    const labelCell = cellOf(fact.id);
    // The bottle's own columns show the label's value in grey when the bottle has none: that is "from the label".
    const useOwn = own !== null && !own.muted;
    const cell = useOwn ? own! : labelCell;
    if (isBlank(cell.text)) {
      empty.add(fact.id);
      continue;
    }
    facts.push({ label: fact.id === "age" ? "Age" : column(fact.id).label, value: cell.text, source: useOwn ? "own" : "label", ...(useOwn && !isBlank(labelCell.text) ? { alongside: labelCell.text } : {}) });
  }
  if (onBottle) {
    for (const id of BOTTLE_FACTS) {
      const cell = cellOf(id);
      if (isBlank(cell.text)) empty.add(id);
      else facts.push({ label: column(id).label, value: cell.text, source: "bottle" });
    }
  }

  const blank = WORTH_FILLING.filter((id) => empty.has(id) && (onBottle || column(id).group === "label")).slice(0, MAX_BLANK).map((id) => column(id).label);
  const named = row.label.name !== "" || row.label.brand !== "";
  return {
    kind: row.draft && !row.draft.labelChosen ? "new" : onBottle ? "bottle" : "label",
    brand: row.label.brand,
    label: row.label.name,
    category: row.label.category,
    bottleCount: onBottle || row.draft ? null : row.label.bottleCount,
    photo: named ? photo : null,
    facts,
    blank,
  };
}
