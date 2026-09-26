import { describe, expect, it } from "vitest";
import type { ExpressionRow } from "../queries";
import { changesFor, describeAgeParts, editableFrom, fieldGroupOf } from "../label-edits";

const row: ExpressionRow = {
  id: 7,
  name: "Double Oak Spirit",
  slug: "double-oak-spirit",
  description: null,
  brand: "Pursuit Spirits",
  brandId: 3,
  category: "Bourbon",
  categoryId: 11,
  fieldGroup: "whiskey",
  proof: "108.00",
  abv: "54.00",
  ageStatement: null,
  ageYears: "4.0",
  ageMonths: null,
  ageDays: null,
  isCaskStrength: false,
  isStraight: true,
  isNas: false,
  isBottledInBond: false,
  entryProof: null,
  isChillFiltered: true,
  colorAdded: null,
  charLevel: null,
  stillType: null,
  estate: null,
  marque: null,
  molassesOrCane: null,
  esterGl: "150.00",
  sugarGPerL: null,
  tropicalYears: null,
  continentalYears: null,
  isSolera: false,
  soleraRange: null,
  agaveType: null,
  agaveRegion: null,
  cookingMethod: null,
  extraction: null,
  isAdditiveFree: null,
  msrp: "64.99",
  sizeMl: 750,
  upc: null,
  labelNotes: null,
  bottleCount: 1,
  pickCount: 0,
  links: {
    distilleries: [{ id: 1, label: "Bardstown", amount: "60" }],
    mashbills: [],
    finishes: [],
  },
};

describe("editableFrom", () => {
  it("starts from the same values the edit page would", () => {
    const values = editableFrom(row);
    expect(values.proof).toBe("108");
    expect(values.brandId).toBe("3");
    expect(values.isStraight).toBe(true);
    expect(values.ageMonths).toBe("");
    expect(values.sizeMl).toBe("750");
  });

  it("reads a stored yes/no/unknown as its option, not as unknown", () => {
    const values = editableFrom(row);
    expect(values.isChillFiltered).toBe("true");
    expect(values.isSolera).toBe("false");
    expect(values.colorAdded).toBe("");
  });
});

describe("changesFor", () => {
  it("is nothing when nothing changed", () => {
    expect(changesFor(editableFrom(row), editableFrom(row), "whiskey")).toBeNull();
  });

  it("sends only the fields that changed", () => {
    const edit = { ...editableFrom(row), msrp: "69.99", upc: "080686001409" };
    expect(changesFor(editableFrom(row), edit, "whiskey")).toEqual({ msrp: "69.99", upc: "080686001409" });
  });

  it("ignores a change to a section the category does not use", () => {
    // Esters on a bourbon: hidden on the form, dropped by the server, so not
    // an unsaved change either.
    const edit = { ...editableFrom(row), esterGl: "400" };
    expect(changesFor(editableFrom(row), edit, "whiskey")).toBeNull();
    expect(changesFor(editableFrom(row), edit, "rum")).toEqual({ esterGl: "400" });
  });

  it("sends all three lists when any one of them changed", () => {
    const edit = {
      ...editableFrom(row),
      finishLinks: [{ id: 9, label: "Port", amount: "6" }],
    };
    const changes = changesFor(editableFrom(row), edit, "whiskey")!;
    expect(Object.keys(changes).sort()).toEqual(["distilleryLinks", "finishLinks", "mashbillLinks"]);
    expect(JSON.parse(changes.finishLinks as string)).toEqual([{ id: 9, amount: "6", distilleryId: null }]);
    expect(JSON.parse(changes.distilleryLinks as string)).toEqual([{ id: 1, amount: "60", distilleryId: null }]);
  });
});

describe("fieldGroupOf", () => {
  it("follows an edited category before it is saved", () => {
    const groups = { 11: "whiskey", 20: "rum" } as const;
    expect(fieldGroupOf(row, undefined, groups)).toBe("whiskey");
    expect(fieldGroupOf(row, { ...editableFrom(row), categoryId: "20" }, groups)).toBe("rum");
  });
});

describe("describeAgeParts", () => {
  it.each([
    [["12.0", null, null], "12y"],
    [["4.0", 3, null], "4y 3m"],
    [["10", "2", "14"], "10y 2m 14d"],
    [[null, 0, 45], "45d"],
    [[null, null, null], null],
  ] as const)("%j -> %s", ([years, months, days], expected) => {
    expect(describeAgeParts(years, months, days)).toBe(expected);
  });
});
