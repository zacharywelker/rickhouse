import { describe, expect, it } from "vitest";
import type { FieldGroup } from "@/db/schema";
import { writableLabelFacts } from "../writable-facts";
import type { CategoryKind } from "../rules";

/** What a label save, the phone's patch and the sheet may write, by kind: the same rule the form's hidden fields follow. */
const can = (group: FieldGroup, kind: CategoryKind, field: string) => writableLabelFacts(group, kind).has(field);

describe("writableLabelFacts follows the matrix for cask strength and NAS", () => {
  it("does not let Cask Strength be written for agave or gin", () => {
    for (const [group, kind] of [["agave", "tequila"], ["agave", "mezcal"], ["gin", "gin"], ["gin", "genever"]] as const) {
      expect(can(group, kind, "isCaskStrength"), `${kind}`).toBe(false);
    }
  });

  it("still lets it be written for whiskey, rum and brandy", () => {
    for (const [group, kind] of [["whiskey", "american"], ["whiskey", "scotch"], ["rum", "other"], ["brandy", "cognac"]] as const) {
      expect(can(group, kind, "isCaskStrength"), `${kind}`).toBe(true);
    }
  });

  it("does not let NAS be written for Cognac, Armagnac or Calvados, and does for Pisco and Apple Brandy", () => {
    for (const kind of ["cognac", "armagnac", "calvados"] as const) expect(can("brandy", kind, "isNas"), kind).toBe(false);
    for (const kind of ["pisco", "apple", "eau-de-vie"] as const) expect(can("brandy", kind, "isNas"), kind).toBe(true);
  });

  it("keeps taking Still Proof for agave, which the phone still sends, and for no other spirit", () => {
    expect(can("agave", "tequila", "isStillProof")).toBe(true);
    expect(can("whiskey", "american", "isStillProof")).toBe(false);
  });
});
