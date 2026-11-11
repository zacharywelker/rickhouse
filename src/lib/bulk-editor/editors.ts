import type { FieldSpec } from "@/lib/admin/types";
import { BOTTLE_FIELDS } from "@/lib/expressions/bottle-fields";
import { EXPRESSION_SECTIONS } from "@/lib/expressions/fields";
import { formatDate, formatMoney, formatNumeric } from "@/lib/utils";
import type { Cell, SheetColumn, SheetContext, SheetRow, SheetView } from "./sheet";

/**
 * Which cells can be edited, and how. An editor is the form's own field definition for the column (so a price is money
 * input and a date is a date input here exactly as on the bottle form), plus how to read the cell's value as the text
 * an input holds and how to show an edited value back.
 *
 * Only plain typed-in columns are here. Brand, Label, Category and Store need their autocompletes, a label's facts on a
 * bottle row need the lock that says they change every bottle on it, and the composite cells (age, designations) have
 * several fields behind one. Those come in later steps, and until they do those cells are simply not editable.
 */

/** The cells that pick from a list instead of taking a value: a brand, a label under it, a category. */
export type ComboKind = "brand" | "label" | "category";

export type CellEditor = {
  column: string;
  /** Set for a cell that picks from a list. Its `spec` is then unused, and what is chosen is kept with the row, not in the edits. */
  combo?: ComboKind;
  /** The field's name on the form, and so on the server's patch. */
  field: string;
  /** A label column changes the label and every bottle on it; a bottle column changes that bottle only. */
  scope: "label" | "bottle";
  spec: FieldSpec;
  /** Blank is not allowed. */
  required?: boolean;
  /** A date that has to have already happened. */
  pastOnly?: boolean;
  /** Whether the cell means anything on this row, by the form's own rule. Where it does not, it is not editable. */
  applies?: (row: SheetRow) => boolean;
  /** Typing a character on the selected cell starts an edit that replaces the value. Not for dates: those are typed segment by segment. */
  typeToReplace: boolean;
  /** The cell's value as the text an input holds. */
  initial: (row: SheetRow) => string;
  /** An edited value as the cell shows it. */
  display: (value: string, ctx: SheetContext, row: SheetRow) => Cell;
};

const DASH: Cell = { text: "—", muted: true };
const bottleSpec = (name: string): FieldSpec => {
  const spec = BOTTLE_FIELDS.find((field) => field.name === name);
  if (!spec) throw new Error(`The bottle form has no field "${name}".`);
  return spec;
};
const labelSpec = (name: string): FieldSpec => {
  const spec = EXPRESSION_SECTIONS.flatMap((section) => section.fields).find((field) => field.name === name);
  if (!spec) throw new Error(`The label form has no field "${name}".`);
  return spec;
};
/** What a picking cell's `spec` holds: it is never shown. */
const NO_SPEC: FieldSpec = { kind: "text", name: "combo", label: "" };
const text = (value: string): Cell => (value === "" ? DASH : { text: value });
const money = (value: string, ctx: SheetContext): Cell => (value === "" ? DASH : { text: formatMoney(value, ctx.currency) });
const mL = (value: string): Cell => (value === "" ? DASH : { text: `${value} mL` });

export const EDITORS: Readonly<Record<string, CellEditor>> = {
  // The picking cells, on a new row only for now. On a saved row they come with the rules for moving a bottle and renaming a label.
  brand: { column: "brand", field: "brand", scope: "label", combo: "brand", spec: NO_SPEC, typeToReplace: true, initial: (r) => r.label.brand, display: (v) => text(v) },
  name: { column: "name", field: "label", scope: "label", combo: "label", spec: NO_SPEC, typeToReplace: true, initial: (r) => r.label.name, display: (v) => text(v) },
  category: { column: "category", field: "categoryId", scope: "label", combo: "category", spec: NO_SPEC, typeToReplace: true, initial: (r) => r.label.category, display: (v) => text(v) },
  // The bottle's own.
  pricePaid: { column: "pricePaid", field: "pricePaid", scope: "bottle", spec: bottleSpec("pricePaid"), typeToReplace: true, initial: (r) => r.bottle?.pricePaid ?? "", display: (v, c) => money(v, c) },
  dateAcquired: { column: "dateAcquired", field: "dateAcquired", scope: "bottle", spec: bottleSpec("dateAcquired"), pastOnly: true, typeToReplace: false, initial: (r) => r.bottle?.dateAcquired ?? "", display: (v) => (v === "" ? DASH : { text: formatDate(v) }) },
  releaseYear: { column: "releaseYear", field: "releaseYear", scope: "bottle", spec: bottleSpec("releaseYear"), typeToReplace: true, initial: (r) => (r.bottle?.releaseYear == null ? "" : String(r.bottle.releaseYear)), display: (v) => text(v) },
  // The form shows a pick name only for a private selection.
  pickName: { column: "pickName", field: "pickName", scope: "bottle", spec: bottleSpec("pickName"), typeToReplace: true, applies: (r) => r.bottle?.isSingleBarrelPick === true, initial: (r) => r.bottle?.pickName ?? "", display: (v) => text(v) },
  location: { column: "location", field: "location", scope: "bottle", spec: bottleSpec("location"), typeToReplace: true, initial: (r) => r.bottle?.location ?? "", display: (v) => text(v) },
  notes: { column: "notes", field: "notes", scope: "bottle", spec: bottleSpec("notes"), typeToReplace: true, initial: (r) => r.bottle?.notes ?? "", display: (v) => text(v) },
  // This bottle's own proof and size: blank falls back to the label's, shown in grey.
  ownProof: {
    column: "ownProof", field: "proof", scope: "bottle", spec: bottleSpec("proof"), typeToReplace: true,
    initial: (r) => (r.bottle?.proof == null ? "" : formatNumeric(r.bottle.proof)),
    display: (v, _c, r) => (v !== "" ? { text: v } : r.label.proof === null ? DASH : { text: formatNumeric(r.label.proof), muted: true }),
  },
  ownSize: {
    column: "ownSize", field: "sizeMl", scope: "bottle", spec: bottleSpec("sizeMl"), typeToReplace: true,
    initial: (r) => (r.bottle?.sizeMl == null ? "" : String(r.bottle.sizeMl)),
    display: (v, _c, r) => (v !== "" ? mL(v) : { text: `${r.label.sizeMl} mL`, muted: true }),
  },
  // A label's own facts.
  proof: { column: "proof", field: "proof", scope: "label", spec: labelSpec("proof"), typeToReplace: true, initial: (r) => (r.label.proof === null ? "" : formatNumeric(r.label.proof)), display: (v) => text(v) },
  sizeMl: { column: "sizeMl", field: "sizeMl", scope: "label", spec: labelSpec("sizeMl"), required: true, typeToReplace: true, initial: (r) => String(r.label.sizeMl), display: (v) => mL(v) },
  msrp: { column: "msrp", field: "msrp", scope: "label", spec: labelSpec("msrp"), typeToReplace: true, initial: (r) => r.label.msrp ?? "", display: (v, c) => money(v, c) },
};

