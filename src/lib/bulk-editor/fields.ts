import type { FieldSpec } from "@/lib/admin/types";
import { BOTTLE_SECTIONS, BOTTLE_STATE_SECTION } from "@/lib/expressions/bottle-fields";
import { bottleFieldNotUsed } from "@/lib/expressions/bottle-applicability";
import { LABEL_COLUMN_GROUPS } from "@/lib/expressions/columns";
import { EXPRESSION_SECTIONS, fieldVisible, sectionVisible, type FormSection } from "@/lib/expressions/fields";
import { writableLabelFacts } from "@/lib/expressions/writable-facts";
import { initialFieldValues } from "@/lib/forms/values";
import { formatDate } from "@/lib/utils";
import type { CellEditor } from "./editors";
import { encodeRef, decodeRef, type RefKind } from "./references";
import type { Cell, SheetColumn, SheetContext, SheetRow } from "./sheet";

/**
 * The sheet's columns and editors for the form fields that are not worth a hand-written column each. They are made from
 * the forms' own field definitions (`EXPRESSION_SECTIONS`, `LABEL_COLUMN_GROUPS`, `BOTTLE_SECTIONS`), so a field on a form
 * has a cell here, takes the values the form takes, and applies to the spirits the form says it does.
 *
 * Only the simple kinds are here (text, textarea, number, date, select, slider, checkbox). The rest have their own steps:
 * pickers over other things (store, release, cooperage), a bottle's status and level, age, and the linked lists.
 * `NOT_HERE` says which, and `parity.test.ts` holds that list to what is true.
 */

export type Generated = { column: SheetColumn; editor: CellEditor };

const DASH: Cell = { text: "—", muted: true };

/** Where a form field's editor is made elsewhere, or not at all, and why. Nothing else may be missing from the sheet. */
export const NOT_HERE: Readonly<Record<string, string>> = {
  // Handled by cells made by hand.
  brandId: "Brand cell (autocomplete)",
  name: "Label cell",
  categoryId: "Category cell (a new label's; a saved label's is parity step 6, #340)",
  expressionId: "Moving a bottle: the Brand and Label cells",
  // Later steps.
  ageYears: "#338",
  ageMonths: "#338",
  ageDays: "#338",
  ageStatement: "#338",
  regions: "#340",
  // Deliberately not in the sheet.
  slug: "A system field, made from the name",
};

export type Kinds = Readonly<Record<number, import("@/lib/expressions/rules").CategoryKind>>;

type Simple = Exclude<FieldSpec, { kind: "reference" }>;
const isSimple = (spec: FieldSpec): spec is Simple => spec.kind !== "reference";

// ---------------------------------------------------------------------------
// Values and how they are shown
// ---------------------------------------------------------------------------

/** The text an editor holds for a field: "true" or "false" for a checkbox, the option's value for a choice, else the value. */
export function textOf(spec: FieldSpec, source: unknown): string {
  const value = initialFieldValues([spec], (source ?? null) as Record<string, string | number | boolean | null> | null)[spec.name];
  return typeof value === "boolean" ? String(value) : (value ?? "");
}

/** A value as a cell shows it. A blank checkbox, an empty choice and a missing value are all a dash. */
export function cellFromText(spec: FieldSpec, value: string): Cell {
  if (value === "") return DASH;
  switch (spec.kind) {
    case "checkbox":
      return value === "true" ? { text: "Yes" } : DASH;
    case "select":
    case "slider":
      return { text: spec.options.find((o) => o.value === value)?.label ?? value };
    case "date":
      return { text: formatDate(value) };
    default:
      return { text: value };
  }
}

/** A choice that is shown as a list: a slider's stops are the same values, so the sheet treats it as one. */
const asChoice = (spec: Simple): Simple => (spec.kind === "slider" ? { ...spec, kind: "select" } : spec);

/** A nullable yes/no is a choice whose options are only "", "true" and "false". It goes to the server as a boolean. */
export const isYesNoChoice = (spec: FieldSpec): boolean => spec.kind === "select" && spec.options.length > 0 && spec.options.every((o) => ["", "true", "false"].includes(o.value));

// ---------------------------------------------------------------------------
// Applicability
// ---------------------------------------------------------------------------

/** A label's fact, for a spirit of this kind: the form's section rule, the strength flags, and the few kind-only fields. */
function labelFactApplies(spec: FieldSpec, section: FormSection | undefined, row: SheetRow, kinds: Kinds): boolean {
  const { label } = row;
  const kind = kinds[label.categoryId] ?? "other";
  if (!writableLabelFacts(label.fieldGroup, kind).has(spec.name)) return false;
  const values = label as unknown as Record<string, unknown>;
  if (section && !sectionVisible(section, label.fieldGroup, values)) return false;
  return fieldVisible(spec, values);
}

