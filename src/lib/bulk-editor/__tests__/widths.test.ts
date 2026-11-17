import { describe, expect, it } from "vitest";
import { clampWidth, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, parseWidths } from "../widths";

describe("column widths", () => {
  it("clamps to the draggable range and rounds", () => {
    expect(clampWidth(3)).toBe(MIN_COLUMN_WIDTH);
    expect(clampWidth(5000)).toBe(MAX_COLUMN_WIDTH);
    expect(clampWidth(120.6)).toBe(121);
  });
  it("keeps only usable numbers from storage", () => {
    expect(parseWidths({ brand: 200, name: "wide", proof: NaN, age: 1 })).toEqual({ brand: 200, age: MIN_COLUMN_WIDTH });
    expect(parseWidths(null)).toEqual({});
    expect(parseWidths([1, 2])).toEqual({});
  });
});