/**
 * The editor for a cell, or null when it cannot be edited here.
 *
 * - A bottle's own plain cells: on a bottle row.
 * - A label's plain facts: where the row is the label (Labels without Bottles), or is a new label being made. On a
 *   bottle row for a label that exists they belong to every bottle on it, and how that is unlocked is its own step.
 * - Brand, Label and Category: on a new row only. Label waits for a brand; Category is for a new label, since an
 *   existing label has one already and it is not the row's to change.
 */
export function editorFor(column: SheetColumn, view: SheetView, row: SheetRow): CellEditor | null {
  const editor = EDITORS[column.id];
  if (!editor || editor.applies?.(row) === false) return null;
  const draft = row.draft;
  if (editor.combo) {
    if (!draft) return null;
    if (editor.combo === "brand") return editor;
    if (editor.combo === "label") return draft.brandChosen ? editor : null;
    return draft.labelChosen && draft.labelIsNew ? editor : null;
  }
  if (editor.scope === "bottle") return row.bottle ? editor : null;
  // A new row that names a label that exists is that label's, not a new one to fill in.
  if (draft?.labelChosen && !draft.labelIsNew) return null;
  return !view.bottles || draft?.labelChosen ? editor : null;
}

export type Parsed = { ok: true; value: string } | { ok: false; message: string };
const fail = (message: string): Parsed => ({ ok: false, message });

/**
 * Checks what was typed before it is kept. The server checks again when it saves; this only stops an obvious slip
 * from sitting in a cell. A blank is kept as blank (it clears the value) unless the field is required.
 */
export function parseCell(editor: CellEditor, raw: string, today: string = new Date().toISOString().slice(0, 10)): Parsed {
  let value = raw.trim();
  if (value === "") return editor.required ? fail("Enter a value.") : { ok: true, value: "" };
  const { spec } = editor;
  if (spec.kind === "number") {
    // Typed freehand: ".5" means 0.5 and "5." means 5.
    value = value.replace(/^(-?)\./, (_, sign: string) => `${sign}0.`).replace(/\.$/, "");
    const n = Number(value);
    if (!Number.isFinite(n)) return fail("Enter a number.");
    if (spec.min !== undefined && n < spec.min) return fail(`At least ${spec.min}.`);
    if (spec.max !== undefined && n > spec.max) return fail(`At most ${spec.max}.`);
    if (spec.step === 1 && !Number.isInteger(n)) return fail("Use a whole number.");
    if (spec.money === true && !/^\d+(\.\d{1,2})?$/.test(value)) return fail("Use at most two decimals.");
  }
  if (spec.kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return fail("Use a date.");
    if (editor.pastOnly && value > today) return fail("That date is in the future.");
  }
  return { ok: true, value };
}

/** Edits not yet saved, by row key then column id, holding the text the cell now has. */
export type Edits = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** Records an edit, or forgets it when the value is back to what it was. Returns the same object when nothing changes. */
export function setEdit(edits: Edits, rowKey: string, column: string, value: string, original: string): Edits {
  const row = edits[rowKey] ?? {};
  if (value === original) {
    if (!(column in row)) return edits;
    const { [column]: _gone, ...rest } = row;
    const { [rowKey]: _row, ...others } = edits;
    return Object.keys(rest).length > 0 ? { ...others, [rowKey]: rest } : others;
  }
  if (row[column] === value) return edits;
  return { ...edits, [rowKey]: { ...row, [column]: value } };
}

export const countEdits = (edits: Edits): number => Object.values(edits).reduce((n, row) => n + Object.keys(row).length, 0);
