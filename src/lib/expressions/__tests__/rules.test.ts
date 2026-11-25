import { describe, expect, it } from "vitest";
import { CATEGORY_TREE } from "@/lib/categories/tree";
import { categoryKinds, hiddenFields, peatKindFor, proofAfterBondToggle, withBondProof, isSingleMaltCategory, isUnaged, looksAged, parseRegions, showsFinishes, nameRuleColumns, nameSays, proofSpread, spreadLabel, strengthTier, withNameRules, type FormContext, type NameContext } from "../rules";
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

const makeContext = (overrides: Partial<FormContext> = {}): FormContext => ({
  group: "whiskey", kind: "american", values: {}, ginAged: false, ...overrides,
});

const peatCases: Array<{ kind: FormContext["kind"]; slug?: string | null; shown: boolean }> = [
  { kind: "japanese", shown: true },
  { kind: "international", shown: true },
  { kind: "irish", shown: true },
  { kind: "scotch", shown: true },
  { kind: "american", slug: "american-single-malt", shown: true },
  { kind: "american", slug: "bourbon", shown: false },
  { kind: "canadian", shown: false },
  { kind: "flavored-whisky", shown: false },
  { kind: "american", shown: false },
  { kind: "american", slug: null, shown: false },
  { kind: null, shown: false },
  { kind: null, slug: null, shown: false },
  { kind: null, slug: "american-single-malt", shown: true },
];

describe("peatKindFor", () => {
  it.each(peatCases)("returns $shown for kind $kind and slug $slug", ({ kind, slug, shown }) => {
    expect(peatKindFor({ kind, slug })).toBe(shown);
  });
});

describe("categoryKinds", () => {
  it("derives the expected kinds from the shared category tree", () => {
    const idBySlug = new Map(CATEGORY_TREE.map((node, index) => [node.slug, index + 1]));
    const rows = CATEGORY_TREE.map((node, index) => ({
      id: index + 1,
      slug: node.slug,
      parentId: node.parent === null ? null : idBySlug.get(node.parent)!,
    }));
    const kinds = categoryKinds(rows);
    const expected: Record<string, string[]> = {
      american: ["american-whiskey", "bourbon", "rye", "wheat-whiskey", "corn-whiskey", "american-single-malt", "light-whiskey", "tennessee"],
      irish: ["irish-whiskey", "pot-still-irish-whiskey", "malt-irish-whiskey", "grain-irish-whiskey", "blended-irish-whiskey"],
      scotch: ["scotch", "single-malt-scotch", "single-grain-scotch", "blended-scotch", "blended-grain-scotch", "blended-malt-scotch"],
      canadian: ["canadian-whisky"],
      japanese: ["japanese"],
      international: ["international"],
      "flavored-whisky": ["flavored-whisky"],
      cachaca: ["cachaca"],
      agricole: ["agricole"],
      "spiced-rum": ["spiced-rum"],
      apple: ["apple"],
      "eau-de-vie": ["eau-de-vie"],
      cognac: ["cognac"],
      armagnac: ["armagnac"],
      calvados: ["calvados"],
      pisco: ["pisco"],
      absinthe: ["absinthe"],
      akvavit: ["akvavit"],
      shochu: ["shochu"],
      tequila: ["tequila"],
      mezcal: ["mezcal"],
      genever: ["genever"],
      "flavored-vodka": ["flavored-vodka"],
      "chocolate-liqueur": ["chocolate-liqueur"],
      "cream-liqueur": ["cream-liqueur"],
      gin: ["gin"],
      liqueur: ["liqueur", "fruit-liqueur", "anise-liqueur", "nut-liqueur", "herbal-liqueur", "coffee-liqueur"],
      vodka: ["vodka"],
      amaro: ["amaro"],
      other: ["whiskey", "rum", "brandy", "other", "agave"],
    };
    const expectedBySlug = Object.fromEntries(
      Object.entries(expected).flatMap(([kind, slugs]) => slugs.map((slug) => [slug, kind])),
    );
    expect(rows.map((row) => row.slug).sort()).toEqual(Object.keys(expectedBySlug).sort());
    for (const row of rows) expect(kinds[row.id], row.slug).toBe(expectedBySlug[row.slug]);
  });

  it("reads the kind from the nearest named ancestor", () => {
    const kinds = categoryKinds(tree);
    expect(kinds[3]).toBe("american");
    expect(kinds[5]).toBe("scotch");
    expect(kinds[4]).toBe("scotch");
    expect(kinds[6]).toBe("irish");
    expect(kinds[1]).toBe("other");
  });

  it("survives a loop in the tree", () => {
    expect(categoryKinds([{ id: 1, slug: "a", parentId: 2 }, { id: 2, slug: "b", parentId: 1 }])[1]).toBe("other");
  });
});

