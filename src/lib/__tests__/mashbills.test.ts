import { describe, expect, it } from "vitest";
import {
  describeMashbill,
  ingredientColor,
  mashbillProblems,
  mashbillTitle,
  matchesMashbillCategory,
  normalizeGrainName,
  orderGrains,
  recipeKey,
  sumGrains,
} from "../mashbills";

describe("orderGrains", () => {
  it("leads with the grain that names the spirit, for a bourbon", () => {
    // 78/10/12 is written corn, rye, malted barley — even though the barley
    // is the larger of the last two. Percentage order alone would get this
    // backwards, which is the whole reason the convention list exists.
    const bourbon = [
      { grain: "Malted Barley", percent: 12, position: 3 },
      { grain: "Corn", percent: 78, position: 0 },
      { grain: "Rye", percent: 10, position: 1 },
    ];
    expect(orderGrains(bourbon).map((g) => g.grain)).toEqual(["Corn", "Rye", "Malted Barley"]);
  });

  it("sorts grains outside the convention last, biggest first", () => {
    const odd = [
      { grain: "Triticale", percent: 5 },
      { grain: "Corn", percent: 70 },
      { grain: "Oats", percent: 15 },
      { grain: "Malted Barley", percent: 10 },
    ];
    expect(orderGrains(odd).map((g) => g.grain)).toEqual(["Corn", "Malted Barley", "Oats", "Triticale"]);
  });

  it("and for a rye, without needing to be told which it is", () => {
    const rye = [
      { grain: "Corn", percent: 39, position: 0 },
      { grain: "Rye", percent: 51, position: 1 },
      { grain: "Malted Barley", percent: 10, position: 2 },
    ];
    expect(orderGrains(rye).map((g) => g.grain)).toEqual(["Rye", "Corn", "Malted Barley"]);
  });

  it("puts a wheated bourbon's wheat where a fixed column order would not", () => {
    const weller = [
      { grain: "Corn", percent: 70, position: 0 },
      { grain: "Wheat", percent: 16, position: 1 },
      { grain: "Malted Barley", percent: 14, position: 2 },
    ];
    expect(orderGrains(weller).map((g) => g.grain)).toEqual(["Corn", "Wheat", "Malted Barley"]);
  });

  it("breaks ties by the conventional order, so the result is stable", () => {
    const even = [
      { grain: "Wheat", percent: 25, position: 2 },
      { grain: "Corn", percent: 25, position: 1 },
      { grain: "Rye", percent: 50, position: 0 },
    ];
    expect(orderGrains(even).map((g) => g.grain)).toEqual(["Rye", "Corn", "Wheat"]);
  });

  it("does not mutate its input", () => {
    const grains = [
      { grain: "Rye", percent: 10 },
      { grain: "Corn", percent: 90 },
    ];
    orderGrains(grains);
    expect(grains[0]!.grain).toBe("Rye");
  });
});

describe("describeMashbill", () => {
  it("reads the way the user asked for it", () => {
    expect(
      describeMashbill([
        { grain: "Malted Barley", percent: "14.00" },
        { grain: "Corn", percent: "70.00" },
        { grain: "Wheat", percent: "16.00" },
      ]),
    ).toBe("70% Corn · 16% Wheat · 14% Malted Barley");
  });

  it("keeps a real fraction but drops trailing zeroes", () => {
    expect(describeMashbill([{ grain: "Corn", percent: "51.50" }])).toBe("51.5% Corn");
  });

  it("is empty for a recipe whose contents are not known", () => {
    expect(describeMashbill([])).toBe("");
  });
});

describe("sumGrains", () => {
  it("adds up, ignoring anything unparseable", () => {
    expect(sumGrains([{ grain: "Corn", percent: "70" }, { grain: "Wheat", percent: "30" }])).toBe(100);
    expect(sumGrains([{ grain: "Corn", percent: "" }, { grain: "Wheat", percent: "30" }])).toBe(30);
  });
});

describe("mashbillTitle", () => {
  it("is the recipe, even when a name was stored", () => {
    expect(mashbillTitle({ isSecret: false, name: "BBC High Rye" }, "60% Corn · 40% Rye")).toBe("60% Corn · 40% Rye");
  });

  it("is the reference name for a secret mashbill", () => {
    expect(mashbillTitle({ isSecret: true, name: "Buffalo Trace Wheated" }, "70% Corn")).toBe("Buffalo Trace Wheated");
    expect(mashbillTitle({ isSecret: true, name: " " }, "70% Corn")).toBe("70% Corn");
  });

  it("is the style for a generic mashbill, which has no recipe", () => {
    expect(mashbillTitle({ isSecret: false, isGeneric: true, name: "High Rye" }, "")).toBe("High Rye");
  });
});

