import { describe, expect, it } from "vitest";
import { mashbillClass } from "../grains";
import { autoLabel, isWineFinish } from "../flight-title";
import { autoLabel as viaGrouping } from "../grouping";
import type { Entrant, MashbillInput } from "../types";

const generic = (style: string): MashbillInput => ({ kind: "generic", style });
const recipe = (grains: [string, number][], name: string | null = null): MashbillInput => ({
  kind: "recipe", name, grains: grains.map(([grain, percent]) => ({ grain, percent })),
});
/** A bourbon-style recipe with `rye` points of rye, 10 of barley, the rest corn. */
const ryeShare = (rye: number): MashbillInput => recipe([["Corn", 90 - rye], ["Rye", rye], ["Malted Barley", 10]]);
const e = (id: number, over: Partial<Entrant> = {}): Entrant => ({
  id, name: `b${id}`, proof: null, mashbill: null, distilleries: [], ageYears: null, finishes: [], category: null, ...over,
});
const two = (over: Partial<Entrant>, over2: Partial<Entrant> = over) => [e(1, over), e(2, over2)];

describe("mashbillClass", () => {
  it("names rye shares by the owner's thresholds", () => {
    expect(mashbillClass(ryeShare(20))).toBe("High rye");
    expect(mashbillClass(ryeShare(35))).toBe("High rye");
    expect(mashbillClass(ryeShare(19))).toBeNull();
    expect(mashbillClass(ryeShare(13))).toBeNull();
    expect(mashbillClass(ryeShare(12))).toBe("Low rye");
    expect(mashbillClass(ryeShare(8))).toBe("Low rye");
  });
  it("adds up every grain of the rye family", () => {
    expect(mashbillClass(recipe([["Corn", 60], ["Rye", 12], ["Malted Rye", 8], ["Barley", 20]]))).toBe("High rye");
  });
  it("calls wheat the flavoring grain only without a rye flavoring", () => {
    expect(mashbillClass(recipe([["Corn", 72], ["Red Winter Wheat", 16], ["Malted Barley", 12]]))).toBe("Wheated");
    expect(mashbillClass(recipe([["Corn", 60], ["Wheat", 16], ["Rye", 14], ["Malted Barley", 10]]))).toBeNull();
    expect(mashbillClass(recipe([["Corn", 80], ["Wheat", 9], ["Malted Barley", 11]]))).toBe("Low rye");
  });
  it("maps a generic style by name and is null for the rest", () => {
    expect(mashbillClass(generic("High Rye"))).toBe("High rye");
    expect(mashbillClass(generic(" low rye "))).toBe("Low rye");
    expect(mashbillClass(generic("Wheated"))).toBe("Wheated");
    expect(mashbillClass(generic("Four Grain"))).toBeNull();
    expect(mashbillClass(generic("constructor"))).toBeNull();
    expect(mashbillClass({ kind: "blend" })).toBeNull();
    expect(mashbillClass(recipe([]))).toBeNull();
    expect(mashbillClass(null)).toBeNull();
  });
});

describe("isWineFinish", () => {
  it("knows the wine-based finishes and not the rest", () => {
    for (const f of ["Port cask", "Oloroso Sherry", "PX", "Pedro Ximenez", "Fino", "Amontillado", "Cream sherry", "Madeira", "Marsala", "Sauternes", "Tokaji", "Vermouth", "Red wine", "Cabernet Sauvignon", "Merlot", "Pinot Noir", "Zinfandel", "Syrah", "Shiraz", "Malbec", "Bordeaux", "Burgundy", "Champagne"]) {
      expect(isWineFinish(f), f).toBe(true);
    }
    for (const f of ["Rum cask", "Maple syrup", "Toasted oak", "Cognac", "Portugal oak"]) expect(isWineFinish(f), f).toBe(false);
  });
});