describe("Single Malt", () => {
  it("recognises both categories, and not a blend", () => {
    expect(isSingleMaltCategory("american-single-malt")).toBe(true);
    expect(isSingleMaltCategory("single-malt-scotch")).toBe(true);
    expect(isSingleMaltCategory("blended-scotch")).toBe(false);
  });
});

describe("hiddenFields", () => {
  const base = { group: "whiskey" as const, kind: "american" as const, values: {}, ginAged: false };

  it.each([
    { group: "agave", kind: "tequila", ginAged: false, hidden: true },
    { group: "agave", kind: "mezcal", ginAged: false, hidden: true },
    { group: "gin", kind: "gin", ginAged: false, hidden: true },
    { group: "gin", kind: "gin", ginAged: true, hidden: true },
    { group: "gin", kind: "genever", ginAged: false, hidden: true },
    { group: "gin", kind: "genever", ginAged: true, hidden: true },
    { group: "whiskey", kind: "american", ginAged: false, hidden: false },
    { group: "brandy", kind: "cognac", ginAged: false, hidden: false },
  ] satisfies Array<Pick<FormContext, "group" | "kind" | "ginAged"> & { hidden: boolean }>)(
    "isCaskStrength hidden=$hidden for $kind (ginAged=$ginAged)", ({ hidden, ...context }) => {
      expect(hiddenFields(makeContext(context)).has("isCaskStrength")).toBe(hidden);
    },
  );

  it.each([
    { kind: "cognac", hidden: true },
    { kind: "armagnac", hidden: true },
    { kind: "calvados", hidden: true },
    { kind: "pisco", hidden: false },
    { kind: "apple", hidden: false },
    { kind: "eau-de-vie", hidden: false },
    { kind: "american", hidden: false },
  ] satisfies Array<{ kind: FormContext["kind"]; hidden: boolean }>)(
    "isNas hidden=$hidden for $kind", ({ kind, hidden }) => {
      const group = kind === "american" ? "whiskey" : "brandy";
      expect(hiddenFields(makeContext({ group, kind })).has("isNas")).toBe(hidden);
    },
  );

  it("cooperageId shown for scotch, while entryProof and isAdditiveFree stay hidden", () => {
    const hidden = hiddenFields(makeContext({ kind: "scotch" }));
    expect(hidden.has("cooperageId")).toBe(false);
    expect(hidden.has("entryProof")).toBe(true);
    expect(hidden.has("isAdditiveFree")).toBe(true);
  });

  it.each(peatCases)("peatStatus shown=$shown for kind $kind and slug $slug", ({ shown, ...context }) => {
    expect(hiddenFields(makeContext(context)).has("peatStatus")).toBe(!shown);
  });

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

describe("the rum Aged toggle", () => {
  const rum = (isAged?: boolean) => makeContext({ group: "rum", kind: "other", values: isAged === undefined ? {} : { isAged } });
  const aging = ["ageYears", "ageMonths", "ageDays", "ageStatement", "isNas", "barrelFilledOn", "bottledOn", "isCaskStrength"];
  it("hides the aging fields and the finish row of a rum nobody marked aged", () => {
    expect(isUnaged(rum())).toBe(true);
    for (const name of aging) expect(hiddenFields(rum()).has(name), name).toBe(true);
    expect(showsFinishes(rum())).toBe(false);
    expect(hiddenFields(rum()).has("isAged")).toBe(false);
  });
  it("shows them once it is aged", () => {
    expect(isUnaged(rum(true))).toBe(false);
    for (const name of ["ageYears", "ageMonths", "ageStatement", "isNas"]) expect(hiddenFields(rum(true)).has(name), name).toBe(false);
    expect(showsFinishes(rum(true))).toBe(true);
  });
  it("gives only amaro, liqueur and rum an Aged toggle", () => {
    expect(hiddenFields(makeContext({ group: "whiskey" })).has("isAged")).toBe(true);
    expect(hiddenFields(makeContext({ group: "brandy", kind: "cognac" })).has("isAged")).toBe(true);
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

describe("strength tier", () => {
  it("is Navy Strength from 54% ABV and Overproof from 57% for rum", () => {
    expect(strengthTier("rum", "107.9")).toBeNull();
    expect(strengthTier("rum", "108")).toBe("navy");
    expect(strengthTier("rum", "113.9")).toBe("navy");
    expect(strengthTier("rum", "114")).toBe("overproof");
    expect(strengthTier("rum", "151")).toBe("overproof");
  });

  it("has no Overproof for gin, which is Navy Strength from 54% up", () => {
    expect(strengthTier("gin", "107")).toBeNull();
    expect(strengthTier("gin", "108")).toBe("navy");
    expect(strengthTier("gin", "130")).toBe("navy");
  });

  it("is for rum and gin only, and needs a proof", () => {
    expect(strengthTier("whiskey", "120")).toBeNull();
    expect(strengthTier("agave", "120")).toBeNull();
    expect(strengthTier("rum", "")).toBeNull();
    expect(strengthTier("rum", null)).toBeNull();
    expect(strengthTier("rum", "abc")).toBeNull();
    expect(strengthTier(null, "120")).toBeNull();
  });
});

describe("designations a label ticks for itself", () => {
  const ctx = { group: "agave", kind: null, values: {}, ginAged: false } as const;

  it("keeps Still Proof's rule for unaged agave, but no form writes it any more", () => {
    expect(hiddenFields(ctx).has("isStillProof")).toBe(false);
    expect(hiddenFields({ ...ctx, values: { ageYears: "2" } }).has("isStillProof")).toBe(true);
    expect(hiddenFields({ ...ctx, values: { ageStatement: "Reposado" } }).has("isStillProof")).toBe(true);
    expect(hiddenFields({ ...ctx, group: "rum" }).has("isStillProof")).toBe(true);
    expect(writableFields("agave").has("isStillProof")).toBe(false);
    expect(writableFields("rum").has("isStillProof")).toBe(false);
  });

  it("keeps the two dates with the aging fields, so vodka and unaged gin drop them", () => {
    expect(hiddenFields({ ...ctx, group: "vodka" }).has("barrelFilledOn")).toBe(true);
    expect(writableFields("vodka").has("bottledOn")).toBe(false);
    expect(writableFields("rum").has("barrelFilledOn")).toBe(true);
  });
});

describe("what a name says", () => {
  const whiskey: NameContext = { group: "whiskey", kind: "american" };

  it.each(["tequila", "mezcal"] as const)("Cask Strength Blanco has no isCaskStrength entry for %s but does for whiskey", (kind) => {
    expect(nameSays("Cask Strength Blanco", { group: "agave", kind })).not.toHaveProperty("isCaskStrength");
    expect(nameSays("Cask Strength Blanco", whiskey)).toHaveProperty("isCaskStrength");
  });

  it("hears Cask Strength in its several names, as whole words", () => {
    for (const name of ["Booker's Cask Strength", "Eagle Rare Barrel Proof", "Rickhouse Proof", "Barrel-Strength Rye", "Straight From the Barrel"]) {
      expect(nameSays(name, whiskey).isCaskStrength, name).toBeDefined();
    }
    expect(nameSays("Barrel Aged Reserve", whiskey).isCaskStrength).toBeUndefined();
  });

  it("hears Bottled In Bond as BiB, Bonded and both spellings, but not inside another word", () => {
    for (const name of ["Old Fitz BiB", "Heaven Hill Bottled in Bond", "Larceny Bottled-in-Bond", "Old Overholt Bonded"]) {
      expect(nameSays(name, whiskey).isBottledInBond, name).toBeDefined();
    }
    expect(nameSays("Bibb & Tucker", whiskey).isBottledInBond).toBeUndefined();
    expect(nameSays("Unbonded Blend", whiskey).isBottledInBond).toBeUndefined();
  });

  it("hears Full Proof, for whiskey only", () => {
    expect(nameSays("Old Forester Full Proof", whiskey).fullProof).toBeDefined();
    expect(nameSays("Full Proof Rum", { group: "rum", kind: null }).fullProof).toBeUndefined();
  });

  it("leaves Bottled In Bond to American whiskey and Cask Strength to spirits with an age", () => {
    expect(nameSays("Bonded Malt", { group: "whiskey", kind: "scotch" }).isBottledInBond).toBeUndefined();
    expect(nameSays("Bonded", { group: "whiskey", kind: null }).isBottledInBond).toBeUndefined();
    expect(nameSays("Cask Strength Gin", { group: "gin", kind: null }).isCaskStrength).toBeUndefined();
    expect(nameSays("Cask Strength Vodka", { group: "vodka", kind: null }).isCaskStrength).toBeUndefined();
    expect(nameSays("Cask Strength Rum", { group: "rum", kind: null }).isCaskStrength).toBeDefined();
  });
});

describe("withNameRules", () => {
  const resolve = (): NameContext => ({ group: "whiskey", kind: "american" });
  const blank = {
    name: "", proof: "", entryProof: "", isCaskStrength: false, isBottledInBond: false,
    isStraight: false, isNas: false, ageYears: "", ageMonths: "", ageDays: "", ageStatement: "",
  } as Record<string, unknown>;

  it("ticks Cask Strength when the name starts to say it", () => {
    const next = withNameRules(blank, { ...blank, name: "Stagg Barrel Proof" }, resolve);
    expect(next.isCaskStrength).toBe(true);
  });

  it("ticks Bottled In Bond with 100 proof and an inferred minimum age", () => {
    const next = withNameRules(blank, { ...blank, name: "Old Fitz Bonded" }, resolve);
    expect(next).toMatchObject({ isBottledInBond: true, proof: "100", ageYears: "" });
  });

  it("does not tick it again once it was unticked by hand", () => {
    const said = { ...blank, name: "Old Fitz Bonded", isBottledInBond: false };
    const next = withNameRules(said, { ...said, name: "Old Fitz Bonded Reserve" }, resolve);
    expect(next.isBottledInBond).toBe(false);
  });

  it("acts once the category fits a name typed first", () => {
    const named = { ...blank, name: "Old Fitz Bonded" };
    const other = (values: Record<string, unknown>): NameContext =>
      values.categoryId === "1" ? { group: "whiskey", kind: "american" } : { group: "other", kind: null };
    expect(withNameRules(named, { ...named, categoryId: "" }, other).isBottledInBond).toBe(false);
    expect(withNameRules(named, { ...named, categoryId: "1" }, other).isBottledInBond).toBe(true);
  });

  it("copies Proof into Entry Proof for Full Proof, then follows it until Entry Proof is changed", () => {
    const named: Record<string, unknown> = withNameRules({ ...blank, proof: "100" }, { ...blank, proof: "100", name: "Old Forester Full Proof" }, resolve);
    expect(named.entryProof).toBe("100");
    const moved: Record<string, unknown> = withNameRules(named, { ...named, proof: "104" }, resolve);
    expect(moved.entryProof).toBe("104");
    const edited: Record<string, unknown> = { ...moved, entryProof: "110" };
    expect(withNameRules(edited, { ...edited, proof: "90" }, resolve).entryProof).toBe("110");
  });

  it("leaves an Entry Proof already there alone when the name starts to say Full Proof", () => {
    const next = withNameRules({ ...blank, proof: "100", entryProof: "115" }, { ...blank, proof: "100", entryProof: "115", name: "Full Proof" }, resolve);
    expect(next.entryProof).toBe("115");
  });
});

describe("proofSpread", () => {
  it("spans the proofs across releases and bottles, and counts them", () => {
    expect(proofSpread(["118.4", "", null], ["126.2", "121"])).toEqual({ min: 118.4, max: 126.2, releases: 1, bottles: 2 });
  });

  it("is null when nothing has a proof", () => {
    expect(proofSpread([], [])).toBeNull();
    expect(proofSpread([""], [null])).toBeNull();
  });
});

describe("spreadLabel", () => {
  it("shows the one proof, a range, or just Cask Strength", () => {
    expect(spreadLabel(proofSpread(["126.1"], []))).toBe("126.1");
    expect(spreadLabel(proofSpread(["126.1"], ["132.7"]))).toBe("126.1 - 132.7");
    expect(spreadLabel(proofSpread([], []))).toBe("Cask Strength");
  });
});

describe("nameRuleColumns", () => {
  const stored = { name: "Eagle Rare", categoryId: 1, proof: "90", entryProof: null, ageYears: null, ageMonths: null, ageDays: null, ageStatement: null, isNas: false, isStraight: false, isBottledInBond: false, isCaskStrength: false };
  const american = () => ({ group: "whiskey" as const, kind: "american" as const });

  it("ticks Bonded with its proof when a rename starts to say it", () => {
    expect(nameRuleColumns(stored, { name: "Eagle Rare Bottled in Bond" }, american)).toEqual({ isBottledInBond: true, proof: "100" });
  });

  it("leaves a column the edit sent, and does nothing when the name already said it", () => {
    expect(nameRuleColumns(stored, { name: "Eagle Rare Barrel Proof", isCaskStrength: false }, american)).toEqual({});
    const said = { ...stored, name: "Eagle Rare Barrel Proof" };
    expect(nameRuleColumns(said, { name: "Eagle Rare Barrel Proof 2" }, american)).toEqual({});
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

describe("proofAfterBondToggle", () => {
  it("stashes the earlier proof when Bottled in Bond is ticked", () => {
    expect(proofAfterBondToggle({ bonded: true, proof: "117.9", stashed: null })).toEqual({ proof: "100", stashed: "117.9" });
  });

  it("restores the earlier proof when Bottled in Bond is unticked", () => {
    expect(proofAfterBondToggle({ bonded: false, proof: "100", stashed: "117.9" })).toEqual({ proof: "117.9", stashed: null });
  });

  it("keeps a hand-edited proof when Bottled in Bond is unticked and clears the stash", () => {
    expect(proofAfterBondToggle({ bonded: false, proof: "101", stashed: "117.9" })).toEqual({ proof: "101", stashed: null });
  });

  it("keeps the proof when Bottled in Bond is unticked without a stash", () => {
    expect(proofAfterBondToggle({ bonded: false, proof: "100", stashed: null })).toEqual({ proof: "100", stashed: null });
  });

  it("keeps an existing stash when ticking with proof already at 100", () => {
    expect(proofAfterBondToggle({ bonded: true, proof: "100", stashed: "117.9" })).toEqual({ proof: "100", stashed: "117.9" });
  });
});
