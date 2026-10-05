import { describe, expect, it } from "vitest";
import { guessNewLabel, searchLabels, typedCode, words, type LabelDoc } from "../label-search";

const WHISKEY = { id: 1, name: "Whiskey" };
const BOURBON = { id: 2, name: "Bourbon" };
const RYE = { id: 3, name: "Rye" };
const RUM = { id: 4, name: "Rum" };
const LIQUEUR = { id: 5, name: "Liqueur" };

let nextId = 1;
function label(
  brand: string,
  name: string,
  category: { id: number; name: string },
  extra: Partial<LabelDoc> = {},
): LabelDoc {
  const parents = category.id === BOURBON.id || category.id === RYE.id ? [WHISKEY] : [];
  return {
    id: nextId++,
    brand,
    name,
    categoryId: category.id,
    category: category.name,
    categoryPath: [category, ...parents],
    distilleries: [],
    finishes: [],
    upc: null,
    ttbIds: [],
    proof: null,
    bottles: 0,
    ...extra,
  };
}

const BT = ["Buffalo Trace"];
const CATALOG: LabelDoc[] = [
  label("Pursuit Spirits", "Double Oak Spirit", BOURBON, { distilleries: ["Bardstown Bourbon Company"] }),
  label("Pursuit Spirits", "Double Oak Rye", RYE),
  label("Pursuit Spirits", "Bottled in Bond Rye", RYE),
  label("Woodford Reserve", "Double Oaked", BOURBON, { distilleries: ["Woodford Reserve"] }),
  label("Buffalo Trace", "Kentucky Straight Bourbon Whiskey", BOURBON, { distilleries: BT, upc: "080244009236" }),
  label("Buffalo Trace", "Kosher Wheat Recipe", BOURBON, { distilleries: BT }),
  label("Buffalo Trace", "Bourbon Cream", LIQUEUR, { distilleries: BT }),
  label("Eagle Rare", "10 Year", BOURBON, { distilleries: BT, bottles: 1 }),
  label("Weller", "Full Proof", BOURBON, { distilleries: BT, bottles: 3 }),
  label("Old Forester", "1920 Prohibition Style", BOURBON),
  label("Old Fitzgerald", "Bottled in Bond 8 Year", BOURBON),
  label("Hampden", "Pagos", RUM, { finishes: ["Sherry"], ttbIds: ["21132001000620"] }),
  label("E.H. Taylor", "Small Batch", BOURBON, { distilleries: BT }),
  label("Blanton's", "Single Barrel", BOURBON, { distilleries: BT }),
];

const names = (query: string, options: Parameters<typeof searchLabels>[2] = {}) =>
  searchLabels(CATALOG, query, options).hits.map((hit) => `${hit.doc.brand} ${hit.doc.name}`);

describe("words", () => {
  it("folds case, accents and apostrophes", () => {
    expect(words("Blanton's Añejo")).toEqual(["blantons", "anejo"]);
    expect(words("E.H. Taylor, Jr.")).toEqual(["e", "h", "taylor", "jr"]);
  });
});

describe("searchLabels", () => {
  it("matches a brand and a label name typed together, with no need to say which is which", () => {
    expect(names("Pursuit Double Oak").slice(0, 2).sort()).toEqual([
      "Pursuit Spirits Double Oak Rye",
      "Pursuit Spirits Double Oak Spirit",
    ]);
    expect(names("Pursuit Double Oak")).not.toContain("Woodford Reserve Double Oaked");
  });

  it("finds a label name across every brand, including the start of a longer word", () => {
    const found = names("Double Oak");
    expect(found).toEqual(
      expect.arrayContaining(["Pursuit Spirits Double Oak Spirit", "Pursuit Spirits Double Oak Rye", "Woodford Reserve Double Oaked"]),
    );
    expect(found).toHaveLength(3);
  });

  it("ranks a whole-name match first", () => {
    expect(names("Pursuit Spirits Double Oak Rye")[0]).toBe("Pursuit Spirits Double Oak Rye");
  });

  it("puts the brand's own label first and lists the distillery's other labels apart", () => {
    const result = searchLabels(CATALOG, "Buffalo Trace Bourbon");
    const first = result.hits[0]!;
    expect(`${first.doc.brand} ${first.doc.name}`).toBe("Buffalo Trace Kentucky Straight Bourbon Whiskey");
    expect(first.group).toBe("label");
    // The liqueur with "Bourbon" in its name still shows, as the brand's own label.
    expect(result.hits.find((hit) => hit.doc.name === "Bourbon Cream")?.group).toBe("label");

    const byDistillery = result.hits.filter((hit) => hit.group === "distillery");
    expect(byDistillery.map((hit) => hit.doc.brand)).toEqual(expect.arrayContaining(["Eagle Rare", "Weller"]));
    expect(byDistillery.every((hit) => hit.via === "Buffalo Trace")).toBe(true);
    // Every label-group hit comes before every distillery-group hit.
    const lastLabel = result.hits.map((hit) => hit.group).lastIndexOf("label");
    const firstDistillery = result.hits.map((hit) => hit.group).indexOf("distillery");
    expect(lastLabel).toBeLessThan(firstDistillery);
  });

  it("matches a category word, including a parent category", () => {
    expect(names("Pursuit rye")).toEqual(["Pursuit Spirits Double Oak Rye", "Pursuit Spirits Bottled in Bond Rye"]);
    expect(names("Pursuit whiskey")).toHaveLength(3);
  });

  it("forgives a typo in a longer word, but not in a short one", () => {
    expect(names("weler full")).toEqual(["Weller Full Proof"]);
    expect(names("bufalo trace kosher")).toEqual(["Buffalo Trace Kosher Wheat Recipe"]);
    expect(names("rum")).toEqual(["Hampden Pagos"]);
  });

  it("matches as you type", () => {
    expect(names("Pursuit Dou").slice(0, 2).sort()).toEqual(["Pursuit Spirits Double Oak Rye", "Pursuit Spirits Double Oak Spirit"]);
  });

  it("matches initials and possessives the way people type them", () => {
    expect(names("eh taylor")).toEqual(["E.H. Taylor Small Batch"]);
    expect(names("blantons")).toEqual(["Blanton's Single Barrel"]);
  });

  it("does not confuse brands that share a first word", () => {
    expect(names("old forester")).toEqual(["Old Forester 1920 Prohibition Style"]);
  });

  it("filters by category, counting categories before the filter", () => {
    const result = searchLabels(CATALOG, "Pursuit", { categoryId: RYE.id });
    expect(result.hits.map((hit) => hit.doc.name)).toEqual(["Double Oak Rye", "Bottled in Bond Rye"]);
    expect(result.facets).toEqual([
      { id: RYE.id, name: "Rye", count: 2 },
      { id: BOURBON.id, name: "Bourbon", count: 1 },
    ]);
  });

  it("includes child categories when filtering by a parent", () => {
    const found = names("Pursuit", { categoryId: WHISKEY.id });
    expect(found).toHaveLength(3);
  });

  it("finds a label by its barcode, with or without a leading zero", () => {
    expect(names("080244009236")).toEqual(["Buffalo Trace Kentucky Straight Bourbon Whiskey"]);
    expect(names("80244009236")).toEqual(["Buffalo Trace Kentucky Straight Bourbon Whiskey"]);
    expect(searchLabels(CATALOG, "080244009236").hits[0]!.exact).toBe(true);
  });

  it("finds a label by an attached TTB ID or registry link", () => {
    expect(names("21132001000620")).toEqual(["Hampden Pagos"]);
    expect(
      names("https://www.ttbonline.gov/colasonline/viewColaDetails.do?action=publicDisplaySearchBasic&ttbid=21132001000620"),
    ).toEqual(["Hampden Pagos"]);
  });

  it("reports an unknown code so a new label can start from it", () => {
    const result = searchLabels(CATALOG, "012345678905");
    expect(result.hits).toEqual([]);
    expect(result.code).toEqual({ kind: "upc", value: "012345678905" });
  });

  it("lists the newest labels when nothing is typed", () => {
    const result = searchLabels(CATALOG, "  ", { limit: 2 });
    expect(result.hits.map((hit) => hit.doc.id)).toEqual([CATALOG.at(-1)!.id, CATALOG.at(-2)!.id]);
    expect(result.total).toBe(CATALOG.length);
  });
});

