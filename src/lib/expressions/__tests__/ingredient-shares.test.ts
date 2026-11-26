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

describe("shareNote", () => {
  it("says nothing until a share is filled, and nothing when they add to 100", async () => {
    const { shareNote } = await import("../spirit-details");
    expect(shareNote([])).toBeNull();
    expect(shareNote([{ share: null }, { share: undefined }])).toBeNull();
    expect(shareNote([{ share: 90 }, { share: 10 }])).toBeNull();
    expect(shareNote([{ share: 99.99 }])).toBeNull();
    expect(shareNote([{ share: 33.33 }, { share: 33.33 }, { share: 33.34 }])).toBeNull();
  });
  it("warns, never blocks, when they do not", async () => {
    const { shareNote } = await import("../spirit-details");
    expect(shareNote([{ share: 90 }, { share: 5 }])).toBe("The shares add up to 95%, not 100%.");
    expect(shareNote([{ share: 90 }, { share: null }])).toBe("The shares add up to 90% so far, not 100%.");
    expect(shareNote([{ share: 60 }, { share: 60 }])).toBe("The shares add up to 120%, not 100%.");
    expect(shareNote([{ share: 100 }, { share: null }])).toBe("Some grapes have no share yet.");
  });
});

describe("grapeSuggestions", () => {
  it("lists a spirit's grapes with the main ones first", async () => {
    const { grapeSuggestions } = await import("../ingredient-presets");
    expect(grapeSuggestions("cognac", null).slice(0, 3)).toEqual(["Ugni Blanc", "Folle Blanche", "Colombard"]);
    expect(grapeSuggestions("armagnac", null)[1]).toBe("Baco 22A");
    expect(grapeSuggestions("pisco", "Peru")).toContain("Quebranta");
    expect(grapeSuggestions("pisco", "Peru")).not.toContain("Pedro Jiménez");
    expect(grapeSuggestions("pisco", "Chile")).toContain("Pedro Jiménez");
    expect(grapeSuggestions("pisco", null)).toEqual(expect.arrayContaining(["Quebranta", "Pedro Jiménez"]));
    expect(grapeSuggestions("calvados", null)).toEqual([]);
  });
});
