import { bottleFieldNotUsed } from "@/lib/expressions/bottle-applicability";
import { BOTTLE_SECTIONS } from "@/lib/expressions/bottle-fields";
import { describeAgeParts } from "@/lib/expressions/display";
import { EXPRESSION_SECTIONS } from "@/lib/expressions/fields";
import { hiddenFields, type CategoryKind } from "@/lib/expressions/rules";
import { whiskeyAge } from "@/lib/expressions/whiskey-age";
import { formatNumeric } from "@/lib/utils";
import { hasAge } from "./age-derive";
import { cellFromText, editorFrom, type Generated, type Kinds, type Simple } from "./fields";
import type { Cell, SheetColumn, SheetContext, SheetLabel, SheetRow } from "./sheet";

/**
 * Age, as the single forms have it: years, months and days side by side, and the age statement beside them. A cell of
 * each, so what is typed is what is stored, and the same rules as the forms:
 *
 * - Typing a statement into a whiskey fills the years in from its youngest age and marks them derived. They stay
 *   editable, and an age that was entered is never replaced (`age-derive.ts`, shared with the server).
 * - Where a designation implies a minimum (Straight, Bottled in Bond, Scotch), the years show it in grey and italic,
 *   as the tables do; nothing is stored.
 * - An entered age locks the statement, and (outside whiskey, which derives years from its statement) a statement locks
 *   the age. NAS locks both. A locked cell opens with a triple-click.
 * - Sorting and filtering go by the age, ahead of the statement (`find.ts`).
 */
type Field = "ageYears" | "ageMonths" | "ageDays" | "ageStatement";
const FIELDS: ReadonlyArray<Field> = ["ageYears", "ageMonths", "ageDays", "ageStatement"];
const SHORT = { ageYears: "Y", ageMonths: "M", ageDays: "D" } as const;

const DASH: Cell = { text: "—", muted: true };
const filled = (value: unknown) => String(value ?? "").trim() !== "";
const asText = (value: unknown): Cell => (filled(value) ? { text: formatNumeric(String(value)) } : DASH);

const labelSpec = (name: Field): Simple => {
  const spec = EXPRESSION_SECTIONS.flatMap((s) => s.fields).find((f) => f.name === name);
  if (!spec || spec.kind === "reference") throw new Error(`The label form has no field "${name}".`);
  return spec;
};
const bottleSpec = (name: Field): Simple => {
  const spec = BOTTLE_SECTIONS.flatMap((s) => s.fields).find((f) => f.name === name);
  if (!spec || spec.kind === "reference") throw new Error(`The bottle form has no field "${name}".`);
  return spec;
};

/** Years are tenths of a year; the form's number box allows any step 0.1 value, and so does the server. */
const oneDecimal = (value: string, field: Field) => (field === "ageYears" && !/^\d+(\.\d)?$/.test(value) ? "Use at most one decimal." : null);

// ---------------------------------------------------------------------------
// A label's
// ---------------------------------------------------------------------------

const labelHidden = (row: SheetRow, kinds: Kinds) =>
  hiddenFields({ group: row.label.fieldGroup, kind: kinds[row.label.categoryId] ?? null, values: row.label as unknown as Record<string, unknown>, ginAged: row.label.isAgedGin === true });

function labelLock(field: Field, label: SheetLabel): string | null {
  if (label.isNas) return "NAS: there is no age to enter.";
  const whiskey = label.fieldGroup === "whiskey";
  if (field === "ageStatement") return hasAge(label) && !(whiskey && label.ageYearsSource === "derived") ? "An age is entered. Triple-click to enter a statement as well." : null;
  return !whiskey && filled(label.ageStatement) ? "There is an age statement. Triple-click to enter an age as well." : null;
}

/** The minimum a whiskey implies, or the youngest age its statement gives, when nothing is stored: shown, never saved. */
function inferred(label: SheetLabel, kinds: Kinds): Cell | null {
  if (label.fieldGroup !== "whiskey" || hasAge(label) || label.isNas) return null;
  const age = whiskeyAge(label, (kinds[label.categoryId] as CategoryKind | undefined) ?? "other");
  return age.groupingYears === null ? null : { text: formatNumeric(String(age.groupingYears)), muted: true, inferred: true, ...(age.explanation ? { note: age.explanation } : {}) };
}

function labelCell(field: Field, row: SheetRow, kinds: Kinds): Cell {
  if (labelHidden(row, kinds).has(field)) return { ...DASH, note: "Not used for this spirit" };
  const value = row.label[field];
  if (filled(value)) return field === "ageStatement" ? { text: String(value) } : asText(value);
  return (field === "ageYears" ? inferred(row.label, kinds) : null) ?? DASH;
}

