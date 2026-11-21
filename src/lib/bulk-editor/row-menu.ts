import type { DeleteIds } from "./delete";
import type { SheetRow, SheetView } from "./sheet";

/**
 * The right-click menu on a row: which items a row gets, and which of them it cannot use. No React, no network.
 * An item that does not apply stays in the menu, dimmed with its reason, so the menu keeps its shape.
 */

export type MenuItemId = "expand" | "insert" | "duplicateBottle" | "duplicateLabel" | "deleteLabel" | "deleteBottle" | "discard";
export type MenuItem = {
  id: MenuItemId;
  label: string;
  /** A second line saying what the item will touch. */
  hint?: string;
  /** Present when the row cannot use the item: the reason, shown as its tooltip. */
  disabled?: string;
  danger?: boolean;
  /** 0 Expand and Insert, 1 the Duplicates, 2 the deletes. A separator is drawn between groups. */
  group: 0 | 1 | 2;
};

const NOT_SAVED = "Not saved yet";

export function rowMenuItems(row: SheetRow, view: SheetView, opts: { blank: boolean }): MenuItem[] {
  const draft = row.draft;
  if (draft) {
    // Alone, the Bottles view cannot make a label, so a new row there can only be expanded once it names one that exists.
    const needsLabel = view.bottles && !view.labels && !(draft.labelChosen && !draft.labelIsNew);
    return [
      { id: "expand", label: "Expand record", group: 0, ...(needsLabel ? { disabled: "Choose a label first" } : {}) },
      { id: "insert", label: "Insert record below", group: 0 },
      { id: "duplicateBottle", label: "Duplicate bottle", group: 1, disabled: NOT_SAVED },
      { id: "duplicateLabel", label: "Duplicate label", group: 1, disabled: NOT_SAVED },
      { id: "discard", label: "Discard new row", group: 2, danger: true, ...(opts.blank ? { disabled: "Nothing typed in this row" } : {}) },
    ];
  }

  const noBottle = row.bottle === null ? (view.bottles ? "This label has no bottle" : "Rows are labels in this view") : undefined;
  return [
    { id: "expand", label: "Expand record", group: 0 },
    { id: "insert", label: "Insert record below", group: 0 },
    { id: "duplicateBottle", label: "Duplicate bottle", group: 1, ...(noBottle ? { disabled: noBottle } : {}) },
    { id: "duplicateLabel", label: "Duplicate label", group: 1 },
    // The count of bottles on the sheet leaves out sold and wishlist ones, so the item says "bottles" and the dialog gives the server's number.
    { id: "deleteLabel", label: "Delete label", group: 2, danger: true, ...(row.label.bottleCount > 0 ? { hint: "And its bottles" } : {}) },
    { id: "deleteBottle", label: "Delete bottle", group: 2, danger: true, ...(noBottle ? { disabled: noBottle } : {}) },
  ];
}

/** What a delete item deletes: the row's label (its bottles go with it), or the row's bottle alone. */
export function menuDeleteIds(id: "deleteLabel" | "deleteBottle", row: SheetRow): DeleteIds {
  if (id === "deleteLabel") return { labelIds: [row.label.id], bottleIds: [] };
  return { labelIds: [], bottleIds: row.bottle ? [row.bottle.id] : [] };
}