const labelFacts = (row: SheetRow, kinds: Kinds) => ({
  group: row.label.fieldGroup,
  kind: kinds[row.label.categoryId] ?? ("other" as const),
  isAgedGin: (row.label as unknown as { isAgedGin?: boolean }).isAgedGin === true,
  tequilaClass: row.label.tequilaClass ?? null,
});

/** Why a bottle's field is not used for this row, or null. The form's section rule first, then the spirit's. */
function bottleFieldReason(spec: FieldSpec, section: FormSection | undefined, row: SheetRow, kinds: Kinds): string | null {
  if (!row.bottle) return "Not used here";
  const values = row.bottle as unknown as Record<string, unknown>;
  if (section && !sectionVisible(section, null, values)) return "Only for a single barrel or a private pick";
  if (!fieldVisible(spec, values)) return "Only for a private pick";
  return bottleFieldNotUsed(spec.name, labelFacts(row, kinds), { tequilaClass: row.bottle.tequilaClass });
}

// ---------------------------------------------------------------------------
// The editors
// ---------------------------------------------------------------------------

function editorFrom(spec: Simple, id: string, scope: "label" | "bottle", read: (row: SheetRow) => unknown, applies: (row: SheetRow, kinds: Kinds) => boolean): CellEditor {
  const chosen = asChoice(spec);
  const required = chosen.kind === "select" && !chosen.options.some((o) => o.value === "");
  return {
    column: id,
    field: spec.name,
    scope,
    spec: chosen,
    ...(required ? { required: true } : {}),
    // When it was opened or killed has already happened.
    ...(spec.kind === "date" && (spec.name === "dateOpened" || spec.name === "dateKilled") ? { pastOnly: true } : {}),
    applies,
    typeToReplace: chosen.kind === "text" || chosen.kind === "number" || chosen.kind === "textarea",
    initial: (row) => textOf(chosen, read(row)),
    display: (value) => cellFromText(chosen, value),
  };
}

function columnFrom(spec: Simple, id: string, label: string, group: "label" | "bottle", section: string, editor: CellEditor, reason: (row: SheetRow, kinds: Kinds) => string | null): SheetColumn {
  return {
    id,
    label,
    group,
    defaultHidden: true,
    section,
    ...(spec.kind === "number" ? { align: "right" as const } : {}),
    cell: (row: SheetRow, ctx: SheetContext) => {
      const why = reason(row, ctx.kinds);
      return why === null ? cellFromText(editor.spec, editor.initial(row)) : { ...DASH, note: why };
    },
  };
}

// --- the pickers: store, release, label name, cooperage ---

const REFERENCE_KIND: Readonly<Record<string, RefKind>> = { storeId: "store", releaseId: "release", expressionNameId: "version", cooperageId: "cooperage" };

/** A cell that picks from a list. It keeps `id:12` or `new:Name` while edited (see `references.ts`), and shows the name. */
function referenceEditor(spec: FieldSpec, id: string, kind: RefKind, scope: "label" | "bottle", read: (row: SheetRow) => number | null | undefined, applies: (row: SheetRow, kinds: Kinds) => boolean): CellEditor {
  return {
    column: id,
    field: spec.name,
    scope,
    spec,
    reference: kind,
    applies,
    typeToReplace: true,
    initial: (row) => encodeRef(read(row)),
    display: (value, ctx) => {
      const ref = decodeRef(value);
      if (ref === null) return DASH;
      if ("name" in ref) return { text: ref.name, badge: "new" };
      return { text: ctx.refs?.[kind][ref.id] ?? "—" };
    },
  };
}

function bottleSpecAndSection(name: string): { spec: FieldSpec; section: FormSection } {
  for (const section of BOTTLE_SECTIONS) {
    const spec = section.fields.find((f) => f.name === name);
    if (spec) return { spec, section };
  }
  throw new Error(`The bottle form has no field "${name}".`);
}

const releasedTo = (row: SheetRow) => row.bottle !== null && !row.moved;

/** The bottle's Store cell: one of the account's stores, or a new one. The column itself is made by hand (it is on the shelf-order). */
export function storeEditor(): CellEditor {
  const { spec, section } = bottleSpecAndSection("storeId");
  return referenceEditor(spec, "store", "store", "bottle", (row) => row.bottle?.storeId, (row, kinds) => bottleFieldReason(spec, section, row, kinds) === null);
}

