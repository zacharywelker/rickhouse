import { describe, expect, it } from "vitest";
import { provenanceOf, provenanceTags, type ProvenanceInput } from "../provenance";

const standard: ProvenanceInput = {
  isSingleBarrel: false,
  isSingleBarrelPick: false,
  pickName: null,
  pickedBy: null,
  barrelNumber: null,
  releaseName: null,
  bottleBatch: null,
  releaseYear: null,
};

describe("provenanceOf", () => {
  it("is null for a standard bottle", () => {
    expect(provenanceOf(standard)).toBeNull();
  });

  it("is null for a pour with no bottle, where every field comes back null from the join", () => {
    expect(provenanceOf({ ...standard, isSingleBarrel: null, isSingleBarrelPick: null })).toBeNull();
  });

  it("treats blank text as absent", () => {
    expect(provenanceOf({ ...standard, pickName: "  ", pickedBy: "", barrelNumber: " " })).toBeNull();
  });

  it("counts a picker as a private selection even when the flag is off", () => {
    expect(provenanceOf({ ...standard, pickedBy: "Total Wine" })).toMatchObject({ privateSelection: true, pickedBy: "Total Wine" });
  });
});

describe("provenanceTags", () => {
  it("is empty without provenance", () => {
    expect(provenanceTags(null)).toEqual([]);
  });

  it("names a private single-barrel pick in full", () => {
    const p = provenanceOf({
      ...standard,
      isSingleBarrel: true,
      isSingleBarrelPick: true,
      pickName: "Fall barrel",
      pickedBy: "Total Wine",
      barrelNumber: "1234",
    });
    expect(provenanceTags(p)).toEqual(["Private selection", "“Fall barrel”", "Picked by Total Wine", "Single barrel", "Barrel 1234"]);
  });

  it("shows a plain single barrel", () => {
    expect(provenanceTags(provenanceOf({ ...standard, isSingleBarrel: true }))).toEqual(["Single barrel"]);
  });

  it("shows a release by name, and does not repeat its year", () => {
    const p = provenanceOf({ ...standard, releaseName: "Spring 2024", releaseYear: 2024 });
    expect(provenanceTags(p)).toEqual(["Spring 2024"]);
  });

  it("shows a batch and a year when there is no release name", () => {
    const p = provenanceOf({ ...standard, bottleBatch: "B521", releaseYear: 2021 });
    expect(provenanceTags(p)).toEqual(["Batch B521", "2021"]);
  });

  it("prefers the release name to a batch", () => {
    const p = provenanceOf({ ...standard, releaseName: "Spring 2024", bottleBatch: "B1" });
    expect(provenanceTags(p)).toEqual(["Spring 2024"]);
  });
});
