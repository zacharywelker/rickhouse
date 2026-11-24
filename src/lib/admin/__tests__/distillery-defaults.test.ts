import { describe, expect, it } from "vitest";
import type { CategoryKind } from "@/lib/expressions/rules";
import { companyPrefill, countryForKind, distilleryNameOf, placeIdentifier } from "../distillery-defaults";

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
  it.each<[string, "dsp" | "nom" | "region" | null]>([
    ["Mexico", "nom"],
    ["mexico", "nom"],
    ["México", "nom"],
    ["MX", "nom"],
    ["Scotland", "region"],
    ["scotland", "region"],
    ["UK", "region"],
    ["USA", "dsp"],
    ["us", "dsp"],
    ["  usa ", "dsp"],
    ["France", null],
    ["Canada", null],
  ])("selects the identifier for %s", (country, identifier) => {
    expect(placeIdentifier(country)).toBe(identifier);
  });
});

describe("distilleryNameOf", () => {
  it("removes the NOM prefix a picker adds", () => {
    expect(distilleryNameOf("NOM-1234: Casa Prueba")).toBe("Casa Prueba");
    expect(distilleryNameOf("NOM-1234A: Casa: Prueba")).toBe("Casa: Prueba");
  });

  it("leaves other names alone", () => {
    expect(distilleryNameOf("Far North Spirits")).toBe("Far North Spirits");
    expect(distilleryNameOf("Nomad: Works")).toBe("Nomad: Works");
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