function referenceColumn(spec: FieldSpec, id: string, label: string, group: "label" | "bottle", sectionTitle: string, editor: CellEditor, reason: (row: SheetRow, kinds: Kinds) => string | null): SheetColumn {
  return {
    id,
    label,
    group,
    defaultHidden: true,
    section: sectionTitle,
    cell: (row: SheetRow, ctx: SheetContext) => {
      const why = reason(row, ctx.kinds);
      return why === null ? editor.display(editor.initial(row), ctx, row) : { ...DASH, note: why };
    },
  };
}

// --- the label's ---

/** Columns that are made by hand elsewhere, or are not a single simple field. */
const HAND_MADE_LABEL = new Set(["brand", "name", "category", "proof", "sizeMl", "msrp", "age", "abv", "strength", "distilleries", "mashbills", "ingredients", "finishes", "bottles"]);
/** The two flags the Cask / Bonded cell sets together. */
const IN_DESIGNATION = new Set(["isCaskStrength", "isBottledInBond"]);

function generatedLabelColumns(): Generated[] {
  const out: Generated[] = [];
  for (const group of LABEL_COLUMN_GROUPS) {
    for (const col of group.columns) {
      const spec = col.specs[0];
      if (col.specs.length !== 1 || !spec || HAND_MADE_LABEL.has(col.id) || spec.name in NOT_HERE || IN_DESIGNATION.has(spec.name)) continue;
      if (spec.kind === "reference") {
        const kind = REFERENCE_KIND[spec.name];
        if (!kind) continue;
        const applies = (row: SheetRow, kinds: Kinds) => labelFactApplies(spec, group.section, row, kinds);
        const editor = referenceEditor(spec, col.id, kind, "label", (row) => row.label.cooperageId, applies);
        out.push({ column: referenceColumn(spec, col.id, col.label, "label", group.title, editor, (row, kinds) => (applies(row, kinds) ? null : "Not used for this spirit")), editor });
        continue;
      }
      if (!isSimple(spec)) continue;
      const applies = (row: SheetRow, kinds: Kinds) => labelFactApplies(spec, group.section, row, kinds);
      const editor = editorFrom(spec, col.id, "label", (row) => row.label, applies);
      out.push({ column: columnFrom(spec, col.id, col.label, "label", group.title, editor, (row, kinds) => (applies(row, kinds) ? null : "Not used for this spirit")), editor });
    }
  }
  // The description is on the form but not a column of the labels table.
  const description = EXPRESSION_SECTIONS.flatMap((s) => s.fields).find((f) => f.name === "description");
  if (description && isSimple(description)) {
    const section = EXPRESSION_SECTIONS.find((s) => s.fields.includes(description));
    const applies = (row: SheetRow, kinds: Kinds) => labelFactApplies(description, section, row, kinds);
    const editor = editorFrom(description, "description", "label", (row) => row.label, applies);
    out.push({ column: columnFrom(description, "description", "Description", "label", "Identity", editor, (row, kinds) => (applies(row, kinds) ? null : "Not used for this spirit")), editor });
  }
  return out;
}

// --- the bottle's ---

/** Bottle fields made by hand elsewhere, or covered by a composite cell. */
const HAND_MADE_BOTTLE = new Set(["status", "storeId", "pricePaid", "dateAcquired", "releaseYear", "location", "notes", "sizeMl", "proof", "pickName", "isSingleBarrel", "isSingleBarrelPick"]);
/** A bottle's field of the same name as a label's (its own value, overriding the label's) gets its own column id. */
const BOTTLE_ID: Readonly<Record<string, string>> = {
  bottleCount: "releaseBottleCount",
  barrelFilledOn: "ownBarrelFilledOn",
  bottledOn: "ownBottledOn",
  tequilaClass: "ownTequilaClass",
  brandyGrade: "ownBrandyGrade",
};
const BOTTLE_HEADER: Readonly<Record<string, string>> = {
  barrelFilledOn: "This bottle's distilled / barrel filled",
  bottledOn: "This bottle's bottled date",
  tequilaClass: "This bottle's tequila class",
  brandyGrade: "This bottle's age designation",
};