describe("autoLabel", () => {
  it("is exported through grouping too", () => {
    expect(viaGrouping).toBe(autoLabel);
  });

  it("names bourbons and ryes by category", () => {
    expect(autoLabel(two({ category: "Bourbon" }))).toBe("Bourbons");
    expect(autoLabel(two({ category: "Rye" }))).toBe("Ryes");
    expect(autoLabel(two({ category: "Single Malt" }))).toBe("Single malts");
    expect(autoLabel(two({ category: "Irish Whiskey" }))).toBe("Irish whiskeys");
    expect(autoLabel(two({ category: "Bourbon" }, { category: "bourbon" }))).toBe("Bourbons");
  });

  it("qualifies by rye share: 20 high, 19 and 13 nothing, 12 low", () => {
    const at = (rye: number) => autoLabel(two({ category: "Bourbon", mashbill: ryeShare(rye) }));
    expect(at(20)).toBe("High rye bourbons");
    expect(at(19)).toBe("Bourbons");
    expect(at(13)).toBe("Bourbons");
    expect(at(12)).toBe("Low rye bourbons");
  });

  it("needs every bottle in the same mashbill class", () => {
    expect(autoLabel([e(1, { category: "Bourbon", mashbill: ryeShare(25) }), e(2, { category: "Bourbon", mashbill: ryeShare(10) })])).toBe("Bourbons");
    expect(autoLabel([e(1, { category: "Bourbon", mashbill: ryeShare(25) }), e(2, { category: "Bourbon" })])).toBe("Bourbons");
  });

  it("names wheated bourbons, from a recipe or a generic style", () => {
    const wheat = recipe([["Corn", 70], ["Wheat", 18], ["Malted Barley", 12]]);
    expect(autoLabel(two({ category: "Bourbon", mashbill: wheat }))).toBe("Wheated bourbons");
    expect(autoLabel(two({ category: "Bourbon", mashbill: generic("Wheated") }))).toBe("Wheated bourbons");
    expect(autoLabel(two({ category: "Bourbon", mashbill: generic("High Rye") }))).toBe("High rye bourbons");
    expect(autoLabel(two({ category: "Bourbon", mashbill: generic("Low Rye") }))).toBe("Low rye bourbons");
    expect(autoLabel([e(1, { category: "Bourbon", mashbill: wheat }), e(2, { category: "Bourbon", mashbill: generic("Wheated") })])).toBe("Wheated bourbons");
  });

  it("notes a wine finish, else Finished, else nothing", () => {
    expect(autoLabel(two({ category: "Rye", finishes: ["Port cask"] }))).toBe("Wine-finished ryes");
    expect(autoLabel([e(1, { category: "Bourbon", finishes: ["Rum cask", "Sherry"] }), e(2, { category: "Bourbon", finishes: ["Madeira"] })])).toBe("Wine-finished bourbons");
    expect(autoLabel([e(1, { category: "Bourbon", finishes: ["Port"] }), e(2, { category: "Bourbon", finishes: ["Rum cask"] })])).toBe("Finished bourbons");
    expect(autoLabel(two({ category: "Bourbon", finishes: ["Rum cask"] }))).toBe("Finished bourbons");
    expect(autoLabel([e(1, { category: "Bourbon", finishes: ["Port"] }), e(2, { category: "Bourbon" })])).toBe("Bourbons");
  });

  it("combines mashbill and finish", () => {
    expect(autoLabel(two({ category: "Bourbon", mashbill: generic("High Rye"), finishes: ["Port"] }))).toBe("High rye, wine-finished bourbons");
    expect(autoLabel(two({ category: "Bourbon", mashbill: generic("Wheated"), finishes: ["Rum cask"] }))).toBe("Wheated, finished bourbons");
  });

  it("puts a shared distillery in front", () => {
    const bt = { category: "Bourbon", mashbill: generic("High Rye"), distilleries: ["Buffalo Trace"] };
    expect(autoLabel(two(bt))).toBe("Buffalo Trace · High rye bourbons");
    expect(autoLabel(two({ category: "Bourbon", distilleries: ["Buffalo Trace"] }, { category: "Bourbon", distilleries: ["buffalo trace"] }))).toBe("Buffalo Trace · Bourbons");
    expect(autoLabel(two({ category: "Bourbon", distilleries: ["A", "B"] }, { category: "Bourbon", distilleries: ["C", "D"] }))).toBe("Blend · Bourbons");
    expect(autoLabel(two({ category: "Bourbon", distilleries: ["X"] }, { category: "Bourbon", distilleries: ["Y"] }))).toBe("Bourbons");
  });

  it("falls back without a shared category: qualifiers, distillery, mashbill name, Mixed", () => {
    expect(autoLabel([e(1, { category: "Bourbon", mashbill: generic("High Rye") }), e(2, { category: "Rye", mashbill: generic("High Rye") })])).toBe("High rye");
    expect(autoLabel([e(1, { category: "Bourbon", distilleries: ["MGP"] }), e(2, { category: "Rye", distilleries: ["MGP"] })])).toBe("MGP");
    expect(autoLabel([e(1, { category: "Bourbon", distilleries: ["MGP"], mashbill: generic("High Rye") }), e(2, { category: "Rye", distilleries: ["MGP"], mashbill: generic("High Rye") })])).toBe("MGP · High rye");
    const mid = (name: string | null) => recipe([["Corn", 75], ["Rye", 15], ["Malted Barley", 10]], name);
    expect(autoLabel(two({ mashbill: mid(null), distilleries: ["MGP"] }))).toBe("MGP · 75/15/10");
    expect(autoLabel(two({ mashbill: mid("Secret Mash") }))).toBe("Secret Mash");
    expect(autoLabel(two({ mashbill: recipe([["Rye", 95], ["Malted Barley", 5]]) }))).toBe("High rye");
    expect(autoLabel([e(1, { category: "Bourbon" }), e(2, { category: "Rye" })])).toBe("Mixed");
  });

  it("does not say a distillery twice when the mashbill name has it", () => {
    const bt = recipe([["Corn", 70], ["Rye", 15], ["Malted Barley", 15]], "Buffalo Trace High Rye");
    expect(autoLabel(two({ mashbill: bt, distilleries: ["Buffalo Trace"] }))).toBe("Buffalo Trace High Rye");
  });

  it("names a lone bottle (a bye) in the singular from its own facts", () => {
    expect(autoLabel([e(1, { category: "Bourbon", mashbill: ryeShare(25), finishes: ["Port"] })])).toBe("High rye, wine-finished bourbon");
    expect(autoLabel([e(1, { category: "Rye", distilleries: ["MGP"] })])).toBe("MGP · Rye");
    expect(autoLabel([e(1)])).toBe("Mixed");
  });

  it("copes with unknown data and an empty flight", () => {
    expect(autoLabel(two({}))).toBe("Mixed");
    expect(autoLabel(two({ distilleries: ["  "], finishes: ["  "], category: "  " }))).toBe("Mixed");
    expect(autoLabel([])).toBeNull();
  });
});