describe("typedCode", () => {
  it("tells barcodes from TTB IDs and ordinary words", () => {
    expect(typedCode("0 80244 00923 6")).toEqual({ kind: "upc", value: "080244009236" });
    expect(typedCode("21132001000620")).toEqual({ kind: "ttb", value: "21132001000620" });
    expect(typedCode("Weller 12")).toBeNull();
    expect(typedCode("1920")).toBeNull();
  });
});

describe("guessNewLabel", () => {
  const brands = [
    { id: 10, name: "Pursuit Spirits" },
    { id: 11, name: "Old Forester" },
    { id: 12, name: "Old Fitzgerald" },
    { id: 13, name: "Buffalo Trace" },
  ];
  const categories = [BOURBON, RYE, { id: 6, name: "Straight Rye" }];

  it("recognises a brand on file even when its filler words are left off", () => {
    expect(guessNewLabel("Pursuit Double Oak Rye", brands, categories)).toEqual({
      brandId: 10,
      brandName: "Pursuit Spirits",
      name: "Double Oak Rye",
      categoryId: RYE.id,
    });
  });

  it("needs the whole distinctive part of a brand's name", () => {
    expect(guessNewLabel("Old Overholt Bonded", brands, categories)).toMatchObject({ brandId: null, name: "Old Overholt Bonded" });
    expect(guessNewLabel("Old Forester 1910", brands, categories)).toMatchObject({ brandId: 11, name: "1910" });
  });

  it("prefers the longest category named", () => {
    expect(guessNewLabel("Pursuit Straight Rye", brands, categories).categoryId).toBe(6);
  });

  it("keeps the words as typed", () => {
    expect(guessNewLabel("buffalo trace Kosher Rye", brands, categories)).toMatchObject({
      brandId: 13,
      name: "Kosher Rye",
    });
  });

  it("leaves a lone brand name to be the brand, with nothing guessed as the name", () => {
    expect(guessNewLabel("Buffalo Trace", brands, categories)).toMatchObject({ brandId: null, name: "Buffalo Trace" });
  });
});

describe("older names", () => {
  const doc = (over: Partial<LabelDoc>): LabelDoc => ({
    id: 1,
    brand: "Old Grand-Dad",
    name: "114",
    categoryId: 1,
    category: "Bourbon",
    categoryPath: [{ id: 1, name: "Bourbon" }],
    distilleries: [],
    finishes: [],
    upc: null,
    ttbIds: [],
    proof: null,
    bottles: 0,
    ...over,
  });

  it("finds a label under an older name", () => {
    const docs = [doc({ otherNames: ["Bonded Reserve"] }), doc({ id: 2, name: "Other" })];
    expect(searchLabels(docs, "bonded reserve").hits.map((h) => h.doc.id)).toEqual([1]);
    expect(searchLabels(docs, "nothing like it").hits).toEqual([]);
  });

  it("finds a label through an older distillery name, in the distillery group", () => {
    const hits = searchLabels([doc({ distilleries: ["Beam", "Hirsch"] })], "hirsch").hits;
    expect(hits).toHaveLength(1);
    expect(hits[0]!.group).toBe("distillery");
  });
});
