import { formatNumeric } from "@/lib/utils";
import { inferredAge } from "./age";
import { resolve, type ValueField } from "./resolve";
import type { Cell, SheetContext, SheetRow } from "./sheet";

const DASH: Cell = { text: "—", muted: true };

/**
 * The cell for a value that comes from the bottle, its vintage or the label (`resolve.ts`): the value, a marker where it
 * is not the label's own, "Varies" where the label's vintages disagree, and the age a designation implies (grey, italic,
 * with its reason) only when nothing else gives one.
 */
export function valueCell(field: ValueField, row: SheetRow, ctx: Pick<SheetContext, "kinds" | "index">, format: (value: string) => string = (v) => v): Cell {
  const r = resolve(field, row, ctx);
  if (r.varies) return { text: "Varies", muted: true, varies: true };
  if (r.derived) return inferredAge(row.label, ctx.kinds) ?? DASH;
  if (r.value === null) return DASH;
  return { text: format(r.value), ...(r.marker ? { marker: r.marker } : {}) };
}

/** ABV is the proof halved, shown wherever the proof is, with the same marker. */
export function abvCell(row: SheetRow, ctx: Pick<SheetContext, "kinds" | "index">): Cell {
  return valueCell("proof", row, ctx, (proof) => formatNumeric(String(Number(proof) / 2)));
}

/**
 * A choice that a bottle can override (tequila class, brandy grade) or a flag (gin NAS): the bottle's own with a B, else
 * the label's with none. `display` is the field's own editor display, so the words are the form's. A blank is a dash.
 */
export function choiceCell(field: ValueField, row: SheetRow, ctx: Pick<SheetContext, "kinds" | "index">, display: (value: string) => Cell): Cell {
  const r = resolve(field, row, ctx);
  if (r.value === null || (field === "ginIsNas" && r.value === "false" && r.level === "label")) return DASH;
  const shown = display(r.value);
  return { ...shown, ...(r.marker ? { marker: r.marker } : {}) };
}

export const proofCell = (row: SheetRow, ctx: Pick<SheetContext, "kinds" | "index">): Cell => valueCell("proof", row, ctx, (v) => formatNumeric(v));
export const sizeCell = (row: SheetRow, ctx: Pick<SheetContext, "kinds" | "index">): Cell => valueCell("sizeMl", row, ctx, (v) => `${v} mL`);

/** What a copy of a value cell holds: the plain value it shows (a number, without units or marker), and nothing for Varies or a blank. */
export function copyValue(column: string, row: SheetRow, ctx: Pick<SheetContext, "kinds" | "index">): string {
  const field: ValueField | null = column === "abv" ? "proof" : (["proof", "sizeMl", "ageYears", "ageMonths", "ageDays", "ageStatement"] as const).find((f) => f === column) ?? null;
  if (!field) return "";
  const r = resolve(field, row, ctx);
  if (r.varies || r.value === null) return "";
  return column === "abv" ? formatNumeric(String(Number(r.value) / 2)) : r.value;
}
