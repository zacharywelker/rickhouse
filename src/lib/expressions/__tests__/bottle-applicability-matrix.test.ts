import { describe, expect, it } from "vitest";
import type { FieldGroup } from "@/db/schema";
import { bottleFieldNotUsed } from "../bottle-applicability";
import { BOTTLE_MATRIX, MATRIX_GROUPS } from "../field-matrix";
import type { CategoryKind } from "../rules";

const kinds: Record<FieldGroup, ReadonlyArray<CategoryKind>> = {
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

describe("bottle applicability against the matrix", () => {
  for (const row of BOTTLE_MATRIX) {
    // Skip Bottle count and Brandy designation for all nine groups: another
    // task retires them; their existing applicability rules stay unchanged.
    if (row.label === "Bottle count" || row.label === "Brandy designation") continue;
    // No unknown string field names are skipped: this task covers every other row.
    const field = row.field;
    if (typeof field !== "string") continue;
    for (const group of MATRIX_GROUPS) {
      const cell = row.cells[group];
      // Conditional cells are covered separately where LabelFacts can decide them.
      if (cell === "C") continue;
      for (const kind of kinds[group]) {
        for (const isAgedGin of group === "gin" ? [false, true] : [false]) {
          it(`${row.label} / ${group} / ${kind} / aged gin=${isAgedGin}: ${cell}`, () => {
            const reason = bottleFieldNotUsed(field, { group, kind, isAgedGin, tequilaClass: null });
            if (cell === "A") expect(reason).toBeNull();
            else {
              expect(reason).toEqual(expect.any(String));
              expect(reason).not.toBe("");
            }
          });
        }
      }
    }
  }
});
