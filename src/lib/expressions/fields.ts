import { FIELD_GROUPS, STILL_TYPES, type FieldGroup } from "@/db/schema";
import type { FieldSpec } from "@/lib/admin/types";

/**
 * The expression form, described as data.
 *
 * Sections are shown or hidden by the chosen category's `field_group`, so a
 * Bourbon shows the process fields and a Rum shows ester and still type.
 * Hiding never clears: the server writes only the sections that were visible,
 * which means switching a category back and forth does not silently destroy
 * what was already recorded (SPEC M3).
 */
export type FormSection = {
  id: string;
  title: string;
  description?: string;
  fields: FieldSpec[];
  /** Shown only for these category field groups. Absent means always. */
  fieldGroups?: ReadonlyArray<FieldGroup>;
  /** Shown only when at least one of these boolean fields is on. */
  showWhenAny?: ReadonlyArray<string>;
};

/** Nullable booleans in the database: "unknown" is a real, distinct answer. */
const TRISTATE = [
  { value: "", label: "Unknown" },
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
] as const;

const titleCase = (value: string) => value[0]!.toUpperCase() + value.slice(1);

export const EXPRESSION_SECTIONS: ReadonlyArray<FormSection> = [
  {
    id: "identity",
    title: "Identity",
    description:
      "Who makes it and what it is called. Batch and single-barrel detail belong to the bottle, not here — " +
      "two batches of one product are two bottles of one label.",
    fields: [
      { kind: "reference", name: "brandId", label: "Brand", resource: "brands", required: true, span: "half" },
      { kind: "reference", name: "categoryId", label: "Category", resource: "categories", required: true, span: "half" },
      { kind: "text", name: "name", label: "Label Name", required: true, placeholder: "Double Oak Spirit", span: "half" },
      {
        kind: "text",
        name: "slug",
        label: "URL Slug",
        placeholder: "generated from brand and name",
        help: "Leave blank and one is made for you.",
        span: "half",
      },
      { kind: "textarea", name: "description", label: "Description" },
    ],
  },
  {
    id: "strength",
    title: "Strength and age",
    description:
      "As the product is normally sold; a bottle can override both. Proof and ABV calculate each other — enter " +
      "either one. Straight, Bottled In Bond and NAS fill in the age statement below when it is blank.",
    fields: [
      // Proof renders as two linked cells (Proof, ABV), so this row is
      // already a full pair — the age triplet below is a full-span row of
      // its own, and everything after it pairs up cleanly again.
      { kind: "number", name: "proof", label: "Proof", min: 0, max: 200, step: 0.01, span: "half" },
      { kind: "number", name: "ageYears", label: "Age — Years", min: 0, max: 100, step: 0.1, span: "half" },
      { kind: "number", name: "ageMonths", label: "Age — Months", min: 0, max: 1200, step: 1, span: "half" },
      {
        kind: "number",
        name: "ageDays",
        label: "Age — Days",
        min: 0,
        max: 40000,
        step: 1,
        help: "For a single barrel with an exact fill-to-bottling age.",
        span: "half",
      },
      { kind: "checkbox", name: "isCaskStrength", label: "Cask Strength", span: "half" },
      {
        kind: "text",
        name: "ageStatement",
        label: "Age Statement",
        placeholder: "e.g. 7 Year",
        help: "The human sentence, for when the numbers do not tell the whole story.",
        span: "half",
      },
      {
        kind: "checkbox",
        name: "isStraight",
        label: "Straight",
        help: "Straight — at least 2 years old",
        span: "half",
      },
      {
        kind: "checkbox",
        name: "isNas",
        label: "NAS",
        help: "NAS — no age statement on the bottle",
        span: "half",
      },
    ],
  },
  {
    id: "process",
    title: "Process",
    fieldGroups: ["whiskey"],
    fields: [
      { kind: "checkbox", name: "isBottledInBond", label: "Bottled In Bond", span: "half" },
      { kind: "number", name: "entryProof", label: "Entry Proof", min: 0, max: 200, step: 0.01, span: "half" },
      { kind: "select", name: "isChillFiltered", label: "Chill Filtered", options: TRISTATE, span: "half" },
      { kind: "select", name: "colorAdded", label: "Colour Added", options: TRISTATE, span: "half" },
      { kind: "text", name: "charLevel", label: "Char Level", placeholder: "#4 alligator char", span: "half" },
    ],
  },
  {
    id: "rum",
    title: "Rum detail",
    fieldGroups: ["rum"],
    fields: [
      {
        kind: "select",
        name: "stillType",
        label: "Still Type",
        options: [{ value: "", label: "Unknown" }, ...STILL_TYPES.map((t) => ({ value: t, label: titleCase(t) }))],
        span: "half",
      },
      { kind: "text", name: "estate", label: "Estate", placeholder: "Hampden, Foursquare, Worthy Park", span: "half" },
      { kind: "text", name: "marque", label: "Marque", placeholder: "LROK, DOK", span: "half" },
      {
        kind: "select",
        name: "molassesOrCane",
        label: "Base",
        options: [
          { value: "", label: "Unknown" },
          { value: "molasses", label: "Molasses" },
          { value: "cane juice", label: "Cane juice" },
          { value: "honey", label: "Honey" },
        ],
        span: "half",
      },
      { kind: "number", name: "esterGl", label: "Esters (g/hLAA)", min: 0, step: 0.01, span: "half" },
      { kind: "number", name: "sugarGPerL", label: "Added Sugar (g/L)", min: 0, step: 0.01, span: "half" },
      { kind: "number", name: "tropicalYears", label: "Tropical Years", min: 0, max: 100, step: 0.1, span: "half" },
      { kind: "number", name: "continentalYears", label: "Continental Years", min: 0, max: 100, step: 0.1, span: "half" },
      { kind: "select", name: "isSolera", label: "Solera", options: TRISTATE, span: "half" },
      { kind: "text", name: "soleraRange", label: "Solera Range", placeholder: "1990–2015", span: "half" },
    ],
  },
  {
    id: "agave",
    title: "Agave detail",
    fieldGroups: ["agave"],
    fields: [
      { kind: "text", name: "agaveType", label: "Agave", placeholder: "Blue Weber, Espadín", span: "half" },
      { kind: "text", name: "agaveRegion", label: "Region", placeholder: "Los Altos, Oaxaca", span: "half" },
      {
        kind: "select",
        name: "cookingMethod",
        label: "Cooking Method",
        options: [
          { value: "", label: "Unknown" },
          { value: "brick oven", label: "Brick oven" },
          { value: "autoclave", label: "Autoclave" },
          { value: "pit", label: "Pit" },
        ],
        span: "half",
      },
      {
        kind: "select",
        name: "extraction",
        label: "Extraction",
        options: [
          { value: "", label: "Unknown" },
          { value: "tahona", label: "Tahona" },
          { value: "roller mill", label: "Roller mill" },
        ],
        span: "half",
      },
      { kind: "select", name: "isAdditiveFree", label: "Additive Free", options: TRISTATE, span: "half" },
    ],
  },
  {
    id: "commercial",
    title: "On the shelf",
    fields: [
      { kind: "number", name: "msrp", label: "MSRP", min: 0, step: 0.01, span: "half" },
      { kind: "number", name: "sizeMl", label: "Size (ml)", min: 1, max: 20000, step: 1, defaultValue: "750", span: "half" },
      {
        kind: "text",
        name: "upc",
        label: "UPC / Barcode",
        placeholder: "Scan it, or type it",
        help: "A handheld scanner types straight into this field.",
        span: "half",
      },
      { kind: "textarea", name: "labelNotes", label: "Notes On The Bottle Label" },
    ],
  },
];

/** Field groups that have a section of their own. */
export const GROUPS_WITH_SECTIONS = new Set<FieldGroup>(
  EXPRESSION_SECTIONS.flatMap((section) => section.fieldGroups ?? []),
);

/**
 * Shared by the label form and the bottle form. `fieldGroup` is null on the
 * bottle, which has no per-spirit sections — only the checkbox-revealed ones.
 */
export function sectionVisible(
  section: FormSection,
  fieldGroup: FieldGroup | null,
  values: Record<string, string | boolean>,
): boolean {
  if (section.fieldGroups && (fieldGroup === null || !section.fieldGroups.includes(fieldGroup))) return false;
  if (section.showWhenAny && !section.showWhenAny.some((name) => values[name] === true)) return false;
  return true;
}

/** Field names a given field group is allowed to write. */
export function writableFields(fieldGroup: FieldGroup): Set<string> {
  const names = new Set<string>();
  for (const section of EXPRESSION_SECTIONS) {
    if (section.fieldGroups && !section.fieldGroups.includes(fieldGroup)) continue;
    for (const field of section.fields) names.add(field.name);
  }
  return names;
}

export const ALL_FIELD_GROUPS = FIELD_GROUPS;
