import { describe, expect, it } from "vitest";
import { DEFAULT_GROUP_ORDER, GROUP_KEYS, isGroupOrder } from "../types";
import { GROUP_KEY_LABELS, moveKey } from "../priority";

describe("GROUP_KEY_LABELS", () => {
  it("names every key the engine groups by", () => {
    expect(Object.keys(GROUP_KEY_LABELS).sort()).toEqual([...GROUP_KEYS].sort());
    for (const key of GROUP_KEYS) expect(GROUP_KEY_LABELS[key]).toMatch(/^[A-Z]/);
  });
});

describe("moveKey", () => {
  const order = [...DEFAULT_GROUP_ORDER];

  it("moves a key down and up by one place", () => {
    expect(moveKey(order, 0, 1)).toEqual(["mashbill", "proof", "distillery", "age", "finish"]);
    expect(moveKey(order, 3, -1)).toEqual(["proof", "mashbill", "age", "distillery", "finish"]);
  });

  it("does nothing at the ends, and for a bad index", () => {
    expect(moveKey(order, 0, -1)).toEqual(order);
    expect(moveKey(order, 4, 1)).toEqual(order);
    expect(moveKey(order, 9, 1)).toEqual(order);
    expect(moveKey(order, -1, 1)).toEqual(order);
    expect(moveKey(order, 1, 0.5)).toEqual(order);
    expect(moveKey(order, 1, Number.NaN)).toEqual(order);
  });

  it("returns a new array and never changes its input", () => {
    const input = [...order];
    const out = moveKey(input, 1, 1);
    expect(out).not.toBe(input);
    expect(input).toEqual(order);
    expect(isGroupOrder(out)).toBe(true);
  });
});
