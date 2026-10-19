import { describe, expect, it } from "vitest";
import { grainFamily, mashbillDisplay, mashbillKey } from "../grains";
import { sortEntrants } from "../keys";
import type { Entrant, Grain, MashbillInput } from "../types";

const recipe = (grains: [string, number][], name: string | null = null): MashbillInput => ({
  kind: "recipe",
  grains: grains.map(([grain, percent]): Grain => ({ grain, percent })),
  name,
});

describe("grainFamily", () => {
  it("groups the names the app suggests", () => {
    expect(grainFamily("Corn")).toBe("corn");
    expect(grainFamily("Rye")).toBe("rye");
    expect(grainFamily("Malted Rye")).toBe("rye");
    expect(grainFamily("Wheat")).toBe("wheat");
    expect(grainFamily("  malted   WHEAT ")).toBe("wheat");
    expect(grainFamily("Malted Barley")).toBe("malt");
    expect(grainFamily("barley")).toBe("malt");
    expect(grainFamily("Malt")).toBe("malt");
  });

  it("gives any other grain its own family", () => {
    expect(grainFamily("Oats")).toBe("oats");
    expect(grainFamily("Triticale")).toBe("triticale");
  });
});

describe("mashbillKey", () => {
  it("is null when there is no mashbill, or a generic style it does not know", () => {
    expect(mashbillKey(null)).toBeNull();
    expect(mashbillKey({ kind: "generic", style: "Mystery" })).toBeNull();
  });

  it("puts 75/21/4 and 68/20/12 in the same flavoring band but apart on barley", () => {
    const a = mashbillKey(recipe([["Corn", 75], ["Rye", 21], ["Malted Barley", 4]]))!;
    const b = mashbillKey(recipe([["Corn", 68], ["Rye", 20], ["Malted Barley", 12]]))!;
    expect(a.band).toEqual([1, "rye", 4, 0]);
    expect(b.band).toEqual([1, "rye", 4, 2]);
  });

  it("is null for a recipe with no grains", () => {
    expect(mashbillKey(recipe([]))).toBeNull();
  });

  it("puts 60/36/4 in a different rye band", () => {
    expect(mashbillKey(recipe([["Corn", 60], ["Rye", 36], ["Malted Barley", 4]]))!.band).toEqual([1, "rye", 7, 0]);
  });

  it("ignores a grain under 10 points when finding the flavoring grain", () => {
    expect(mashbillKey(recipe([["Corn", 81], ["Rye", 9], ["Malted Barley", 10]]))!.band).toEqual([0, "", 16, 2]);
  });

  it("gives four grain and oats classes of their own", () => {
    expect(mashbillKey(recipe([["Corn", 63], ["Rye", 12], ["Wheat", 12], ["Malted Barley", 13]]))!.band).toEqual([2, "2rye+wheat", 2, 2, 2]);
    expect(mashbillKey(recipe([["Corn", 70], ["Oats", 20], ["Malted Barley", 10]]))!.band).toEqual([1, "oats", 4, 2]);
  });

  it("calls a mostly malted barley recipe malt, and several mashbills a blend", () => {
    expect(mashbillKey(recipe([["Malted Barley", 100]]))!.band).toEqual([3, "", 20]);
    expect(mashbillKey({ kind: "blend" })!.band).toEqual([4]);
  });
});

describe("generic styles", () => {
  const style = (name: string): MashbillInput => ({ kind: "generic", style: name });

  it("knows only its own styles, not inherited object properties", () => {
    expect(mashbillKey(style("constructor"))).toBeNull();
    expect(mashbillKey(style("toString"))).toBeNull();
  });

  it("ignores case and runs of whitespace", () => {
    expect(mashbillKey(style("High  Rye"))).toEqual(mashbillKey(style("High Rye")));
    expect(mashbillKey(style("High  Rye"))).not.toBeNull();
    expect(mashbillKey(style("  high\trye "))).toEqual(mashbillKey(style("High Rye")));
  });
});

describe("mashbillDisplay", () => {
  it("prefers a name, then the shares by size, then the style", () => {
    expect(mashbillDisplay(recipe([["Corn", 75]], "Buffalo Trace High Rye"))).toBe("Buffalo Trace High Rye");
    expect(mashbillDisplay(recipe([["Malted Barley", 5], ["Rye", 95]]))).toBe("95/5");
    expect(mashbillDisplay({ kind: "generic", style: " High Rye " })).toBe("High Rye");
  });
});

describe("sorting by mashbill alone", () => {
  const cases: [string, MashbillInput][] = [
    ["75/21/4", recipe([["Corn", 75], ["Rye", 21], ["Malted Barley", 4]])],
    ["68/20/12", recipe([["Corn", 68], ["Rye", 20], ["Malted Barley", 12]])],
    ["60/36/4", recipe([["Corn", 60], ["Rye", 36], ["Malted Barley", 4]])],
    ["generic High Rye", { kind: "generic", style: "High Rye" }],
    ["generic Low Rye", { kind: "generic", style: "Low Rye" }],
    ["75/13/12", recipe([["Corn", 75], ["Rye", 13], ["Malted Barley", 12]])],
    ["70/16/14 wheated", recipe([["Corn", 70], ["Wheat", 16], ["Malted Barley", 14]])],
    ["generic Wheated", { kind: "generic", style: "Wheated" }],
    ["63/12/12/13 four grain", recipe([["Corn", 63], ["Rye", 12], ["Wheat", 12], ["Malted Barley", 13]])],
    ["generic Four Grain", { kind: "generic", style: "Four Grain" }],
    ["70/20/10 oats", recipe([["Corn", 70], ["Oats", 20], ["Malted Barley", 10]])],
    ["51/39/10 rye", recipe([["Rye", 51], ["Corn", 39], ["Malted Barley", 10]])],
    ["95/5 rye", recipe([["Rye", 95], ["Malted Barley", 5]])],
    ["81/9/10 corn", recipe([["Corn", 81], ["Rye", 9], ["Malted Barley", 10]])],
    ["100 malt", recipe([["Malted Barley", 100]])],
  ];

  it("orders them so that similar mashbills are neighbors", () => {
    const entrants: Entrant[] = cases.map(([name, mashbill], index) => ({
      id: index + 1, name, proof: null, mashbill, distilleries: [], ageYears: null, finishes: [], category: null,
    }));
    expect(sortEntrants(entrants, ["mashbill", "proof", "distillery", "age", "finish"]).map((e) => e.name)).toEqual([
      "81/9/10 corn",
      "70/20/10 oats",
      "75/13/12",
      "generic Low Rye",
      "75/21/4",
      "68/20/12",
      "generic High Rye",
      "60/36/4",
      "51/39/10 rye",
      "95/5 rye",
      "70/16/14 wheated",
      "generic Wheated",
      "63/12/12/13 four grain",
      "generic Four Grain",
      "100 malt",
    ]);
  });
});