function labelAgeColumn(field: Field): Generated {
  const spec = labelSpec(field);
  const base = editorFrom(spec, field, "label", (row) => row.label, (row, kinds) => !labelHidden(row, kinds).has(field));
  const editor = { ...base, lock: (row: SheetRow) => labelLock(field, row.label), check: (value: string) => oneDecimal(value, field) };
  const column: SheetColumn = {
    id: field,
    label: field === "ageStatement" ? "Age statement" : SHORT[field],
    sortLabel: field === "ageYears" ? "Age" : undefined,
    group: "label",
    align: field === "ageStatement" ? undefined : "right",
    ...(field === "ageStatement" ? {} : { always: true, band: "Age", width: 56 }),
    // One entry in the Fields picker for the three.
    ...(field === "ageMonths" || field === "ageDays" ? { with: "ageYears" } : {}),
    cell: (row, ctx) => labelCell(field, row, ctx.kinds),
  };
  return { column, editor };
}

export const LABEL_AGE: ReadonlyArray<Generated> = FIELDS.map(labelAgeColumn);

/** The age as the Age column used to write it, for the rail: the parts, else the statement, else what a designation implies. */
export function ageSummary(label: SheetLabel, kinds: Record<number, CategoryKind>): Cell {
  const { fieldGroup } = label;
  if (fieldGroup === "vodka" || ((fieldGroup === "amaro" || fieldGroup === "liqueur") && !label.isAged)) return DASH;
  if (fieldGroup === "whiskey") {
    const text = whiskeyAge(label, kinds[label.categoryId] ?? "other").text ?? (label.isNas ? "NAS" : null);
    return text ? { text } : DASH;
  }
  const text = describeAgeParts(label.ageYears, label.ageMonths, label.ageDays) ?? label.ageStatement ?? (label.isNas ? "NAS" : label.isStraight ? "Straight" : null);
  return text ? { text } : DASH;
}

// ---------------------------------------------------------------------------
// A bottle's own
// ---------------------------------------------------------------------------

const OWN: Record<Field, string> = { ageYears: "ownAgeYears", ageMonths: "ownAgeMonths", ageDays: "ownAgeDays", ageStatement: "ownAgeStatement" };

const notUsed = (field: Field, row: SheetRow, kinds: Kinds) =>
  bottleFieldNotUsed(
    field,
    { group: row.label.fieldGroup, kind: kinds[row.label.categoryId] ?? "other", isAgedGin: row.label.isAgedGin === true, tequilaClass: row.label.tequilaClass ?? null },
    { tequilaClass: row.bottle?.tequilaClass ?? null },
  );

function bottleLock(field: Field, row: SheetRow): string | null {
  const b = row.bottle;
  if (!b) return null;
  if (b.ginIsNas === true) return "NAS: there is no age to enter.";
  const whiskey = row.label.fieldGroup === "whiskey";
  if (field === "ageStatement") return hasAge(b) && !(whiskey && b.ageYearsSource === "derived") ? "An age is entered. Triple-click to enter a statement as well." : null;
  return !whiskey && filled(b.ageStatement) ? "There is an age statement. Triple-click to enter an age as well." : null;
}

/** The bottle's own value, or the label's in grey (a blank is "same as the label"). */
function bottleCell(field: Field, row: SheetRow, kinds: Kinds, own: unknown): Cell {
  if (notUsed(field, row, kinds) !== null) return { ...DASH, note: notUsed(field, row, kinds)! };
  if (filled(own)) return field === "ageStatement" ? { text: String(own) } : asText(own);
  const fromLabel = labelCell(field, row, kinds);
  return fromLabel.text === "—" ? fromLabel : { ...fromLabel, muted: true };
}

function bottleAgeColumn(field: Field): Generated {
  const spec = bottleSpec(field);
  const id = OWN[field];
  const base = editorFrom(spec, id, "bottle", (row) => row.bottle, (row, kinds) => row.bottle !== null && notUsed(field, row, kinds) === null);
  const editor = {
    ...base,
    lock: (row: SheetRow) => bottleLock(field, row),
    check: (value: string) => oneDecimal(value, field),
    display: (value: string, ctx: SheetContext, row: SheetRow): Cell => (value === "" ? bottleCell(field, row, ctx.kinds, null) : cellFromText(spec, value)),
  };
  const column: SheetColumn = {
    id,
    label: field === "ageStatement" ? "This bottle's age statement" : SHORT[field],
    sortLabel: field === "ageYears" ? "This bottle's age" : undefined,
    group: "bottle",
    defaultHidden: true,
    align: field === "ageStatement" ? undefined : "right",
    ...(field === "ageStatement" ? {} : { band: "This bottle's age", width: 56 }),
    // Months and days come and go with the years: the three are one thing.
    ...(field === "ageMonths" || field === "ageDays" ? { with: OWN.ageYears } : {}),
    cell: (row, ctx) => bottleCell(field, row, ctx.kinds, row.bottle?.[field]),
  };
  return { column, editor };
}

export const BOTTLE_AGE: ReadonlyArray<Generated> = FIELDS.map(bottleAgeColumn);

/** A bottle's age as the Age column writes it: its own, else the label's. */
export function ownAgeSummary(row: SheetRow, kinds: Record<number, CategoryKind>): Cell {
  const b = row.bottle;
  const own = b ? (describeAgeParts(b.ageYears, b.ageMonths, b.ageDays) ?? b.ageStatement) : null;
  return own ? { text: own } : { ...ageSummary(row.label, kinds), muted: true };
}
