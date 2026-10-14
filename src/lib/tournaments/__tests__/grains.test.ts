import { describe, expect, it } from "vitest";
import { grainFamily, mashbillDisplay, mashbillKey } from "../grains";
import type { Grain, MashbillInput } from "../types";

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

describe("mashbillDisplay", () => {
  it("prefers a name, then the shares by size, then the style", () => {
    expect(mashbillDisplay(recipe([["Corn", 75]], "Buffalo Trace High Rye"))).toBe("Buffalo Trace High Rye");
    expect(mashbillDisplay(recipe([["Malted Barley", 5], ["Rye", 95]]))).toBe("95/5");
    expect(mashbillDisplay({ kind: "generic", style: " High Rye " })).toBe("High Rye");
  });
});
