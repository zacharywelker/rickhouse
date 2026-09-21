import { describe, expect, it } from "vitest";
import { createsCycle, descendantsOf, type ParentLink } from "../tree";

// Whiskey > American Whiskey > Bourbon, plus an unrelated Rum branch.
const TREE: ParentLink[] = [
  { id: 1, parentId: null }, // Whiskey
  { id: 2, parentId: 1 }, //    American Whiskey
  { id: 3, parentId: 2 }, //      Bourbon
  { id: 4, parentId: 2 }, //      Rye
  { id: 5, parentId: null }, // Rum
];

describe("createsCycle", () => {
  it("allows moving a node under an unrelated branch", () => {
    expect(createsCycle(TREE, 3, 5)).toBe(false);
  });

  it("allows clearing the parent", () => {
    expect(createsCycle(TREE, 3, null)).toBe(false);
  });

  it("rejects a node being its own parent", () => {
    expect(createsCycle(TREE, 3, 3)).toBe(true);
  });

  it("rejects a node being parented to its direct child", () => {
    expect(createsCycle(TREE, 2, 3)).toBe(true);
  });

  it("rejects a node being parented to a deep descendant", () => {
    // Whiskey under Bourbon would make the whole tree unreachable.
    expect(createsCycle(TREE, 1, 3)).toBe(true);
  });

  it("terminates on data that already contains a loop", () => {
    const looped: ParentLink[] = [
      { id: 10, parentId: 11 },
      { id: 11, parentId: 10 },
      { id: 12, parentId: null },
    ];
    expect(createsCycle(looped, 12, 10)).toBe(false);
  });

  it("treats a missing parentId as no parent", () => {
    expect(createsCycle([{ id: 1 }, { id: 2, parentId: 1 }], 2, 1)).toBe(false);
  });
});

describe("descendantsOf", () => {
  it("includes the node itself", () => {
    expect(descendantsOf(TREE, 5)).toEqual(new Set([5]));
  });

  it("collects every level beneath a node", () => {
    expect(descendantsOf(TREE, 1)).toEqual(new Set([1, 2, 3, 4]));
  });

  it("collects a single level", () => {
    expect(descendantsOf(TREE, 2)).toEqual(new Set([2, 3, 4]));
  });

  it("does not wander into sibling branches", () => {
    expect(descendantsOf(TREE, 3)).toEqual(new Set([3]));
  });
});
