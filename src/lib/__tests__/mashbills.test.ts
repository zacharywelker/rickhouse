import { describe, expect, it } from "vitest";
import { describeMashbill, orderGrains, sumGrains } from "../mashbills";

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
