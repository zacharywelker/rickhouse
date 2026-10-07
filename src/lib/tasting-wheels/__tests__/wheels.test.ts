import { describe, expect, it } from "vitest";
import { WHEELS, WHEEL_IDS, categoryWheelMap, descriptorKey, descriptorsOf, findDescriptor, slugify, unknownTags, wheelForApi, wheelForCategory } from "..";

describe("slugify", () => {
  it("drops accents, apostrophes and punctuation", () => {
    expect(slugify("Oak (fresh)")).toBe("oak-fresh");
    expect(slugify("crème brûlée")).toBe("creme-brulee");
    expect(slugify("barber's shop")).toBe("barbers-shop");
    expect(slugify("Dr Pepper")).toBe("dr-pepper");
    expect(slugify("humus/oak moss")).toBe("humus-oak-moss");
  });
});

describe("the wheels", () => {
  it("has every wheel, with the categories read from each source", () => {
    expect(WHEEL_IDS.length).toBe(6);
    expect(Object.fromEntries(WHEEL_IDS.map((id) => [id, WHEELS[id].categories.length]))).toEqual({
      bourbon: 16,
      whisky: 8,
      rum: 7,
      agave: 8,
      brandy: 9,
      gin: 13,
    });
  });

  it.each(WHEEL_IDS)("%s: every word is real, and no word repeats inside its group", (id) => {
    for (const category of WHEELS[id].categories) {
      expect(category.name.trim()).not.toBe("");
      expect(category.groups.length).toBeGreaterThan(0);
      for (const group of category.groups) {
        expect(group.descriptors.length).toBeGreaterThan(0);
        group.descriptors.forEach((word) => expect(word.trim()).not.toBe(""));
        const slugs = group.descriptors.map(slugify);
        expect(new Set(slugs).size).toBe(slugs.length);
      }
    }
  });

  it.each(WHEEL_IDS)("%s: every descriptor has its own key, and the key finds it again", (id) => {
    const all = descriptorsOf(WHEELS[id]);
    expect(all.length).toBeGreaterThan(20);
    expect(new Set(all.map((d) => d.key)).size).toBe(all.length);
    for (const d of all) {
      expect(d.key.startsWith(`${id}/`)).toBe(true);
      expect(findDescriptor(d.key)).toEqual(d);
    }
  });

  it("keeps a word that appears twice apart by its path", () => {
    // "cranberry" is under both Berry and Dried on the rum wheel; "bitter" under Flawed twice on the bourbon wheel.
    expect(descriptorKey("rum", "Fruity", "Berry", "cranberry")).not.toBe(descriptorKey("rum", "Fruity", "Dried", "cranberry"));
    expect(findDescriptor("rum/fruity/berry/cranberry")?.group).toBe("Berry");
    expect(findDescriptor("rum/fruity/dried/cranberry")?.group).toBe("Dried");
    expect(findDescriptor("bourbon/flawed/burnt-mash/bitter")).not.toBeNull();
    expect(findDescriptor("bourbon/flawed/over-extracted-wood/bitter")).not.toBeNull();
  });

  it("labels descriptors with a capital and leaves a wheel with no middle ring without a group", () => {
    expect(findDescriptor("bourbon/fruity/citrus/lemon")?.label).toBe("Lemon");
    expect(findDescriptor("brandy/woody/cedarwood")).toEqual({ key: "brandy/woody/cedarwood", label: "Cedarwood", category: "Woody", group: null });
    expect(findDescriptor("gin/piney/juniper")?.category).toBe("Piney");
  });

  it("returns null for a key no wheel has", () => {
    expect(findDescriptor("bourbon/fruity/citrus/durian")).toBeNull();
    expect(findDescriptor("nonsense")).toBeNull();
  });
});

