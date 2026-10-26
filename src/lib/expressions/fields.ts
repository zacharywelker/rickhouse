import { CHAR_LEVELS, CHAR_LEVEL_LABELS, FIELD_GROUPS, STILL_TYPES, type FieldGroup } from "@/db/schema";
import type { FieldSpec } from "@/lib/admin/types";
import { AGING_FIELDS, STRENGTH_FLAGS } from "./rules";
import { AMARO_STYLES, BRANDY_GRADES, DAIRY_STATUSES, PEAT_STATUSES, TEQUILA_CLASSES, TEQUILA_CLASS_GUIDANCE, TEQUILA_CLASS_LABELS } from "./spirit-details";
import { GIN_STYLES } from "./gin-details";
import { SIZE_PRESETS } from "./sizes";

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
  /**
   * Drawn as lines of fields sitting side by side, at the `width` each asks for, instead of two columns. Names
   * only: a field left out is drawn elsewhere (or not at all) but still belongs to the form. `@dates` is the
   * offer to work the age out from the two dates, and `@tier` the Navy Strength / Overproof badge.
   */
  rows?: ReadonlyArray<ReadonlyArray<string>>;
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
    rows: [
      ["brandId", "name", "categoryId", "slug"],
      ["msrp", "sizeMl", "upc"],
      ["description"],
    ],
    fields: [
      { kind: "reference", name: "brandId", label: "Brand", resource: "brands", required: true, width: "lg" },
      { kind: "text", name: "name", label: "Label Name", required: true, placeholder: "Double Oak Spirit", width: "lg" },
      { kind: "reference", name: "categoryId", label: "Category", resource: "categories", required: true, width: "md" },
      // Made from the name, so it is not asked for; the form carries a saved one through.
      { kind: "text", name: "slug", label: "URL Slug", placeholder: "generated from brand and name", span: "half" },
      { kind: "number", name: "msrp", label: "MSRP", money: true, min: 0, step: 0.01, width: "sm" },
      { kind: "number", name: "sizeMl", label: "Size", min: 1, max: 20000, step: 1, defaultValue: "750", presets: SIZE_PRESETS, help: "A bottle can be a different size from this.", width: "md" },
      {
        kind: "text",
        name: "upc",
        label: "UPC / Barcode",
        placeholder: "Scan it, or type it",
        help: "A handheld scanner types straight into this field.",
        width: "md",
      },
      {
        kind: "textarea",
        name: "description",
        label: "Description",
        help: "Anything worth knowing, including what the bottle label says as printed: \"Distilled in Indiana\", \"Bottled by …\". Bottlers and places live here, not in their own fields.",
      },
    ],
  },
  {
    id: "strength",
    title: "Strength and age",
    description:
      "As the product is normally sold; a bottle can override both. Proof and ABV calculate each other — enter " +
      "either one. Straight and Bottled In Bond fill in the age, and an age filled in greys out the age statement.",
    rows: [
      ["proof", "isCaskStrength", "isBottledInBond", "isStillProof", "@tier"],
      ["barrelFilledOn", "bottledOn", "@dates"],
      ["tequilaClass", "brandyGrade", "isAgedGin", "isAged", "ageYears", "ageStatement", "isNas", "isStraight"],
      ["tropicalYears", "continentalYears", "isSolera", "soleraRange"],
    ],
    fields: [
      // Proof renders as two linked cells (Proof, ABV). Bottled In Bond is drawn after Cask Strength, from the Process section.
      { kind: "number", name: "proof", label: "Proof", min: 0, max: 200, step: 0.01, width: "xs" },
      { kind: "checkbox", name: "isCaskStrength", label: "Cask Strength", width: "auto" },
      { kind: "checkbox", name: "isStillProof", label: "Still Proof", help: "Still Proof — bottled undiluted from the still", width: "auto" },
      { kind: "checkbox", name: "isAgedGin", label: "Aged", width: "auto" },
      { kind: "checkbox", name: "isAged", label: "Aged", width: "auto" },
      // The two dates sit above the age, and offer to work it out (see `DeriveAge`).
      { kind: "date", name: "barrelFilledOn", label: "Distilled / Barrel Filled", width: "md" },
      { kind: "date", name: "bottledOn", label: "Bottled", width: "md" },
      { kind: "number", name: "ageYears", label: "Age — Years", min: 0, max: 100, step: 0.1, width: "xxs" },
      {
        kind: "select", name: "tequilaClass", label: "Tequila Class", width: "md",
        options: [{ value: "", label: "Choose class" }, ...TEQUILA_CLASSES.map((value) => ({
          value, label: `${TEQUILA_CLASS_LABELS[value]}${TEQUILA_CLASS_GUIDANCE[value] ? ` · ${TEQUILA_CLASS_GUIDANCE[value]}` : ""}`,
        }))],
      },
      {
        kind: "select", name: "brandyGrade", label: "Age Designation", width: "md",
        options: [{ value: "", label: "Not stated" }, ...BRANDY_GRADES.map((value) => ({ value, label: value }))],
      },
      { kind: "number", name: "ageMonths", label: "Age — Months", min: 0, max: 1200, step: 1, width: "xxs" },
      {
        kind: "number",
        name: "ageDays",
        label: "Age — Days",
        min: 0,
        max: 40000,
        step: 1,
        help: "For a single barrel with an exact fill-to-bottling age.",
        width: "xxs",
      },
      {
        kind: "text",
        name: "ageStatement",
        label: "Age Statement",
        placeholder: "e.g. 7 Year",
        help: "The human sentence, for when the numbers do not tell the whole story.",
        width: "md",
      },
      {
        kind: "checkbox",
        name: "isNas",
        label: "NAS",
        help: "NAS — no age statement on the bottle",
        width: "auto",
      },
      {
        kind: "checkbox",
        name: "isStraight",
        label: "Straight",
        help: "Straight — at least 2 years old",
        width: "auto",
      },
    ],
  },
  {
    id: "process",
    title: "Process",
    fieldGroups: ["whiskey"],
    fields: [
      // Drawn in Strength and age, beside Cask Strength; it lives here so only whiskey writes it.
      { kind: "checkbox", name: "isBottledInBond", label: "Bottled In Bond", help: "Bottled In Bond — 100 proof", span: "half" },
      {
        kind: "text",
        name: "regions",
        label: "Regions",
        placeholder: "Speyside, Islay",
        help: "Scotch regions, comma separated. Drawn with the distilleries.",
      },
      { kind: "number", name: "entryProof", label: "Entry Proof", min: 0, max: 200, step: 0.01, span: "half" },
      { kind: "checkbox", name: "isNonChillFiltered", label: "Non-chill filtered", span: "half", help: "Checked records a positive claim; unchecked means unknown." },
      { kind: "select", name: "isChillFiltered", label: "Chill Filtered", options: TRISTATE, span: "half" },
      { kind: "checkbox", name: "isAdditiveFree", label: "Additive Free", span: "half", help: "Checked records a positive claim; unchecked means unknown." },
      { kind: "select", name: "peatStatus", label: "Peat", options: PEAT_STATUSES.map((value) => ({ value, label: titleCase(value) })), span: "half" },
      { kind: "select", name: "colorAdded", label: "Colour Added", options: TRISTATE, span: "half" },
      {
        kind: "slider",
        name: "charLevel",
        label: "Char Level",
        look: "stave",
        options: [{ value: "", label: "Unknown" }, ...CHAR_LEVELS.map((v) => ({ value: v, label: CHAR_LEVEL_LABELS[v] }))],
      },
      { kind: "reference", name: "cooperageId", label: "Cooperage", resource: "cooperages", help: "Who made the casks, when known." },
    ],
  },
  {
    id: "rum",
    title: "Rum detail",
    fieldGroups: ["rum"],
    rows: [
      ["stillType", "marque"],
      ["esterGl", "sugarGPerL"],
    ],
    fields: [
      {
        kind: "select",
        name: "stillType",
        label: "Still Type",
        options: [{ value: "", label: "Unknown" }, ...STILL_TYPES.map((t) => ({ value: t, label: titleCase(t) }))],
        width: "md",
      },
      { kind: "text", name: "marque", label: "Marque", placeholder: "LROK, DOK", width: "md" },
      { kind: "number", name: "esterGl", label: "Esters (g/hLAA)", min: 0, step: 0.01, width: "sm" },
      { kind: "number", name: "sugarGPerL", label: "Added Sugar (g/L)", min: 0, step: 0.01, width: "sm" },
      // These four are drawn in Strength and age, beside the age they describe.
      { kind: "number", name: "tropicalYears", label: "Tropical Years", min: 0, max: 100, step: 0.1, width: "xs" },
      { kind: "number", name: "continentalYears", label: "Continental Years", min: 0, max: 100, step: 0.1, width: "xs" },
      { kind: "select", name: "isSolera", label: "Solera", options: TRISTATE, width: "sm" },
      { kind: "text", name: "soleraRange", label: "Solera Range", placeholder: "1990–2015", width: "sm" },
    ],
  },
  {
    id: "gin",
    title: "Gin detail",
    fieldGroups: ["gin"],
    fields: [
      { kind: "select", name: "ginStyle", label: "Style", options: [
        { value: "", label: "Not specified" },
        ...GIN_STYLES.map((value) => ({ value, label: value })),
      ], span: "half" },
    ],
  },
  {
    id: "agave",
    title: "Agave detail",
    fieldGroups: ["agave"],
    fields: [
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
    id: "amaro",
    title: "Amaro detail",
    fieldGroups: ["amaro"],
    fields: [
      { kind: "select", name: "amaroStyle", label: "Style", options: [{ value: "", label: "Not specified" }, ...AMARO_STYLES.map((value) => ({ value, label: value }))], span: "half" },
      { kind: "text", name: "originCountry", label: "Country", span: "half" },
      { kind: "text", name: "originRegion", label: "Region", span: "half" },
    ],
  },
  {
    id: "liqueur",
    title: "Liqueur detail",
    fieldGroups: ["liqueur"],
    fields: [
      { kind: "text", name: "originCountry", label: "Country", span: "half" },
      { kind: "text", name: "originRegion", label: "Region", span: "half" },
      { kind: "select", name: "dairyStatus", label: "Dairy", options: DAIRY_STATUSES.map((value) => ({ value, label: value === "unknown" ? "Unknown" : value === "dairy" ? "Dairy" : "Non-dairy" })), span: "half" },
    ],
  },
];

