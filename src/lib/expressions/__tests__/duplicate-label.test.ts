import { describe, expect, it } from "vitest";
import { duplicateLabelValues } from "../duplicate-label";

const source = {
  id: 7,
  ownerId: 1,
  brandId: 10,
  categoryId: 5,
  name: "Single Barrel",
  slug: "four-roses-single-barrel",
  proof: "100.0",
  ageYears: 6,
  isStraight: true,
  description: "A pour",
  photoPath: "labels/7.jpg",
  photoThumbPath: "labels/7-thumb.jpg",
  photoIsCutout: true,
  createdAt: "2026-01-01",
  updatedAt: "2026-02-01",
};

describe("what a duplicated label starts with", () => {
  it("leaves the name blank, so the person names the copy, and drops the slug that was made from the old name", () => {
    const values = duplicateLabelValues(source);
    expect(values.name).toBe("");
    expect("slug" in values).toBe(false);
  });
  it("keeps what describes the product: brand, category, proof, age and the flags", () => {
    expect(duplicateLabelValues(source)).toMatchObject({ brandId: 10, categoryId: 5, proof: "100.0", ageYears: 6, isStraight: true, description: "A pour" });
  });
  it("drops what belongs to the original: its ids, owner, dates and photo", () => {
    const values = duplicateLabelValues(source);
    for (const key of ["id", "ownerId", "createdAt", "updatedAt", "photoPath", "photoThumbPath", "photoIsCutout"]) {
      expect(key in values, key).toBe(false);
    }
  });
  it("does not change the source", () => {
    const before = JSON.stringify(source);
    duplicateLabelValues(source);
    expect(JSON.stringify(source)).toBe(before);
  });
});