describe("ingredientColor", () => {
  it("gives each common ingredient its own colour, whatever the case", () => {
    const colors = ["corn", "rye", "wheat", "malted barley", "sugarcane", "molasses", "agave"].map(ingredientColor);
    expect(new Set(colors).size).toBe(7);
    expect(ingredientColor("CORN")).toBe(ingredientColor("corn"));
  });

  it("gives an unlisted ingredient a steady colour", () => {
    expect(ingredientColor("Triticale")).toBe(ingredientColor("triticale"));
  });
});

describe("normalizeGrainName", () => {
  it("title-cases a grain typed in lowercase", () => {
    expect(normalizeGrainName("corn")).toBe("Corn");
    expect(normalizeGrainName("malted barley")).toBe("Malted Barley");
    expect(normalizeGrainName("  blue   corn ")).toBe("Blue Corn");
    expect(normalizeGrainName("heirloom-wheat")).toBe("Heirloom-Wheat");
  });

  it("gives a common grain its usual spelling, whatever the case", () => {
    expect(normalizeGrainName("MALTED barley")).toBe("Malted Barley");
    expect(normalizeGrainName("RYE")).toBe("Rye");
  });

  it("leaves a deliberate mixed case alone", () => {
    expect(normalizeGrainName("Bloody Butcher corn")).toBe("Bloody Butcher corn");
  });
});

describe("recipeKey", () => {
  it("matches the same recipe whatever the order, case or decimals", () => {
    const a = recipeKey([
      { grain: "Corn", percent: 78 },
      { grain: "Rye", percent: 10 },
      { grain: "Malted Barley", percent: "12" },
    ]);
    const b = recipeKey([
      { grain: "malted barley", percent: "12.00" },
      { grain: "corn", percent: "78.00" },
      { grain: " Rye ", percent: 10 },
    ]);
    expect(a).toBe(b);
  });

  it("tells different amounts apart", () => {
    expect(recipeKey([{ grain: "Corn", percent: 78 }, { grain: "Rye", percent: 22 }])).not.toBe(
      recipeKey([{ grain: "Corn", percent: 80 }, { grain: "Rye", percent: 20 }]),
    );
  });
});

describe("matchesMashbillCategory", () => {
  it("shows only mashbills with the defining grain at 51% or higher", () => {
    const bourbon = [{ grain: "Corn", percent: "51.00" }, { grain: "Rye", percent: 49 }];
    const rye = [{ grain: "Rye", percent: 50 }, { grain: "Malted Rye", percent: 1 }];
    expect(matchesMashbillCategory(bourbon, "bourbon")).toBe(true);
    expect(matchesMashbillCategory(bourbon, "rye")).toBe(false);
    expect(matchesMashbillCategory(rye, "rye")).toBe(true);
    expect(matchesMashbillCategory(rye, "bourbon")).toBe(false);
    expect(matchesMashbillCategory([{ grain: "Corn", percent: "50.99" }], "bourbon")).toBe(false);
  });

  it("keeps unknown and mixed recipes available in American Whiskey", () => {
    expect(matchesMashbillCategory([], "american-whiskey")).toBe(true);
    expect(matchesMashbillCategory([{ grain: "Corn", percent: 20 }], "american-whiskey")).toBe(true);
    expect(matchesMashbillCategory([], "rye")).toBe(false);
  });
});

