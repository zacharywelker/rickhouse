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

describe("Calvados fruit", () => {
  it("totals the apples, the pears and everything, from the shares filled in", async () => {
    const { calvadosTotals } = await import("../spirit-details");
    expect(calvadosTotals([])).toEqual({ apples: null, pears: null, total: null });
    expect(calvadosTotals([{ name: "Bittersweet apples", share: 40 }, { name: "Sweet apples", share: 30 }, { name: "Pears", share: 30 }])).toEqual({ apples: 70, pears: 30, total: 100 });
    expect(calvadosTotals([{ name: "Pears", share: 12.5 }, { name: "Bitter apples", share: null }])).toEqual({ apples: null, pears: 12.5, total: 12.5 });
    expect(calvadosTotals([{ name: "Apples (type not stated)", share: 100 }])).toEqual({ apples: 100, pears: null, total: 100 });
    expect(calvadosTotals([{ name: "Cherry", share: 50 }])).toEqual({ apples: null, pears: null, total: null });
  });
  it("warns about pears against the appellation, never blocks, and is silent where it does not know", async () => {
    const { pearNote } = await import("../spirit-details");
    expect(pearNote("pays-d-auge", 31)).toBe("Pays d'Auge allows at most 30% pears.");
    expect(pearNote("pays-d-auge", 30)).toBeNull();
    expect(pearNote("domfrontais", 29)).toBe("Domfrontais takes at least 30% pears.");
    expect(pearNote("domfrontais", 30)).toBeNull();
    expect(pearNote("aoc-calvados", 90)).toBeNull();
    expect(pearNote("domfrontais", null)).toBeNull();
    expect(pearNote(null, 10)).toBeNull();
  });
  it("accepts each of the six rows as a Calvados base, and no other fruit", async () => {
    const { CALVADOS_FRUIT_ROWS, ingredientAllowed } = await import("../spirit-details");
    for (const row of CALVADOS_FRUIT_ROWS) expect(ingredientAllowed("calvados", { name: row.name, kind: "distillate", family: row.family }), row.name).toBe(true);
    expect(ingredientAllowed("calvados", { name: "Cherry", kind: "distillate", family: "other" })).toBe(false);
  });
});

describe("normalizeCalvadosFruit", () => {
  it("turns the names a phone or an old label brings into the six rows", async () => {
    const { normalizeCalvadosFruit } = await import("../spirit-details");
    const names = (rows: Array<{ name: string; family?: string | null; share?: number | null }>) => normalizeCalvadosFruit(rows).map((r) => r.name);
    expect(names([{ name: "Pear", family: "pear" }, { name: "Williams Pear", family: "pear" }])).toEqual(["Pears"]);
    expect(names([{ name: "Cider Apple", family: "apple" }])).toEqual(["Apples (type not stated)"]);
    expect(names([{ name: "Sweet Apple", family: "apple" }, { name: "Bittersweet", family: "apple" }, { name: "Bitter Apple", family: "apple" }, { name: "Tart apple", family: "apple" }]))
      .toEqual(["Sweet apples", "Bittersweet apples", "Bitter apples", "Acidic / tart apples"]);
    expect(names([{ name: "Cherry", family: "other" }])).toEqual(["Cherry"]);
  });
  it("adds the shares of two names that land on one row, and keeps none where none was sent", async () => {
    const { normalizeCalvadosFruit } = await import("../spirit-details");
    expect(normalizeCalvadosFruit([{ name: "Pear", family: "pear", share: 10 }, { name: "Poire", family: "pear", share: 5 }])).toEqual([{ name: "Pears", family: "pear", share: 15 }]);
    expect(normalizeCalvadosFruit<{ name: string; family: string; share?: number | null }>([{ name: "Pear", family: "pear" }, { name: "Pears", family: "pear" }])[0]!.share).toBeUndefined();
    expect(normalizeCalvadosFruit([{ name: "Pear", family: "pear", share: null }, { name: "Pears", family: "pear", share: null }])[0]!.share).toBeNull();
    expect(normalizeCalvadosFruit([{ name: "Pears", family: "pear", share: 30 }])).toEqual([{ name: "Pears", family: "pear", share: 30 }]);
  });
});
