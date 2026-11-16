import { describe, expect, it } from "vitest";
import { columnFor, defaultScope, nextScope, scopesFor } from "../scope";
import type { SheetBottle, SheetLabel, SheetRow } from "../sheet";

const label = {} as SheetLabel;
const bottle = (over: Record<string, unknown> = {}) => ({ id: 7, releaseId: null, isSingleBarrel: false, isSingleBarrelPick: false, ...over }) as unknown as SheetBottle;
const row = (b: SheetBottle | null, draft = false): SheetRow => ({ key: b ? `b${b.id}` : "l1", label, bottle: b, ...(draft ? { draft: { brandChosen: true, labelChosen: true, brandIsNew: false, labelIsNew: false } } : {}) });

describe("where an edit starts (the spec's table)", () => {
  it("is the vintage for a bottle on one, the label for a plain bottle, and the bottle itself for a single barrel or a private selection", () => {
    expect(defaultScope(row(bottle({ releaseId: 70 })))).toBe("vintage");
    expect(defaultScope(row(bottle()))).toBe("label");
    expect(defaultScope(row(bottle({ isSingleBarrel: true })))).toBe("bottle");
    expect(defaultScope(row(bottle({ isSingleBarrelPick: true, releaseId: 70 })))).toBe("bottle");
  });
  it("is the label for a field a vintage does not have, even on a vintage bottle", () => {
    expect(defaultScope(row(bottle({ releaseId: 70 })), "sizeMl")).toBe("label");
    expect(defaultScope(row(bottle({ releaseId: 70 })), "proof")).toBe("vintage");
  });
});

describe("the levels a row offers, narrowest first", () => {
  it("is this bottle, its vintage and the label for a bottle on a vintage, and this bottle and the label otherwise", () => {
    expect(scopesFor(row(bottle({ releaseId: 70 })))).toEqual(["bottle", "vintage", "label"]);
    expect(scopesFor(row(bottle()))).toEqual(["bottle", "label"]);
  });
  it("leaves the vintage out for size, tequila class, brandy grade and gin NAS, which a vintage does not have", () => {
    const b = row(bottle({ releaseId: 70 }));
    expect(scopesFor(b, "proof")).toEqual(["bottle", "vintage", "label"]);
    for (const field of ["sizeMl", "tequilaClass", "brandyGrade", "ginIsNas"] as const) expect(scopesFor(b, field)).toEqual(["bottle", "label"]);
  });
  it("offers no choice on a new, unsaved row or on a label's own row", () => {
    expect(scopesFor(row(bottle(), true))).toEqual([]);
    expect(scopesFor(row(null))).toEqual([]);
  });
});

describe("stepping through the levels", () => {
  const all = ["bottle", "vintage", "label"] as const;
  it("goes on, wrapping round, with a positive step and back with a negative one", () => {
    expect(nextScope([...all], "label", 1)).toBe("bottle");
    expect(nextScope([...all], "bottle", -1)).toBe("label");
    expect(nextScope([...all], "vintage", 1)).toBe("label");
  });
  it("starts from the narrowest when the current level is not on offer", () => {
    expect(nextScope(["bottle", "label"], "vintage", 1)).toBe("bottle");
  });
});

describe("the column an edit is stored under at a level", () => {
  it("is the bottle's own editor for the bottle level, and the same column for the vintage and the label", () => {
    expect(columnFor("proof", "bottle")).toBe("ownProof");
    expect(columnFor("sizeMl", "bottle")).toBe("ownSize");
    expect(columnFor("ageYears", "bottle")).toBe("ownAgeYears");
    expect(columnFor("ageStatement", "bottle")).toBe("ownAgeStatement");
    expect(columnFor("proof", "vintage")).toBe("proof");
    expect(columnFor("proof", "label")).toBe("proof");
    expect(columnFor("designation", "bottle")).toBe("designation");
  });
});
