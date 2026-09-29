import type { FieldSpec } from "@/lib/admin/types";
import { EXPRESSION_SECTIONS, type FormSection } from "./fields";
import type { LabelSort } from "./filters";

/**
 * The labels table's columns.
 *
 * Every field on the label form has a column, so anything you can set on a
 * label you can also see — and, with the grid unlocked, correct — without
 * opening it. That is far too many to show at once, so only the ones that
 * answer "which label is this, and what does it cost" are on by default; the
 * rest are a click away in the column picker.
 *
 * Grouped the way the form is, so the picker reads like the form and a whole
 * section (Rum detail, say) can be switched on or off at once. A column whose
 * section does not apply to a row's category — esters on a bourbon — shows
 * nothing for that row, the same rule that hides the section on the form.
 */
export type LabelColumn = {
  id: string;
  label: string;
  /** The form fields behind this column. Empty for derived columns. */
  specs: FieldSpec[];
  sort?: LabelSort;
  numeric?: boolean;
  /** A row without its name is not identifiable, so that one never hides. */
  locked?: boolean;
};

export type LabelColumnGroup = {
  id: string;
  title: string;
  /** The form section behind the group, for the per-category rule. */
  section?: FormSection;
  columns: LabelColumn[];
};

function section(id: string): FormSection {
  const found = EXPRESSION_SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`No label form section "${id}"`);
  return found;
}

function spec(name: string): FieldSpec {
  for (const s of EXPRESSION_SECTIONS) {
    const found = s.fields.find((f) => f.name === name);
    if (found) return found;
  }
  throw new Error(`No label form field "${name}"`);
}

function field(name: string, extra: Partial<LabelColumn> = {}): LabelColumn {
  const s = spec(name);
  return { id: name, label: s.label, specs: [s], numeric: s.kind === "number", ...extra };
}

/** Every field of a section, in form order. */
const all = (id: string) => section(id).fields.map((f) => field(f.name));

export const LABEL_COLUMN_GROUPS: ReadonlyArray<LabelColumnGroup> = [
  {
    id: "identity",
    title: "Identity",
    section: section("identity"),
    columns: [
      field("brandId", { id: "brand", sort: "brand" }),
      field("name", { label: "Label", sort: "name", locked: true }),
      field("categoryId", { id: "category", sort: "category" }),
      field("slug"),
      field("description"),
    ],
  },
  {
    id: "strength",
    title: "Strength and age",
    section: section("strength"),
    columns: [
      field("proof", { sort: "proof" }),
      { id: "abv", label: "ABV", specs: [], numeric: true },
      // One column over the three fields, the way the form shows them.
      { id: "age", label: "Age", specs: [spec("ageYears"), spec("ageMonths"), spec("ageDays")], sort: "age", numeric: true },
      field("ageStatement"),
      field("isCaskStrength"),
      field("isStraight"),
      field("isNas"),
    ],
  },
  { id: "process", title: "Process", section: section("process"), columns: all("process") },
  { id: "rum", title: "Rum detail", section: section("rum"), columns: all("rum") },
  { id: "agave", title: "Agave detail", section: section("agave"), columns: all("agave") },
  {
    id: "commercial",
    title: "On the shelf",
    section: section("commercial"),
    columns: [field("msrp", { sort: "msrp" }), field("sizeMl"), field("upc"), field("labelNotes", { label: "Label Notes" })],
  },
  {
    id: "links",
    title: "Where it came from",
    columns: [
      { id: "distilleries", label: "Distilleries", specs: [] },
      { id: "mashbills", label: "Mashbills", specs: [] },
      { id: "finishes", label: "Finishes", specs: [] },
    ],
  },
  {
    id: "collection",
    title: "Collection",
    columns: [{ id: "bottles", label: "Bottles", specs: [], sort: "bottles", numeric: true }],
  },
];

export const LABEL_COLUMNS: ReadonlyArray<LabelColumn> = LABEL_COLUMN_GROUPS.flatMap((group) => group.columns);

export const LABEL_COLUMN_IDS: ReadonlySet<string> = new Set(LABEL_COLUMNS.map((column) => column.id));

/** What the table shows until you choose otherwise. */
export const DEFAULT_LABEL_COLUMNS: ReadonlyArray<string> = ["brand", "name", "category", "proof", "msrp", "bottles"];

/**
 * Known ids only, the locked ones always included, in table order — so two
 * choices of the same columns compare equal whatever order they were made in.
 */
export function normaliseLabelColumns(ids: Iterable<string>): string[] {
  const chosen = new Set(ids);
  return LABEL_COLUMNS.filter((column) => column.locked || chosen.has(column.id)).map((column) => column.id);
}
