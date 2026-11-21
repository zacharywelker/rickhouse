import { describe, expect, it } from "vitest";
import { duplicateScope, pairKey } from "../pair-key";

describe("pairKey", () => {
  it("is the same whichever way round the ids arrive", () => {
    expect(pairKey(9, 3)).toBe("3:9");
    expect(pairKey(3, 9)).toBe("3:9");
  });

  it("keeps ids numeric rather than comparing them as text", () => {
    expect(pairKey(10, 9)).toBe("9:10");
  });
});

describe("duplicateScope", () => {
  it("names the question by kind", () => {
    expect(duplicateScope("brands")).toBe("duplicate:brands");
    expect(duplicateScope("distilleries")).toBe("duplicate:distilleries");
  });
});
