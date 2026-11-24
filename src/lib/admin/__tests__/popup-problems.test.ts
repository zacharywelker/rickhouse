import { describe, expect, it } from "vitest";
import { hasBlocking, titleCase, type Problem } from "../popup-problems";

describe("titleCase", () => {
  it("collapses spaces and capitalises each word", () => {
    expect(titleCase("  port  CASK ")).toBe("Port Cask");
  });

  it("keeps known abbreviations upper case", () => {
    expect(titleCase("px sherry")).toBe("PX Sherry");
    expect(titleCase("nas vsop xo")).toBe("NAS VSOP XO");
  });

  it("keeps an apostrophe's following letter lower case", () => {
    expect(titleCase("angel's envy")).toBe("Angel's Envy");
  });

  it("capitalises after a hyphen", () => {
    expect(titleCase("single-barrel select")).toBe("Single-Barrel Select");
  });

  it("leaves a word with an internal capital as typed", () => {
    expect(titleCase("mckenna DeKuyper McKenna")).toBe("Mckenna DeKuyper McKenna");
  });

  it("capitalises the first letter after an opening bracket", () => {
    expect(titleCase("weller (low rye)")).toBe("Weller (Low Rye)");
  });

  it("capitalises an accented first letter, not a later one", () => {
    expect(titleCase("élan")).toBe("Élan");
    expect(titleCase("ÉLAN vital")).toBe("Élan Vital");
    expect(titleCase("áñejo reserva")).toBe("Áñejo Reserva");
    expect(titleCase("(élan)")).toBe("(Élan)");
  });

  it("returns an empty string for blanks", () => {
    expect(titleCase("   ")).toBe("");
  });
});

describe("hasBlocking", () => {
  const warn: Problem = { text: "x", blocking: false };
  const block: Problem = { text: "y", blocking: true };

  it("is true only when a problem blocks", () => {
    expect(hasBlocking([])).toBe(false);
    expect(hasBlocking([warn])).toBe(false);
    expect(hasBlocking([warn, block])).toBe(true);
  });
});
