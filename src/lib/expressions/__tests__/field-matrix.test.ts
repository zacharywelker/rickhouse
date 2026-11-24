import { describe, expect, it } from "vitest";
import { BOTTLE_FIELDS } from "../bottle-fields";
import { BOTTLE_MATRIX, LABEL_MATRIX, MATRIX_GROUPS, type MatrixRow } from "../field-matrix";
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
    for (const row of LABEL_MATRIX) for (const name of fieldNames(row)) expect(labelFieldNames.has(name), `${row.label}: ${name}`).toBe(true);
    for (const row of BOTTLE_MATRIX) for (const name of fieldNames(row)) expect(bottleFieldNames.has(name), `${row.label}: ${name}`).toBe(true);
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