function generatedBottleColumns(): Generated[] {
  const out: Generated[] = [];
  for (const section of [...BOTTLE_SECTIONS, BOTTLE_STATE_SECTION]) {
    for (const spec of section.fields) {
      if (HAND_MADE_BOTTLE.has(spec.name) || spec.name in NOT_HERE) continue;
      const id = BOTTLE_ID[spec.name] ?? spec.name;
      const reason = (row: SheetRow, kinds: Kinds) => bottleFieldReason(spec, section, row, kinds);
      // The release and the label name are selects on the form whose choices come from the label, so they are matched by name.
      const kind = REFERENCE_KIND[spec.name];
      if (kind) {
        // On a bottle moved to another label, neither a release nor a label name carries over: the server clears them.
        const read = spec.name === "releaseId" ? (row: SheetRow) => (row.moved ? null : row.bottle?.releaseId) : (row: SheetRow) => (row.moved ? null : row.bottle?.expressionNameId);
        const editor = referenceEditor(spec, id, kind, "bottle", read, (row, kinds) => releasedTo(row) !== false && reason(row, kinds) === null);
        out.push({ column: referenceColumn(spec, id, spec.label, "bottle", section.title, editor, reason), editor });
        continue;
      }
      if (!isSimple(spec)) continue;
      const editor = editorFrom(spec, id, "bottle", (row) => row.bottle, (row, kinds) => reason(row, kinds) === null);
      out.push({ column: columnFrom(spec, id, BOTTLE_HEADER[spec.name] ?? spec.label, "bottle", section.title, editor, reason), editor });
    }
  }
  return out;
}

// --- two cells that set two flags from one choice ---

const DESIGNATIONS = [
  { value: "", label: "—" },
  { value: "cask", label: "Cask Strength" },
  { value: "bib", label: "Bottled in Bond" },
  { value: "both", label: "Cask Strength · Bottled in Bond" },
] as const;

/** The four ways the two flags can stand: a private pick need not be a single barrel (it can be a blend of barrels), and a single barrel need not be a pick. */
const PICKS = [
  { value: "", label: "—" },
  { value: "single", label: "Single barrel" },
  { value: "pick", label: "Private pick" },
  { value: "both", label: "Single barrel · Private pick" },
] as const;

/** Cask Strength and Bottled in Bond, as one choice: how the shelf is entered. Both are the label's flags. */
export function designationEditor(): CellEditor {
  const spec: FieldSpec = { kind: "select", name: "designation", label: "Cask / BiB", options: DESIGNATIONS };
  const allowed = (row: SheetRow, kinds: Kinds) => {
    const w = writableLabelFacts(row.label.fieldGroup, kinds[row.label.categoryId] ?? "other");
    return { cask: w.has("isCaskStrength"), bib: w.has("isBottledInBond") };
  };
  return {
    column: "designation",
    field: "designation",
    scope: "label",
    spec,
    applies: (row, kinds) => allowed(row, kinds).cask || allowed(row, kinds).bib,
    typeToReplace: false,
    fieldsOf: (value) => ({ isCaskStrength: value === "cask" || value === "both", isBottledInBond: value === "bib" || value === "both" }),
    initial: (row) => {
      const { isCaskStrength: cask, isBottledInBond: bib } = row.label;
      return cask && bib ? "both" : cask ? "cask" : bib ? "bib" : "";
    },
    check: (value, row, kinds) => {
      const a = allowed(row, kinds);
      if ((value === "cask" || value === "both") && !a.cask) return "Cask Strength is not used for this spirit.";
      if ((value === "bib" || value === "both") && !a.bib) return "Bottled in Bond is not used for this spirit.";
      return null;
    },
    display: (value) => (value === "" ? DASH : { text: DESIGNATIONS.find((d) => d.value === value)?.label ?? value }),
  };
}

/** Single barrel and Private pick, as one choice. They are two separate flags of the bottle, so all four combinations are choices. */
export function singleBarrelEditor(): CellEditor {
  const spec: FieldSpec = { kind: "select", name: "singleBarrel", label: "Single barrel / pick", options: PICKS };
  return {
    column: "singleBarrel",
    field: "singleBarrel",
    scope: "bottle",
    spec,
    applies: (row, kinds) => row.bottle !== null && bottleFieldNotUsed("isSingleBarrel", labelFacts(row, kinds)) === null,
    typeToReplace: false,
    fieldsOf: (value) => ({ isSingleBarrel: value === "single" || value === "both", isSingleBarrelPick: value === "pick" || value === "both" }),
    initial: (row) => {
      const single = row.bottle?.isSingleBarrel === true;
      const pick = row.bottle?.isSingleBarrelPick === true;
      return single && pick ? "both" : pick ? "pick" : single ? "single" : "";
    },
    display: (value) => (value === "" ? DASH : { text: PICKS.find((p) => p.value === value)?.label ?? value }),
  };
}

// ---------------------------------------------------------------------------

export const GENERATED_LABEL: ReadonlyArray<Generated> = generatedLabelColumns();
export const GENERATED_BOTTLE: ReadonlyArray<Generated> = generatedBottleColumns();
export const GENERATED: ReadonlyArray<Generated> = [...GENERATED_LABEL, ...GENERATED_BOTTLE];
