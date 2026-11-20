import { BOTTLE_FIELDS, BOTTLE_STATE_SECTION } from "@/lib/expressions/bottle-fields";
import { EXPRESSION_SECTIONS } from "@/lib/expressions/fields";
import type { DraftRow } from "./drafts";
import { cellFields, columnOfField } from "./save";
import { SHEET_COLUMNS, type SheetRow, type SheetView } from "./sheet";

/**
 * Expand record: which of the app's real pages a row opens in the popup, in order, and what a new row hands to them.
 * Which form follows the sheet's view toggle: only Labels on is the label's page, only Bottles on is the bottle's, both
 * on is the label's and then the bottle's (a row that is a label with no bottle has only the first). No React, no network.
 */

/** The popup urls for a saved row, or null for a new row (whose pages depend on what it has typed). */
export function expandSteps(row: SheetRow, view: SheetView): string[] | null {
  if (row.draft) return null;
  const label = `/expressions/${row.label.id}/edit`;
  const bottle = row.bottle ? `/bottles/${row.bottle.id}/edit` : null;
  if (view.bottles && !view.labels) return bottle ? [bottle] : [label];
  if (view.bottles && view.labels) return bottle ? [label, bottle] : [label];
  return [label];
}

/**
 * What a new row hands to the form. `label` and `bottle` are field values for the forms; a brand that does not exist yet
 * is `newBrand` (the form takes a brand by id, so the sheet makes it first). `dropped` names typed columns the form has
 * no field for, so the person is told and nothing is lost silently.
 */
export type Prefill = { label: Record<string, unknown>; bottle: Record<string, unknown>; dropped: string[]; newBrand: string | null };

const LABEL_FIELD_NAMES: ReadonlySet<string> = new Set(EXPRESSION_SECTIONS.flatMap((section) => section.fields.map((field) => field.name)));
const BOTTLE_FIELD_NAMES: ReadonlySet<string> = new Set([...BOTTLE_FIELDS, ...BOTTLE_STATE_SECTION.fields].map((field) => field.name));

/** What to hand the form for a new row: its picks, its typed cells (through the same mapping the saver uses) and its waiting text. */
export function expandPrefill(draft: DraftRow, cells: Readonly<Record<string, string>> | undefined, pending: Readonly<Record<string, string>> | undefined, view: SheetView): Prefill {
  const label: Record<string, unknown> = {};
  const bottle: Record<string, unknown> = {};
  const dropped = new Set<string>();
  let newBrand: string | null = null;
  const chosen = draft.label;

  // A label that exists is chosen on the page itself; only a new one is described to the form.
  if (chosen?.kind !== "existing") {
    if (draft.brand?.kind === "existing") label.brandId = draft.brand.id;
    else if (draft.brand?.kind === "new") newBrand = draft.brand.name;
    else if (pending?.brand) newBrand = pending.brand;
    if (chosen?.kind === "new") label.name = chosen.name;
    else if (!chosen && pending?.name) label.name = pending.name;
    if (draft.categoryId !== null) label.categoryId = draft.categoryId;
  }

  const { facts, bottle: bottleFields } = cellFields(cells);
  const columnName = (field: string, scope: "label" | "bottle") => {
    const id = columnOfField(field, scope);
    return SHEET_COLUMNS.find((column) => column.id === id)?.label ?? id;
  };
  for (const [field, value] of Object.entries(facts)) {
    if (LABEL_FIELD_NAMES.has(field)) label[field] = value;
    else dropped.add(columnName(field, "label"));
  }
  for (const [field, value] of Object.entries(bottleFields)) {
    // With Bottles off the page that opens has no bottle form, so a bottle cell typed earlier has nowhere to go.
    if (view.bottles && BOTTLE_FIELD_NAMES.has(field)) bottle[field] = value;
    else dropped.add(columnName(field, "bottle"));
  }
  return { label, bottle, dropped: [...dropped], newBrand };
}

/** The popup urls for a new row, with `prefill=<token>` added; null when it cannot be expanded (Bottles only, and no label that exists). */
export function expandStepsForDraft(draft: DraftRow, view: SheetView, token: string): string[] | null {
  const prefill = `prefill=${encodeURIComponent(token)}`;
  const chosen = draft.label;
  const existing = chosen?.kind === "existing" ? chosen.id : null;
  if (!view.bottles) return existing !== null ? [`/expressions/${existing}/edit`] : [`/expressions/new?${prefill}`];
  if (existing !== null) return [`/bottles/add?expression=${existing}&${prefill}`];
  return view.labels ? [`/bottles/add?${prefill}`] : null;
}
