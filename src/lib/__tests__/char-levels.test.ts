import { describe, expect, it } from "vitest";
import { CHAR_LEVELS } from "@/db/schema";
import { CHAR_LEVEL_DETAILS, isCharLevel } from "@/lib/char-levels";

describe("char levels", () => {
  it("knows every stored value and nothing else", () => {
    for (const level of CHAR_LEVELS) expect(isCharLevel(level)).toBe(true);
    for (const other of [null, undefined, "", "5", "None", 1]) expect(isCharLevel(other)).toBe(false);
  });

  it("burns deeper at every step, so the stave reads left to right", () => {
    const layers = CHAR_LEVELS.map((level) => CHAR_LEVEL_DETAILS[level]);
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i]!.toast).toBeGreaterThanOrEqual(layers[i - 1]!.toast);
      expect(layers[i]!.char).toBeGreaterThanOrEqual(layers[i - 1]!.char);
    }
    for (const { toast, char } of layers) {
      expect(char).toBeLessThanOrEqual(toast);
      expect(toast).toBeLessThan(1);
    }
  });

  it("only charred levels claim a flame time", () => {
    expect(CHAR_LEVEL_DETAILS.none.flameShort).toBe("");
    expect(CHAR_LEVEL_DETAILS.toasted.flameShort).toBe("");
    for (const level of ["1", "2", "3", "4"] as const) expect(CHAR_LEVEL_DETAILS[level].flameShort).toMatch(/^≈ \d+ s flame$/);
  });
});