describe("mashbillProblems", () => {
  const check = (overrides: Partial<Parameters<typeof mashbillProblems>[0]> = {}) => mashbillProblems({
    isSecret: false,
    isGeneric: false,
    isPartial: false,
    name: "",
    grains: [],
    category: null,
    ...overrides,
  });
  const recipe = (corn: number, rye: number, barley: number) => [
    { grain: "Corn", percent: corn },
    { grain: "Rye", percent: rye },
    { grain: "Malted Barley", percent: barley },
  ];

  it("accepts a 75/13/12 bourbon", () => {
    expect(check({ grains: recipe(75, 13, 12), category: "bourbon" })).toEqual([]);
  });

  it("explains how far a 75/13/10 recipe falls short", () => {
    expect(check({ grains: recipe(75, 13, 10) })).toEqual([
      { text: "The grains add up to 98%, not 100%. That is 2 short.", blocking: true },
    ]);
  });

  it("explains how far a 60/30/20 recipe goes over", () => {
    expect(check({ grains: recipe(60, 30, 20) })).toEqual([
      { text: "The grains add up to 110%, not 100%. That is 10 over.", blocking: true },
    ]);
  });

  it("accepts a partial disclosure of 30/20", () => {
    expect(check({ isPartial: true, grains: [{ grain: "Corn", percent: 30 }, { grain: "Rye", percent: 20 }] })).toEqual([]);
  });

  it("blocks a partial disclosure of 60/50", () => {
    expect(check({ isPartial: true, grains: [{ grain: "Corn", percent: 60 }, { grain: "Rye", percent: 50 }] })).toEqual([
      { text: "The disclosed grains exceed 100% (110%).", blocking: true },
    ]);
  });

  it("requires only a reference name for a secret without rows", () => {
    expect(check({ isSecret: true, name: "  ", category: "bourbon" })).toEqual([
      { text: "Give a secret mashbill a reference name, such as Buffalo Trace Wheated.", blocking: true },
    ]);
  });

  it("requires only a style name for an unnamed generic", () => {
    expect(check({ isGeneric: true, isSecret: true, name: "  " })).toEqual([
      { text: "Name the style, such as High Rye.", blocking: true },
    ]);
  });

  it("ignores invalid grains for a named generic", () => {
    expect(check({ isGeneric: true, name: "High Rye", grains: [{ grain: "", percent: 150 }], category: "rye" })).toEqual([]);
  });

  it("requires at least one ingredient for a public recipe", () => {
    expect(check({ category: "rye" })).toEqual([{ text: "Add at least one ingredient.", blocking: true }]);
  });

  it("requires a name for a row with a share", () => {
    expect(check({ grains: [{ grain: "", percent: "12" }] })[0]).toEqual({ text: "Name every ingredient.", blocking: true });
  });

  it("requires a share for a named row", () => {
    expect(check({ grains: [{ grain: "Corn", percent: "" }] })[0]).toEqual({ text: "Give every ingredient a share.", blocking: true });
  });

  it("reports duplicate names using the later row's spelling", () => {
    expect(check({ grains: [{ grain: "Corn", percent: 50 }, { grain: "corn ", percent: 50 }] })).toEqual([
      { text: "corn  is in there twice. Combine them into one row.", blocking: true },
    ]);
  });

  it("warns without blocking a 40/30/30 bourbon", () => {
    expect(check({ grains: recipe(40, 30, 30), category: "bourbon" })).toEqual([
      { text: "A bourbon mashbill is at least 51% corn.", blocking: false },
    ]);
  });

  it("warns about rye below 51% even when the total also blocks", () => {
    expect(check({ grains: [{ grain: "Rye", percent: 40 }], category: "rye" })).toEqual([
      { text: "The grains add up to 40%, not 100%. That is 60 short.", blocking: true },
      { text: "A rye mashbill is at least 51% rye.", blocking: false },
    ]);
  });

  it("accepts decimal shares totaling 100", () => {
    expect(check({ grains: [{ grain: "Rye", percent: "12.5" }, { grain: "Corn", percent: 87.5 }] })).toEqual([]);
  });

  it("ignores a completely empty extra row", () => {
    expect(check({ grains: [...recipe(75, 13, 12), { grain: "  ", percent: "  " }], category: "bourbon" })).toEqual([]);
  });

  it.each(["  ", "abc", "Infinity", 0, -5, NaN])("rejects invalid share %s", (percent) => {
    expect(check({ grains: [{ grain: "Corn", percent }] })[0]).toEqual({ text: "Give every ingredient a share.", blocking: true });
  });

  it("finds only the first duplicate, ignoring extra internal spaces", () => {
    expect(check({ grains: [
      { grain: "Malted Barley", percent: 25 },
      { grain: "malted   BARLEY", percent: 25 },
      { grain: "Malted Barley", percent: 50 },
    ] })).toEqual([{ text: "malted   BARLEY is in there twice. Combine them into one row.", blocking: true }]);
  });

  it.each([99, 101])("accepts the total tolerance boundary %s", (percent) => {
    expect(check({ grains: [{ grain: "Corn", percent }] })).toEqual([]);
  });

  it("rounds total and distance to two decimals without trailing zeros", () => {
    expect(check({ grains: [{ grain: "Corn", percent: 97.895 }] })).toEqual([
      { text: "The grains add up to 97.89%, not 100%. That is 2.11 short.", blocking: true },
    ]);
  });

  it("also checks totals for secret partial recipes", () => {
    expect(check({ isSecret: true, isPartial: true, name: "Reference", grains: [{ grain: "Corn", percent: 110 }] })).toEqual([
      { text: "The disclosed grains exceed 100% (110%).", blocking: true },
    ]);
  });

  it("orders name, row, duplicate, total and category problems", () => {
    expect(check({ isSecret: true, category: "bourbon", grains: [
      { grain: "", percent: 10 }, { grain: "Rye", percent: "" }, { grain: "rye", percent: 10 },
    ] }).map(({ text }) => text)).toEqual([
      "Give a secret mashbill a reference name, such as Buffalo Trace Wheated.",
      "Name every ingredient.",
      "Give every ingredient a share.",
      "rye is in there twice. Combine them into one row.",
      "The grains add up to 20%, not 100%. That is 80 short.",
      "A bourbon mashbill is at least 51% corn.",
    ]);
  });
});
