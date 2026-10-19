import { describe, expect, it } from "vitest";
import { labelTastingJson, type LabelTastingRow } from "../tasting-json";

const row: LabelTastingRow = {
  id: 4,
  bottleId: 9,
  source: "owned",
  tastedAt: null,
  tags: ["bourbon/fruity/citrus/lemon"],
  tastedOn: "2026-10-03",
  rating: "8.5",
  nose: "Cherry",
  palate: null,
  finish: null,
  overall: null,
  isSingleBarrel: true,
  isSingleBarrelPick: true,
  pickName: "Fall barrel",
  pickedBy: "Total Wine",
  barrelNumber: "1234",
  releaseName: null,
  bottleBatch: null,
  releaseYear: null,
};

describe("labelTastingJson", () => {
  it("adds the bottle's provenance to the tasting", () => {
    expect(labelTastingJson(row).provenance).toEqual({
      singleBarrel: true,
      privateSelection: true,
      pickName: "Fall barrel",
      pickedBy: "Total Wine",
      barrelNumber: "1234",
      release: null,
      batch: null,
      releaseYear: null,
    });
  });

  it("sends null provenance for a pour with no bottle", () => {
    const bar = { ...row, bottleId: null, isSingleBarrel: null, isSingleBarrelPick: null, pickName: null, pickedBy: null, barrelNumber: null };
    expect(labelTastingJson(bar).provenance).toBeNull();
  });

  it("changes nothing else in the row, so the API stays additive", () => {
    expect(Object.keys(labelTastingJson(row)).sort()).toEqual(
      ["bottleId", "finish", "id", "nose", "overall", "palate", "provenance", "rating", "source", "tags", "tastedAt", "tastedOn"],
    );
  });
});
