import { describe, expect, it } from "vitest";
import type { CategoryKind } from "@/lib/expressions/rules";
import { companyPrefill, countryForKind, placeIdentifier } from "../distillery-defaults";

describe("countryForKind", () => {
  it.each<[CategoryKind, string | null]>([
    ["tequila", "Mexico"],
    ["mezcal", "Mexico"],
    ["cognac", "France"],
    ["armagnac", "France"],
    ["calvados", "France"],
    ["pisco", "Peru"],
    ["canadian", "Canada"],
    ["irish", "Ireland"],
    ["scotch", "Scotland"],
    ["american", "USA"],
    ["gin", null],
    ["genever", null],
    ["vodka", null],
    ["flavored-vodka", null],
    ["amaro", null],
    ["liqueur", null],
    ["chocolate-liqueur", null],
    ["cream-liqueur", null],
    ["other", null],
  ])("defaults %s to %s", (kind, country) => {
    expect(countryForKind(kind)).toBe(country);
  });
});

describe("placeIdentifier", () => {
  it.each<[CategoryKind, string, "dsp" | "nom" | "region" | null]>([
    ["tequila", "Mexico", "nom"],
    ["mezcal", "USA", "nom"],
    ["tequila", "Scotland", "nom"],
    ["american", "USA", "dsp"],
    ["scotch", "Scotland", "region"],
    ["scotch", "USA", "region"],
    ["american", "Scotland", "region"],
    ["american", "Mexico", "nom"],
    ["scotch", "Mexico", "nom"],
    ["cognac", "France", null],
    // Countries are typed by hand: case, accents and common aliases must not hide the chip.
    ["american", "mexico", "nom"],
    ["cognac", "México", "nom"],
    ["american", "scotland", "region"],
    ["american", "UK", "region"],
    ["cognac", "us", "dsp"],
    ["cognac", "  usa ", "dsp"],
  ])("selects the identifier for %s in %s", (kind, country, identifier) => {
    expect(placeIdentifier(kind, country)).toBe(identifier);
  });
});

describe("companyPrefill", () => {
  it.each<[string, string | null, boolean]>([
    ["lost lantern  distillery", "Lost Lantern", true],
    ["Lost Lantern", "Lost Lantern", true],
    ["  LOST   LANTERN DISTILLERY  ", " lost  lantern ", true],
    ["Lost Lantern Co", "Lost Lantern", false],
    ["Lost Lantern Distilleries", "Lost Lantern", false],
    ["Lost Lantern", null, false],
    ["", "", false],
    ["distillery", "   ", false],
    ["", "Lost Lantern", false],
  ])("matches %j against brand %j: %s", (typedName, brandName, expected) => {
    expect(companyPrefill(typedName, brandName)).toBe(expected);
  });
});
