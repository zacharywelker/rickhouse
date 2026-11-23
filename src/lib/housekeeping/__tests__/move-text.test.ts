import { describe, expect, it } from "vitest";
import { describeMoves } from "../move-text";

describe("describeMoves", () => {
  it("counts in words, singular when there is one", () => {
    expect(describeMoves([{ label: "labels", count: 3 }])).toBe("3 labels");
    expect(describeMoves([{ label: "labels", count: 1 }])).toBe("1 label");
    expect(describeMoves([{ label: "distilleries", count: 1 }])).toBe("1 distillery");
    expect(describeMoves([{ label: "child companies", count: 1 }])).toBe("1 child company");
  });

  it("joins several with commas and an and", () => {
    expect(describeMoves([{ label: "labels", count: 3 }, { label: "bottles", count: 1 }])).toBe("3 labels and 1 bottle");
    expect(
      describeMoves([{ label: "labels", count: 3 }, { label: "mashbill links", count: 1 }, { label: "other names", count: 2 }]),
    ).toBe("3 labels, 1 mashbill link and 2 other names");
  });

  it("says nothing when nothing moves", () => {
    expect(describeMoves([])).toBe("");
  });
});
