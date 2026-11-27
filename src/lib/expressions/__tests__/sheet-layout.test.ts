import { describe, expect, it } from "vitest";
import { chipKind } from "../chip-kind";
import { EXPRESSION_SECTIONS } from "../fields";
import { CHIP_LABELS, LABEL_PANEL_SECTIONS, SHEET_LAYOUT, layoutFields } from "../sheet-layout";
import type { FieldSpec } from "@/lib/admin/types";

const spec = (name: string) => EXPRESSION_SECTIONS.flatMap((s) => s.fields).find((f) => f.name === name)!;

describe("chipKind", () => {
  it("makes a checkbox a toggle", () => {
    expect(chipKind(spec("isCaskStrength"), false)).toBe("toggle");
    expect(chipKind(spec("isNas"), true)).toBe("toggle");
  });
  it("makes an optional fact a dashed + chip until it has a value, then a value chip", () => {
    expect(chipKind(spec("upc"), "")).toBe("add-value");
    expect(chipKind(spec("upc"), undefined)).toBe("add-value");
    expect(chipKind(spec("upc"), "081234567890")).toBe("value");
    expect(chipKind(spec("barrelFilledOn"), "")).toBe("add-value");
    expect(chipKind(spec("barrelFilledOn"), "2020-01-15")).toBe("value");
    expect(chipKind(spec("msrp"), 0)).toBe("value");
  });
  it("keeps a required fact a value chip even when it is empty", () => {
    expect(chipKind({ kind: "text", name: "x", label: "X", required: true } as FieldSpec, "")).toBe("value");
  });
  it("makes a select with an unset choice a dashed + chip until it is chosen", () => {
    expect(chipKind(spec("tequilaClass"), "")).toBe("add-select");
    expect(chipKind(spec("tequilaClass"), "reposado")).toBe("select");
  });
  it("leaves references, long text and the size presets to the form's own field", () => {
    expect(chipKind(spec("brandId"), 3)).toBe("field");
    expect(chipKind(spec("description"), "")).toBe("field");
    expect(chipKind(spec("sizeMl"), "750")).toBe("field");
  });
});

describe("SHEET_LAYOUT", () => {
  it("names only fields the form has (Bottled In Bond is a field of the Process section, drawn in the Strength row)", () => {
    const names = new Set(EXPRESSION_SECTIONS.flatMap((s) => s.fields.map((f) => f.name)));
    for (const sectionId of Object.keys(SHEET_LAYOUT)) for (const field of layoutFields(sectionId)) expect(names.has(field), `${sectionId}: ${field}`).toBe(true);
  });
  it("draws no field twice", () => {
    const all = Object.keys(SHEET_LAYOUT).flatMap(layoutFields);
    expect(all.filter((name, index) => all.indexOf(name) !== index)).toEqual([]);
  });
  it("draws every field of the identity and strength sections, but the age months and days (drawn with the years) and the Description (under More)", () => {
    const named = new Set(layoutFields("label"));
    const missing = LABEL_PANEL_SECTIONS.flatMap((id) => EXPRESSION_SECTIONS.find((s) => s.id === id)!.fields.map((f) => f.name)).filter((name) => !named.has(name));
    expect(missing.sort()).toEqual(["ageDays", "ageMonths", "description"]);
  });
  it("words the chips the mockup's way", () => {
    expect(CHIP_LABELS.upc).toBe("UPC");
    for (const name of Object.keys(CHIP_LABELS)) expect(layoutFields("label")).toContain(name);
  });
});
