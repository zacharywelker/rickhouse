import { describe, expect, it } from "vitest";
import { BOTTLE_SECTIONS } from "../bottle-fields";
import { BOTTLE_CHIP_LABELS, BOTTLE_MORE_FIELDS, BOTTLE_SHEET_MORE, BOTTLE_SHEET_ROWS, bottleRowFields } from "../bottle-sheet-layout";

// Status is drawn by the @status token, which bottleRowFields leaves out.
const placedFields = (): string[] => [
  ...BOTTLE_SHEET_ROWS.flatMap((row) => row.items.map((item) => item === "@status" ? "status" : item)),
  ...BOTTLE_MORE_FIELDS,
];

describe("BOTTLE_SHEET_ROWS", () => {
  it("names only fields the bottle form has", () => {
    const names = new Set(BOTTLE_SECTIONS.flatMap((s) => s.fields.map((f) => f.name)));
    for (const field of [...bottleRowFields(), ...BOTTLE_MORE_FIELDS]) expect(names.has(field), field).toBe(true);
  });
  it("draws no field twice across rows and More", () => {
    const all = placedFields();
    expect(all.filter((name, index) => all.indexOf(name) !== index)).toEqual([]);
  });
  it("places every bottle field except age months and days (drawn with years)", () => {
    const named = new Set(placedFields());
    const missing = BOTTLE_SECTIONS.flatMap((s) => s.fields.map((f) => f.name)).filter((name) => !named.has(name));
    expect(missing.sort()).toEqual(["ageDays", "ageMonths"]);
  });
  it("gives every More item a unique id", () => {
    const ids = BOTTLE_SHEET_MORE.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("words only placed fields' chips the mockup's way", () => {
    for (const name of Object.keys(BOTTLE_CHIP_LABELS)) expect(placedFields()).toContain(name);
  });
});
