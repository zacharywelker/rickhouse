import type { FieldSpec } from "@/lib/admin/types";

export type FieldValue = string | boolean;

/** "108.00" -> "108", "54.50" -> "54.5", "1500" -> "1500". */
function trimNumeric(value: string): string {
  return /^-?\d+\.\d+$/.test(value) ? value.replace(/\.?0+$/, "") : value;
}

/** Starting values for a form, from an existing row or the spec defaults. */
export function initialFieldValues(
  specs: FieldSpec[],
  existing: Record<string, string | number | boolean | null> | null,
): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const spec of specs) {
    const current = existing?.[spec.name];
    if (spec.kind === "checkbox") {
      values[spec.name] = current === true;
    } else if (spec.kind === "select") {
      values[spec.name] = typeof current === "string" ? current : (spec.options[0]?.value ?? "");
    } else if (current === null || current === undefined) {
      const hasDefault = spec.kind === "text" || spec.kind === "date" || spec.kind === "number";
      values[spec.name] = existing === null && hasDefault ? (spec.defaultValue ?? "") : "";
    } else if (spec.kind === "number") {
      // Postgres numerics come back padded ("108.00", "1500.00"). A number
      // input showing that reads like a price, not a proof.
      values[spec.name] = trimNumeric(String(current));
    } else {
      values[spec.name] = String(current);
    }
  }
  return values;
}
