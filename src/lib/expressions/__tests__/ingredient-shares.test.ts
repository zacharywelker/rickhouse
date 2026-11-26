import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

describe("parseShare", () => {
  it("keeps a share from 0 to 100 to two places, and null for none", async () => {
    const { parseShare } = await import("../spirit-details");
    expect(parseShare(90)).toBe(90);
    expect(parseShare("12.345")).toBe(12.35);
    expect(parseShare(0)).toBe(0);
    expect(parseShare(100)).toBe(100);
    expect(parseShare(null)).toBeNull();
    expect(parseShare("")).toBeNull();
    expect(parseShare(101)).toBeNull();
    expect(parseShare(-1)).toBeNull();
    expect(parseShare("abc")).toBeNull();
  });
  it("is undefined when the key was not sent, which keeps a saved share", async () => {
    const { parseShare } = await import("../spirit-details");
    expect(parseShare(undefined)).toBeUndefined();
  });
});

describe("parseIngredientLinks and shares", () => {
  it("carries a sent share, a sent none, and leaves an unsent one out", async () => {
    const { parseIngredientLinks } = await import("../save");
    const rows = parseIngredientLinks(JSON.stringify([
      { name: "Ugni Blanc", family: "grape", kind: "distillate", share: 90 },
      { name: "Colombard", family: "grape", kind: "distillate", share: null },
      { name: "Folle Blanche", family: "grape", kind: "distillate" },
    ]));
    expect(rows![0]).toMatchObject({ name: "Ugni Blanc", share: 90 });
    expect(rows![1]).toMatchObject({ name: "Colombard", share: null });
    expect("share" in rows![2]!).toBe(false);
  });
});