describe("wheelForCategory", () => {
  it("gives American whiskey the Bourbon wheel and every other whiskey the Whisky wheel", () => {
    expect(wheelForCategory({ fieldGroup: "whiskey", slugs: ["bourbon", "american-whiskey", "whiskey"] })).toBe("bourbon");
    expect(wheelForCategory({ fieldGroup: "whiskey", slugs: ["american-single-malt", "american-whiskey", "whiskey"] })).toBe("bourbon");
    expect(wheelForCategory({ fieldGroup: "whiskey", slugs: ["american-whiskey", "whiskey"] })).toBe("bourbon");
    expect(wheelForCategory({ fieldGroup: "whiskey", slugs: ["scotch", "whiskey"] })).toBe("whisky");
    expect(wheelForCategory({ fieldGroup: "whiskey", slugs: ["irish-whiskey", "whiskey"] })).toBe("whisky");
    expect(wheelForCategory({ fieldGroup: "whiskey", slugs: ["japanese-whisky", "whiskey"] })).toBe("whisky");
  });

  it("maps the other families that have a wheel, and nothing for the rest", () => {
    expect(wheelForCategory({ fieldGroup: "rum", slugs: ["rum"] })).toBe("rum");
    expect(wheelForCategory({ fieldGroup: "agave", slugs: ["tequila", "agave"] })).toBe("agave");
    expect(wheelForCategory({ fieldGroup: "brandy", slugs: ["cognac", "brandy"] })).toBe("brandy");
    expect(wheelForCategory({ fieldGroup: "gin", slugs: ["gin"] })).toBe("gin");
    expect(wheelForCategory({ fieldGroup: "vodka", slugs: ["vodka"] })).toBeNull();
    expect(wheelForCategory({ fieldGroup: "liqueur", slugs: ["amaro"] })).toBeNull();
    expect(wheelForCategory({ fieldGroup: "other", slugs: ["other"] })).toBeNull();
  });
});

describe("unknownTags", () => {
  it("passes real descriptors of the label's wheel", () => {
    expect(unknownTags("bourbon", ["bourbon/fruity/citrus/lemon", "bourbon/woody/baked/creme-brulee"])).toEqual([]);
  });

  it("flags keys from another wheel, made-up keys, and anything when the family has no wheel", () => {
    expect(unknownTags("bourbon", ["rum/fruity/citrus/lemon", "bourbon/fruity/citrus/durian", "lemon"])).toEqual([
      "rum/fruity/citrus/lemon",
      "bourbon/fruity/citrus/durian",
      "lemon",
    ]);
    expect(unknownTags(null, ["bourbon/fruity/citrus/lemon"])).toEqual(["bourbon/fruity/citrus/lemon"]);
    expect(unknownTags(null, [])).toEqual([]);
  });
});

describe("wheelForApi", () => {
  it("carries each descriptor's key and label under its category and subcategory", () => {
    const api = wheelForApi(WHEELS.gin);
    expect(api.id).toBe("gin");
    expect(api.categories[0]).toEqual({
      name: "Heat",
      groups: [{ name: null, descriptors: expect.arrayContaining([{ key: "gin/heat/ginger", label: "Ginger" }]) }],
    });
  });
});

describe("categoryWheelMap", () => {
  const tree = [
    { id: 1, slug: "whiskey", parentId: null, fieldGroup: "whiskey" },
    { id: 2, slug: "american-whiskey", parentId: 1, fieldGroup: "whiskey" },
    { id: 3, slug: "scotch", parentId: 1, fieldGroup: "whiskey" },
    { id: 4, slug: "bourbon", parentId: 2, fieldGroup: "whiskey" },
    { id: 5, slug: "rum", parentId: null, fieldGroup: "rum" },
    { id: 6, slug: "vodka", parentId: null, fieldGroup: "vodka" },
  ];

  it("walks up the parents, so a child of American whiskey gets the Bourbon wheel", () => {
    const map = categoryWheelMap(tree);
    expect(map.get(4)).toBe("bourbon");
    expect(map.get(2)).toBe("bourbon");
    expect(map.get(3)).toBe("whisky");
    expect(map.get(1)).toBe("whisky");
    expect(map.get(5)).toBe("rum");
    expect(map.get(6)).toBeNull();
  });

  it("does not hang on a parent loop", () => {
    const map = categoryWheelMap([
      { id: 1, slug: "a", parentId: 2, fieldGroup: "whiskey" },
      { id: 2, slug: "b", parentId: 1, fieldGroup: "whiskey" },
    ]);
    expect(map.get(1)).toBe("whisky");
  });
});
