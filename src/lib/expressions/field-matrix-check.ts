import type { FieldGroup } from "@/db/schema";
import { bottleFieldNotUsed } from "./bottle-applicability";
import { BOTTLE_MATRIX, LABEL_CONDITIONS, LABEL_MATRIX, MATRIX_GROUPS, type MatrixRow } from "./field-matrix";
import { writableFields } from "./fields";
import { barrelTypeKind, hiddenFields, isUnaged, type CategoryKind } from "./rules";

/**
 * The kinds that stand for each group when a cell says "always" or "never": the cell has to hold for every one of
 * them, so a rule that is right for Bourbon and wrong for Scotch shows up. The top-level category rows (Whisky, Agave,
 * Brandy…) are grouping rows of kind `other`; they carry no spirit rules and are not tried.
 */
const KINDS: Record<FieldGroup, ReadonlyArray<CategoryKind>> = {
  whiskey: ["american", "canadian", "irish", "scotch", "japanese", "international", "flavored-whisky"],
  rum: ["other", "cachaca", "agricole", "spiced-rum"],
  agave: ["tequila", "mezcal"],
  brandy: ["cognac", "armagnac", "calvados", "pisco", "apple", "eau-de-vie"],
  gin: ["gin", "genever"],
  vodka: ["vodka", "flavored-vodka"],
  amaro: ["amaro"],
  liqueur: ["liqueur", "cream-liqueur", "chocolate-liqueur"],
  other: ["other", "absinthe", "akvavit", "shochu"],
};

/** Gin, amaro and liqueur change with their Aged choice; both choices are tried. */
const AGED_STATES: Record<FieldGroup, ReadonlyArray<boolean>> = {
  whiskey: [false], rum: [false], agave: [false], brandy: [false], gin: [false, true], vodka: [false], amaro: [false, true], liqueur: [false, true], other: [false],
};

/** Bottle fields `bottleFieldNotUsed` decides (the bottle form and the bulk editor both ask it). */
const BOTTLE_FUNCTION_FIELDS = new Set([
  "barrelFilledOn", "bottledOn", "warehouse", "rickFloor", "ginIsNas", "tequilaClass", "brandyGrade", "ageStatement", "ageYears", "ageMonths",
  "ageDays", "isSingleBarrel", "isSingleBarrelPick", "pickName", "pickedBy", "barrelNumber", "bottleCount", "batch", "releaseYear", "releaseId",
  "proof", "sizeMl",
]);

export type Gap = {
  matrix: "label" | "bottle";
  row: string;
  /** "all" for a bottle rule that lives in the bottle form component, which a test cannot ask. */
  group: FieldGroup | "all";
  expected: "A" | "N";
  /** What the rules do: shown for every kind, hidden for every kind, or mixed (which kinds are named). */
  found: "shown" | "hidden" | "mixed" | "no-field" | "in-component";
  detail?: string;
};

function fieldOf(row: MatrixRow, group: FieldGroup): string | null | undefined {
  if (typeof row.field === "string" || row.field === null) return row.field;
  return row.field[group];
}

type Shown = (field: string, kind: CategoryKind, aged: boolean) => boolean;

function labelShown(group: FieldGroup): Shown {
  const writable = writableFields(group);
  // The Barrel type is the finishes picker, which is not a form field: it is there when the picker is one.
  return (field, kind, aged) =>
    field === "finishLinks" ? barrelTypeKind({ group, kind, ginAged: aged }) && !isUnaged({ group, ginAged: aged, values: { isAged: aged } }) :
    writable.has(field) &&
    !hiddenFields({ group, kind, values: group === "amaro" || group === "liqueur" || group === "rum" ? { isAged: aged } : {}, ginAged: aged }).has(field);
}

function bottleShown(group: FieldGroup): Shown {
  return (field, kind, aged) => bottleFieldNotUsed(field, { group, kind, isAgedGin: aged, isAged: aged, tequilaClass: null }) === null;
}

