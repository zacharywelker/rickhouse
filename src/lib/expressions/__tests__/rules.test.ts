import { describe, expect, it } from "vitest";
import { categoryKinds, hiddenFields, withBondProof, isUnaged, looksAged, parseRegions, showsFinishes } from "../rules";
import { writableFields } from "../fields";
import { expressionSchema } from "../schema";

const tree = [
  { id: 1, slug: "whiskey", parentId: null },
  { id: 2, slug: "american-whiskey", parentId: 1 },
  { id: 3, slug: "bourbon", parentId: 2 },
  { id: 4, slug: "scotch", parentId: 1 },
  { id: 5, slug: "blended-scotch", parentId: 4 },
  { id: 6, slug: "irish-whiskey", parentId: 1 },
];

describe("categoryKinds", () => {
  it("reads the kind from the nearest named ancestor", () => {
    const kinds = categoryKinds(tree);
    expect(kinds[3]).toBe("american");
    expect(kinds[5]).toBe("scotch");
    expect(kinds[4]).toBe("scotch");
    expect(kinds[6]).toBe("other");
    expect(kinds[1]).toBe("other");
  });

  it("survives a loop in the tree", () => {
    expect(categoryKinds([{ id: 1, slug: "a", parentId: 2 }, { id: 2, slug: "b", parentId: 1 }])[1]).toBe("other");
  });
});

describe("hiddenFields", () => {
  const base = { group: "whiskey" as const, kind: "american" as const, values: {}, ginAged: false };

  it("offers Straight only to American whiskey, and always when kinds are unknown", () => {
    expect(hiddenFields(base).has("isStraight")).toBe(false);
    expect(hiddenFields({ ...base, kind: "scotch" }).has("isStraight")).toBe(true);
    expect(hiddenFields({ ...base, kind: "other" }).has("isStraight")).toBe(true);
    expect(hiddenFields({ ...base, kind: null }).has("isStraight")).toBe(false);
  });

  it("offers Bottled In Bond only to American whiskey", () => {
    expect(hiddenFields(base).has("isBottledInBond")).toBe(false);
    expect(hiddenFields({ ...base, kind: "scotch" }).has("isBottledInBond")).toBe(true);
    expect(hiddenFields({ ...base, kind: "other" }).has("isBottledInBond")).toBe(true);
  });

  it("drops aging from vodka, and from gin until it is aged", () => {
    for (const name of ["ageYears", "ageStatement", "isNas", "isStraight", "isCaskStrength"]) {
      expect(hiddenFields({ ...base, group: "vodka" }).has(name)).toBe(true);
      expect(hiddenFields({ ...base, group: "gin" }).has(name)).toBe(true);
      expect(hiddenFields({ ...base, group: "gin", ginAged: true }).has("ageYears")).toBe(false);
    }
    expect(isUnaged({ group: "vodka", ginAged: true })).toBe(true);
    expect(showsFinishes({ group: "gin", ginAged: false })).toBe(false);
    expect(showsFinishes({ group: "gin", ginAged: true })).toBe(true);
  });

  it("shows the solera range only when Solera is Yes", () => {
    expect(hiddenFields({ ...base, group: "rum", values: { isSolera: "" } }).has("soleraRange")).toBe(true);
    expect(hiddenFields({ ...base, group: "rum", values: { isSolera: "false" } }).has("soleraRange")).toBe(true);
    expect(hiddenFields({ ...base, group: "rum", values: { isSolera: "true" } }).has("soleraRange")).toBe(false);
  });
});

describe("looksAged", () => {
  it("opens a gin as aged when it has anything only an aged one has", () => {
    expect(looksAged({ ageYears: "" }, 0)).toBe(false);
    expect(looksAged({ ageYears: "3" }, 0)).toBe(true);
    expect(looksAged({ ageStatement: "Cask rested" }, 0)).toBe(true);
    expect(looksAged({}, 1)).toBe(true);
  });
});

describe("regions", () => {
  it("reads a list, once each", () => {
    expect(parseRegions("Speyside, Islay,  Speyside,")).toEqual(["Speyside", "Islay"]);
    expect(parseRegions(undefined)).toEqual([]);
  });

  it("validates against the Scotch regions, in any case", () => {
    const shape = { brandId: "1", categoryId: "2", name: "X" };
    expect(expressionSchema.parse({ ...shape, regions: "speyside, ISLAY" }).regions).toEqual(["Speyside", "Islay"]);
    expect(expressionSchema.parse({ ...shape, regions: "" }).regions).toBeNull();
    expect(expressionSchema.safeParse({ ...shape, regions: "Narnia" }).success).toBe(false);
  });
});

describe("rum", () => {
  it("takes sugarcane as a base and a 3-chamber still", () => {
    const shape = { brandId: "1", categoryId: "2", name: "X" };
    expect(expressionSchema.parse({ ...shape, molassesOrCane: "sugarcane", stillType: "3-chamber" })).toMatchObject({
      molassesOrCane: "sugarcane",
      stillType: "3-chamber",
    });
    expect(expressionSchema.safeParse({ ...shape, molassesOrCane: "cane juice" }).success).toBe(false);
  });
});

describe("writableFields", () => {
  it("never writes aging for vodka", () => {
    const vodka = writableFields("vodka");
    for (const name of ["ageYears", "ageMonths", "ageDays", "ageStatement", "isNas", "isStraight", "isCaskStrength"]) {
      expect(vodka.has(name)).toBe(false);
    }
    expect(vodka.has("proof")).toBe(true);
    expect(writableFields("gin").has("ageYears")).toBe(true);
  });

  it("keeps Bottled In Bond and regions to whiskey", () => {
    expect(writableFields("whiskey").has("isBottledInBond")).toBe(true);
    expect(writableFields("whiskey").has("regions")).toBe(true);
    expect(writableFields("rum").has("isBottledInBond")).toBe(false);
  });
});

describe("withBondProof", () => {
  it("forces 100 proof when the tick goes on, or when proof is sent for a bonded label", () => {
    expect(withBondProof({ isBottledInBond: true }, false)).toEqual({ isBottledInBond: true, proof: "100" });
    expect(withBondProof({ proof: "90" }, true)).toEqual({ proof: "100" });
  });

  it("leaves an edit alone when the label is not bonded, is being unbonded, or proof is not touched", () => {
    expect(withBondProof({ proof: "90" }, false)).toEqual({ proof: "90" });
    expect(withBondProof({ isBottledInBond: false, proof: "90" }, true)).toEqual({ isBottledInBond: false, proof: "90" });
    expect(withBondProof({ name: "x" }, true)).toEqual({ name: "x" });
  });
});
