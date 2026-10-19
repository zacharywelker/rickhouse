import { describe, expect, it } from "vitest";
import { groupingPatch } from "../grouping-patch";

const base = { groupOrder: ["proof", "mashbill", "distillery", "age", "finish"] as const, seeding: "similar" as const };
const swapped = ["mashbill", "proof", "distillery", "age", "finish"] as const;

describe("groupingPatch", () => {
  it("is null when nothing changed", () => {
    expect(groupingPatch(base, { ...base, groupOrder: [...base.groupOrder] })).toBeNull();
  });
  it("sends only the order when only the order changed (compared element by element)", () => {
    expect(groupingPatch(base, { ...base, groupOrder: [...swapped] })).toEqual({ groupOrder: [...swapped] });
  });
  it("sends only the seeding when only the seeding changed", () => {
    expect(groupingPatch(base, { ...base, seeding: "random" })).toEqual({ seeding: "random" });
  });
  it("sends both when both changed", () => {
    expect(groupingPatch(base, { groupOrder: swapped, seeding: "random" })).toEqual({ groupOrder: [...swapped], seeding: "random" });
  });
});
