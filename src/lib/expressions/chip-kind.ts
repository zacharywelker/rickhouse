import type { FieldSpec } from "@/lib/admin/types";

/**
 * How the data-sheet look draws one field (design: 2026-11-25-data-sheet-forms-design.md). A fact with a value, or a required
 * one, is a chip with its input inline; an optional one with nothing in it is a dashed "+" chip that opens the input; a
 * checkbox is a toggle; a select is a chip that opens a popover; anything else (a reference, a long text, a slider) keeps the
 * form's own field, drawn in the row.
 */
export type ChipKind = "value" | "add-value" | "select" | "add-select" | "toggle" | "field";

export function chipKind(spec: FieldSpec, value: unknown): ChipKind {
  const empty = value === null || value === undefined || value === "";
  const required = "required" in spec && spec.required === true;
  switch (spec.kind) {
    case "checkbox":
      return "toggle";
    case "number":
      // A number with presets (the bottle size) is a choice of sizes, not a typed fact.
      return spec.presets ? "field" : empty && !required ? "add-value" : "value";
    case "text":
    case "date":
      return empty && !required ? "add-value" : "value";
    case "select":
      // The first option is the "unset" choice when its value is blank.
      return empty && spec.options[0]?.value === "" ? "add-select" : "select";
    default:
      return "field";
  }
}
