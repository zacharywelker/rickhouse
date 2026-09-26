import type { FieldGroup } from "@/db/schema";
import type { LinkedRow } from "@/components/expressions/ordered-picker";
import type { ExpressionRow } from "@/lib/expressions/queries";
import { initialFieldValues, type FieldValue } from "@/lib/forms/values";
import { formatNumeric } from "@/lib/utils";
import { LABEL_COLUMN_GROUPS, LABEL_COLUMNS, type LabelColumnGroup } from "./columns";
import { sectionVisible } from "./fields";
import { LINK_FIELDS, linksPayload } from "./links";

/**
 * The labels table's unlocked edit mode, as pure functions: what a row's
 * editable values are, and which of them a save would send.
 */

/** A row's editable values: every form field by name, plus the three lists. */
export type LabelEdit = Record<string, FieldValue | LinkedRow[]>;

const EDIT_SPECS = LABEL_COLUMNS.flatMap((column) => column.specs);

const GROUP_OF_FIELD = new Map<string, LabelColumnGroup>(
  LABEL_COLUMN_GROUPS.flatMap((group) => group.columns.flatMap((column) => column.specs.map((spec) => [spec.name, group]))),
);

/** Whether a group's form section applies to a label of this spirit — the form's rule. */
export function groupApplies(group: LabelColumnGroup, fieldGroup: FieldGroup): boolean {
  return !group.section || sectionVisible(group.section, fieldGroup, {});
}

/** A row's values in form shape — the same strings and booleans the edit page starts from. */
export function editableFrom(row: ExpressionRow): LabelEdit {
  return {
    ...initialFieldValues(EDIT_SPECS, row as unknown as Record<string, string | number | boolean | null>),
    distilleryLinks: row.links.distilleries,
    mashbillLinks: row.links.mashbills,
    finishLinks: row.links.finishes,
  };
}

/** The row's spirit, following an edited category before it is saved. */
export function fieldGroupOf(
  row: ExpressionRow,
  edit: LabelEdit | undefined,
  categoryGroups: Record<number, FieldGroup>,
): FieldGroup {
  const categoryId = edit?.categoryId;
  return (typeof categoryId === "string" ? categoryGroups[Number(categoryId)] : undefined) ?? row.fieldGroup;
}

/**
 * What saving a row would send: only the fields that changed, and only those
 * that apply to the row's (possibly just edited) category — the server drops
 * the rest anyway, so they should not count as unsaved either. When any list
 * changed, all three go, because they are replaced together.
 */
export function changesFor(original: LabelEdit, edit: LabelEdit, fieldGroup: FieldGroup): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {};
  for (const spec of EDIT_SPECS) {
    const group = GROUP_OF_FIELD.get(spec.name);
    if (group && !groupApplies(group, fieldGroup)) continue;
    if (edit[spec.name] !== original[spec.name]) changes[spec.name] = edit[spec.name];
  }
  const listsChanged = LINK_FIELDS.some(
    (field) => linksPayload(edit[field] as LinkedRow[]) !== linksPayload(original[field] as LinkedRow[]),
  );
  if (listsChanged) {
    for (const field of LINK_FIELDS) changes[field] = linksPayload(edit[field] as LinkedRow[]);
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

/** "12y", "4y 3m", "10y 2m 14d" — or null when no age is recorded. */
export function describeAgeParts(years: string | null, months: number | string | null, days: number | string | null): string | null {
  const parts = [
    [years, "y"],
    [months, "m"],
    [days, "d"],
  ]
    .filter(([value]) => value !== null && value !== "" && Number(value) !== 0)
    .map(([value, unit]) => `${formatNumeric(String(value))}${unit}`);
  return parts.length > 0 ? parts.join(" ") : null;
}
