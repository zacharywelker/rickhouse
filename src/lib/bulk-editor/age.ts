import { bottleFieldNotUsed } from "@/lib/expressions/bottle-applicability";
import { describeAgeParts } from "@/lib/expressions/display";
import { hiddenFields } from "@/lib/expressions/rules";
import type { FieldSpec } from "@/lib/admin/types";
import type { CellEditor } from "./editors";
import type { Kinds } from "./fields";
import { labelAge, type Cell, type SheetRow } from "./sheet";

/**
 * Age is four fields behind one cell: years, months, days, and the statement as printed ("12 Year", "8 to 12 years").
 * What is typed says which:
 *
 * - `12` is years, and `12y 6m`, `6m`, `90d`, `4y 6m 10d` are years, months and days (single letters).
 * - `NAS` is no age statement.
 * - Anything else is the statement, as printed. `12 Year` is a statement, not 12 years: it keeps its wording.
 * - Blank clears all of it.
 *
 * Typing one kind clears the others, so what the cell shows is what is stored (the parts win over a statement
 * wherever an age is shown, so a leftover one would otherwise sit under the new value unseen).
 */
export type Age =
  | { kind: "none" }
  | { kind: "nas" }
  | { kind: "parts"; years: string | null; months: string | null; days: string | null }
  | { kind: "statement"; text: string };

const NUMBER = /^\d+(?:\.\d+)?$/;
const PARTS = /^(?:(\d+(?:\.\d+)?)\s*y)?\s*(?:(\d+(?:\.\d+)?)\s*m)?\s*(?:(\d+(?:\.\d+)?)\s*d)?$/i;

export function parseAge(text: string): Age | { error: string } {
  const t = text.trim();
  if (t === "") return { kind: "none" };
  if (/^nas$/i.test(t)) return { kind: "nas" };
  // A bare number is years. Otherwise it is parts only if it is made of numbers each followed by y, m or d.
  const bare = NUMBER.test(t);
  const lettered = !bare && /\d\s*[ymd]\b/i.test(t) ? PARTS.exec(t) : null;
  if (bare || lettered) {
    const [years, months, days] = bare ? [t, undefined, undefined] : [lettered![1], lettered![2], lettered![3]];
    if (years !== undefined && (Number(years) > 100 || !/^\d+(\.\d)?$/.test(years))) return { error: Number(years) > 100 ? "At most 100 years." : "Use at most one decimal in years." };
    if (months !== undefined && (!/^\d+$/.test(months) || Number(months) > 1200)) return { error: !/^\d+$/.test(months) ? "Months are a whole number." : "At most 1200 months." };
    if (days !== undefined && (!/^\d+$/.test(days) || Number(days) > 40000)) return { error: !/^\d+$/.test(days) ? "Days are a whole number." : "At most 40000 days." };
    return { kind: "parts", years: years ?? null, months: months ?? null, days: days ?? null };
  }
  if (t.length > 200) return { error: "Keep this under 200 characters." };
  return { kind: "statement", text: t };
}

/** The values a typed age sets, under the form's own field names. The label's also say whether it is NAS. */
function fieldsFor(age: Age, scope: "label" | "bottle"): Record<string, boolean | string | null> {
  const none = { ageYears: null, ageMonths: null, ageDays: null, ageStatement: null };
  const base = scope === "label" ? { ...none, isNas: false } : none;
  switch (age.kind) {
    case "none":
      return base;
    case "nas":
      return scope === "label" ? { ...none, isNas: true } : { ...none, ginIsNas: "true" };
    case "parts":
      return { ...base, ageYears: age.years, ageMonths: age.months, ageDays: age.days };
    case "statement":
      return { ...base, ageStatement: age.text };
  }
}

/** An age as the cell shows it: the parts as the Age column writes them, else the statement. */
export function ageText(parts: { ageYears: string | number | null; ageMonths: number | null; ageDays: number | null; ageStatement: string | null }): string {
  return describeAgeParts(parts.ageYears === null ? null : String(parts.ageYears), parts.ageMonths, parts.ageDays) ?? parts.ageStatement?.trim() ?? "";
}

const SPEC: FieldSpec = { kind: "text", name: "age", label: "Age", placeholder: "12, 12y 6m, NAS or 12 Year" };
const DASH: Cell = { text: "—", muted: true };

