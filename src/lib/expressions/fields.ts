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
    description: "Who makes it and what it is called. Two batches of the same name are two expressions.",
    fields: [
      { kind: "reference", name: "brandId", label: "Brand", resource: "brands", required: true, span: "half" },
      { kind: "reference", name: "categoryId", label: "Category", resource: "categories", required: true, span: "half" },
      { kind: "text", name: "name", label: "Expression name", required: true, placeholder: "Double Oak Spirit", span: "half" },
      {
        kind: "text",
        name: "slug",
        label: "URL slug",
        placeholder: "generated from brand and name",
        help: "Leave blank and one is made for you.",
        span: "half",
      },
      { kind: "text", name: "batch", label: "Batch", placeholder: "Batch 2 or B524", span: "half" },
      { kind: "number", name: "releaseYear", label: "Release year", min: 1700, max: 2200, step: 1, span: "half" },
      { kind: "textarea", name: "description", label: "Description" },
    ],
  },
  {
    id: "strength",
    title: "Strength and age",
    description: "ABV is derived from proof automatically. Leave the age fields blank for a no-age-statement release.",
    fields: [
      { kind: "number", name: "proof", label: "Proof", min: 0, max: 200, step: 0.01, span: "half" },
      { kind: "checkbox", name: "isCaskStrength", label: "Cask strength", span: "half" },
      { kind: "number", name: "ageYears", label: "Age — years", min: 0, max: 100, step: 0.1, span: "half" },
      { kind: "number", name: "ageMonths", label: "Age — months", min: 0, max: 1200, step: 1, span: "half" },
      {
        kind: "number",
        name: "ageDays",
        label: "Age — days",
        min: 0,
        max: 40000,
        step: 1,
        help: "For a single barrel with an exact fill-to-bottling age.",
        span: "half",
      },
      {
        kind: "text",
        name: "ageStatement",
        label: "Age statement",
        placeholder: "NAS (labeled Straight, so at least 2 years)",
        help: "The human sentence, for when the numbers do not tell the whole story.",
        span: "half",
      },
    ],
  },
  {
    id: "release",
    title: "Release",
    description: "Single barrels and private selections reveal more fields below.",
    fields: [
      { kind: "checkbox", name: "isSingleBarrel", label: "Single barrel", span: "half" },
      {
        kind: "checkbox",
        name: "isSingleBarrelPick",
        label: "Private selection",
        help: "Private selection or store pick",
        span: "half",
      },
      { kind: "text", name: "barrelNumber", label: "Barrel number", span: "half" },
      { kind: "number", name: "bottleCount", label: "Bottles in the release", min: 1, step: 1, span: "half" },
    ],
  },
  {
    id: "pick",
    title: "Single barrel detail",
    description: "Fill and bottling dates give you the exact age without having to work it out.",
    showWhenAny: ["isSingleBarrel", "isSingleBarrelPick"],
    fields: [
      { kind: "text", name: "pickName", label: "Pick name", placeholder: "Barrel #24 — Bourbon Society", span: "half" },
      {
        kind: "text",
        name: "pickedBy",
        label: "Picked by",
        placeholder: "The club, bar or society that chose it",
        span: "half",
      },
      { kind: "date", name: "barrelFilledOn", label: "Barrel filled", span: "half" },
      { kind: "date", name: "bottledOn", label: "Bottled", span: "half" },
      { kind: "text", name: "warehouse", label: "Warehouse", placeholder: "Warehouse H", span: "half" },
      { kind: "text", name: "rickFloor", label: "Rick / floor", placeholder: "5th floor, rick 12", span: "half" },
    ],
  },
  {
    id: "process",
    title: "Process",
    fieldGroups: ["whiskey"],
    fields: [
      { kind: "checkbox", name: "isBottledInBond", label: "Bottled in bond", span: "half" },
      { kind: "number", name: "entryProof", label: "Entry proof", min: 0, max: 200, step: 0.01, span: "half" },
      { kind: "select", name: "isChillFiltered", label: "Chill filtered", options: TRISTATE, span: "half" },
      { kind: "select", name: "colorAdded", label: "Colour added", options: TRISTATE, span: "half" },
      { kind: "text", name: "charLevel", label: "Char level", placeholder: "#4 alligator char", span: "half" },
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
        label: "Still type",
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
      { kind: "number", name: "sugarGPerL", label: "Added sugar (g/L)", min: 0, step: 0.01, span: "half" },
      { kind: "number", name: "tropicalYears", label: "Tropical years", min: 0, max: 100, step: 0.1, span: "half" },
      { kind: "number", name: "continentalYears", label: "Continental years", min: 0, max: 100, step: 0.1, span: "half" },
      { kind: "select", name: "isSolera", label: "Solera", options: TRISTATE, span: "half" },
      { kind: "text", name: "soleraRange", label: "Solera range", placeholder: "1990–2015", span: "half" },
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
        label: "Cooking method",
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
      { kind: "select", name: "isAdditiveFree", label: "Additive free", options: TRISTATE, span: "half" },
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
        label: "UPC / barcode",
        placeholder: "Scan it, or type it",
        help: "A handheld scanner types straight into this field.",
        span: "half",
      },
      { kind: "textarea", name: "labelNotes", label: "Label notes" },
    ],
  },
];

/** Field groups that have a section of their own. */
export const GROUPS_WITH_SECTIONS = new Set<FieldGroup>(
  EXPRESSION_SECTIONS.flatMap((section) => section.fieldGroups ?? []),
);

export function sectionVisible(
  section: FormSection,
  fieldGroup: FieldGroup,
  values: Record<string, string | boolean>,
): boolean {
  if (section.fieldGroups && !section.fieldGroups.includes(fieldGroup)) return false;
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
