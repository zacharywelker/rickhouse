import { describe, expect, it } from "vitest";
import { BOTTLE_FIELDS } from "../bottle-fields";
import { ALWAYS_FIELDS, BOTTLE_ALWAYS_FIELDS, BOTTLE_MATRIX, LABEL_CONDITIONS, LABEL_MATRIX, MATRIX_GROUPS, UNDECIDABLE, UNLISTED_FIELDS, type MatrixRow } from "../field-matrix";
import { groupGaps, matrixGaps } from "../field-matrix-check";
import { KNOWN_GAPS } from "../field-matrix-gaps";
import { EXPRESSION_SECTIONS } from "../fields";

const labelFieldNames = new Set(EXPRESSION_SECTIONS.flatMap((section) => section.fields.map((field) => field.name)));
const bottleFieldNames = new Set(BOTTLE_FIELDS.map((field) => field.name));

function fieldNames(row: MatrixRow): string[] {
  if (typeof row.field === "string") return [row.field];
  if (row.field === null) return [];
  return Object.values(row.field).filter((name): name is string => typeof name === "string");
}

describe("the field matrix as data", () => {
  it("has a cell for every field group in every row, and no row twice", () => {
    for (const rows of [LABEL_MATRIX, BOTTLE_MATRIX]) {
      expect(new Set(rows.map((row) => row.label)).size).toBe(rows.length);
      for (const row of rows) {
        expect(Object.keys(row.cells).sort(), row.label).toEqual([...MATRIX_GROUPS].sort());
        for (const group of MATRIX_GROUPS) expect(["A", "N", "C"], `${row.label} / ${group}`).toContain(row.cells[group]);
      }
    }
  });

  it("names only fields the forms have", () => {
    // finishLinks is the finishes picker, which the Barrel type row stands for; it is a picker and not a field of the form's list.
    for (const row of LABEL_MATRIX) for (const name of fieldNames(row)) expect(name === "finishLinks" || labelFieldNames.has(name), `${row.label}: ${name}`).toBe(true);
    for (const row of BOTTLE_MATRIX) for (const name of fieldNames(row)) expect(bottleFieldNames.has(name), `${row.label}: ${name}`).toBe(true);
  });
});

describe("coverage", () => {
  it("accounts for every field of the label form: a row, an always-field or a field the record is silent on", () => {
    const covered = new Set([...LABEL_MATRIX.flatMap(fieldNames), ...ALWAYS_FIELDS, ...Object.keys(UNLISTED_FIELDS)]);
    for (const name of labelFieldNames) expect(covered.has(name), name).toBe(true);
  });

  it("accounts for every field of the bottle form", () => {
    const covered = new Set([...BOTTLE_MATRIX.flatMap(fieldNames), ...BOTTLE_ALWAYS_FIELDS]);
    for (const name of bottleFieldNames) expect(covered.has(name), name).toBe(true);
  });

  it("only has conditions for rows that exist and are conditional for that group", () => {
    for (const condition of LABEL_CONDITIONS) {
      const found = LABEL_MATRIX.find((r) => r.label === condition.row);
      expect(found, condition.row).toBeDefined();
      expect(found!.cells[condition.group], `${condition.row} / ${condition.group}`).toBe("C");
    }
    for (const entry of UNDECIDABLE) expect(LABEL_MATRIX.some((r) => r.label === entry.row), entry.row).toBe(true);
  });
});

describe("the form rules against the matrix", () => {
  it("differ in exactly the places listed in field-matrix-gaps.ts", () => {
    const found = groupGaps(matrixGaps());
    const listed = KNOWN_GAPS.map(({ phase4: _phase4, ...gap }) => gap);
    expect(found).toEqual(listed);
  });

  it("gives every known gap something to do in phase 4", () => {
    for (const gap of KNOWN_GAPS) expect(gap.phase4.length, gap.row).toBeGreaterThan(20);
  });
});