/** Field groups that have a section of their own. */
export const GROUPS_WITH_SECTIONS = new Set<FieldGroup>(
  EXPRESSION_SECTIONS.flatMap((section) => section.fieldGroups ?? []),
);

/**
 * Shared by the label form, the bottle form and the bulk grids (where it
 * decides which cells of a row apply). `fieldGroup` is null on the bottle,
 * which has no per-spirit sections — only the checkbox-revealed ones.
 */
export function sectionVisible(
  section: Pick<FormSection, "fieldGroups" | "showWhenAny">,
  fieldGroup: FieldGroup | null,
  values: Record<string, unknown>,
): boolean {
  if (section.fieldGroups && (fieldGroup === null || !section.fieldGroups.includes(fieldGroup))) return false;
  if (section.showWhenAny && !section.showWhenAny.some((name) => values[name] === true)) return false;
  return true;
}

/** Same rule as `sectionVisible`, for a single field within a visible section. */
export function fieldVisible(field: FieldSpec, values: Record<string, unknown>): boolean {
  if (field.showWhenAny && !field.showWhenAny.some((name) => values[name] === true)) return false;
  return true;
}

/** Field names a given field group is allowed to write. Vodka never ages, so aging is not one of them. */
export function writableFields(fieldGroup: FieldGroup): Set<string> {
  const names = new Set<string>();
  for (const section of EXPRESSION_SECTIONS) {
    if (section.fieldGroups && !section.fieldGroups.includes(fieldGroup)) continue;
    for (const field of section.fields) names.add(field.name);
  }
  if (fieldGroup === "vodka") for (const name of AGING_FIELDS) names.delete(name);
  for (const [name, flag] of Object.entries(STRENGTH_FLAGS)) if (!flag.groups.includes(fieldGroup)) names.delete(name);
  return names;
}

export const ALL_FIELD_GROUPS = FIELD_GROUPS;