const AGE_FIELDS = ["ageYears", "ageMonths", "ageDays", "ageStatement"] as const;
const NAMES = { ageYears: "years", ageMonths: "months", ageDays: "days" } as const;

/** What a typed age asks for that the spirit does not use, by the form's own rules. */
function unusedBy(age: Age, notUsed: (field: string) => string | null): string | null {
  if (age.kind === "parts") {
    for (const [field, value] of [["ageYears", age.years], ["ageMonths", age.months], ["ageDays", age.days]] as const) {
      if (value !== null && notUsed(field) !== null) return `Age in ${NAMES[field]} is not used here: ${notUsed(field)?.toLowerCase()}.`;
    }
  }
  if (age.kind === "statement" && notUsed("ageStatement") !== null) return `There is no age statement for this spirit. Use years, months or days.`;
  if (age.kind === "nas" && notUsed("isNas") !== null) return "NAS is not used for this spirit.";
  return null;
}

/** A label's Age cell. It is the form's fields for the spirit: which are used is `hiddenFields`, the form's own rule. */
export function labelAgeEditor(): CellEditor {
  const hidden = (row: SheetRow, kinds: Kinds) =>
    hiddenFields({ group: row.label.fieldGroup, kind: kinds[row.label.categoryId] ?? null, values: row.label as unknown as Record<string, unknown>, ginAged: (row.label as unknown as { isAgedGin?: boolean }).isAgedGin === true });
  return {
    column: "age",
    field: "age",
    scope: "label",
    spec: SPEC,
    applies: (row, kinds) => AGE_FIELDS.some((field) => !hidden(row, kinds).has(field)),
    typeToReplace: true,
    fieldsOf: (value) => {
      const age = parseAge(value);
      return fieldsFor("error" in age ? { kind: "none" } : age, "label");
    },
    initial: (row) => ageText(row.label) || (row.label.isNas ? "NAS" : ""),
    check: (value, row, kinds) => {
      const age = parseAge(value);
      if ("error" in age) return age.error;
      const h = hidden(row, kinds);
      return unusedBy(age, (field) => (h.has(field) ? "not used for this spirit" : null));
    },
    display: (value) => {
      if (value === "") return DASH;
      const age = parseAge(value);
      if ("error" in age || age.kind === "none") return { text: value };
      if (age.kind === "nas") return { text: "NAS" };
      return { text: age.kind === "parts" ? (describeAgeParts(age.years, age.months, age.days) ?? value) : age.text };
    },
  };
}

/** A bottle's own age: blank inherits the label's, shown in grey. */
export function bottleAgeEditor(): CellEditor {
  const reason = (field: string, row: SheetRow, kinds: Kinds) =>
    bottleFieldNotUsed(
      field,
      { group: row.label.fieldGroup, kind: kinds[row.label.categoryId] ?? "other", isAgedGin: (row.label as unknown as { isAgedGin?: boolean }).isAgedGin === true, tequilaClass: row.label.tequilaClass ?? null },
      { tequilaClass: row.bottle?.tequilaClass ?? null },
    );
  return {
    column: "ownAge",
    field: "ownAge",
    scope: "bottle",
    spec: SPEC,
    applies: (row, kinds) => row.bottle !== null && AGE_FIELDS.some((field) => reason(field, row, kinds) === null),
    typeToReplace: true,
    fieldsOf: (value) => {
      const age = parseAge(value);
      return fieldsFor("error" in age ? { kind: "none" } : age, "bottle");
    },
    initial: (row) => (row.bottle ? ageText(row.bottle) || (row.bottle.ginIsNas === true ? "NAS" : "") : ""),
    check: (value, row, kinds) => {
      const age = parseAge(value);
      if ("error" in age) return age.error;
      return unusedBy(age, (field) => (field === "isNas" ? reason("ginIsNas", row, kinds) : reason(field, row, kinds)));
    },
    display: (value, ctx, row) => {
      if (value === "") return { ...labelAge(row.label, ctx.kinds), muted: true };
      const age = parseAge(value);
      if ("error" in age) return { text: value };
      return { text: age.kind === "nas" ? "NAS" : age.kind === "parts" ? (describeAgeParts(age.years, age.months, age.days) ?? value) : age.kind === "statement" ? age.text : value };
    },
  };
}