function gapsFor(matrix: "label" | "bottle", rows: ReadonlyArray<MatrixRow>): Gap[] {
  const gaps: Gap[] = [];
  for (const row of rows) {
    for (const group of MATRIX_GROUPS) {
      const cell = row.cells[group];
      if (cell === "C") continue;
      const field = fieldOf(row, group);
      if (field === null) {
        // The form has no such field yet.
        if (cell === "A") gaps.push({ matrix, row: row.label, group, expected: cell, found: "no-field" });
        continue;
      }
      if (field === undefined) continue; // a field this group never had: not shown, as an N cell says
      if (matrix === "bottle" && !BOTTLE_FUNCTION_FIELDS.has(field)) {
        if (!gaps.some((gap) => gap.matrix === matrix && gap.row === row.label && gap.found === "in-component")) {
          gaps.push({ matrix, row: row.label, group: "all", expected: "A", found: "in-component" });
        }
        continue;
      }
      const shown = matrix === "label" ? labelShown(group) : bottleShown(group);
      const shownFor: string[] = [];
      const hiddenFor: string[] = [];
      for (const kind of KINDS[group]) {
        for (const aged of AGED_STATES[group]) {
          (shown(field, kind, aged) ? shownFor : hiddenFor).push(AGED_STATES[group].length > 1 ? `${kind}${aged ? " (aged)" : ""}` : kind);
        }
      }
      const found = hiddenFor.length === 0 ? "shown" : shownFor.length === 0 ? "hidden" : "mixed";
      if ((cell === "A" && found !== "shown") || (cell === "N" && found !== "hidden")) {
        gaps.push({
          matrix, row: row.label, group, expected: cell, found,
          ...(found === "mixed" ? { detail: cell === "A" ? `hidden for ${hiddenFor.join(", ")}` : `shown for ${shownFor.join(", ")}` } : {}),
        });
      }
    }
  }
  return gaps;
}

/** The label's conditional cells that the record spells out by kind (`LABEL_CONDITIONS`), checked kind by kind. */
function conditionGaps(): Gap[] {
  const gaps: Gap[] = [];
  for (const condition of LABEL_CONDITIONS) {
    const row = LABEL_MATRIX.find((r) => r.label === condition.row);
    if (!row) throw new Error(`No matrix row called ${condition.row}`);
    const field = fieldOf(row, condition.group);
    if (typeof field !== "string") continue;
    const shown = labelShown(condition.group);
    const aged = AGED_STATES[condition.group];
    const wrongShown = condition.shown.filter((kind) => aged.some((a) => !shown(field, kind as CategoryKind, a)));
    const wrongHidden = condition.hidden.filter((kind) => aged.some((a) => shown(field, kind as CategoryKind, a)));
    if (wrongShown.length > 0) gaps.push({ matrix: "label", row: row.label, group: condition.group, expected: "A", found: "mixed", detail: `hidden for ${wrongShown.join(", ")}` });
    if (wrongHidden.length > 0) gaps.push({ matrix: "label", row: row.label, group: condition.group, expected: "N", found: "mixed", detail: `shown for ${wrongHidden.join(", ")}` });
  }
  return gaps;
}

/** Every "always" and "never" cell of the matrix, and every condition the record gives by kind, that today's form rules do not match. */
export function matrixGaps(): Gap[] {
  return [...gapsFor("label", LABEL_MATRIX), ...conditionGaps(), ...gapsFor("bottle", BOTTLE_MATRIX)];
}

export type GapGroup = { matrix: "label" | "bottle"; row: string; expected: "A" | "N"; found: Gap["found"]; groups: Array<FieldGroup | "all">; detail?: string[] };

/** The gaps with one entry per row, expectation and finding, listing the groups it holds for. */
export function groupGaps(gaps: ReadonlyArray<Gap>): GapGroup[] {
  const out: GapGroup[] = [];
  for (const gap of gaps) {
    let entry = out.find((e) => e.matrix === gap.matrix && e.row === gap.row && e.expected === gap.expected && e.found === gap.found);
    if (!entry) {
      entry = { matrix: gap.matrix, row: gap.row, expected: gap.expected, found: gap.found, groups: [] };
      out.push(entry);
    }
    entry.groups.push(gap.group);
    if (gap.detail) (entry.detail ??= []).push(`${gap.group}: ${gap.detail}`);
  }
  return out;
}
