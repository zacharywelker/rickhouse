import type { FieldSpec } from "@/lib/admin/types";
import { parseOtherNames } from "@/lib/other-names";
import { showsRegions } from "@/lib/expressions/rules";
import type { CellEditor } from "./editors";
import type { Kinds } from "./fields";
import type { Cell, SheetColumn, SheetContext, SheetRow } from "./sheet";

/**
 * A label's regions, older names and known releases: three things the label form edits with its own controls (the six
 * Scotch region buttons, and a list of rows each), so the sheet's cell shows a summary and opens those same controls in a
 * popover (`panel-editor.tsx`). Which spirits have them is the form's rule. What an edited cell holds is text: the
 * regions as the form writes them ("Islay, Speyside"), the older names one per line as `otherNamesRowsText` writes
 * them, and the releases as the JSON rows the form submits.
 */
export type PanelKey = "regions" | "otherNames" | "releases";
export const PANEL_KEYS: ReadonlyArray<PanelKey> = ["regions", "otherNames", "releases"];

const NO_SPEC: FieldSpec = { kind: "text", name: "panel", label: "" };
const DASH: Cell = { text: "—", muted: true };

/** The names in a list a panel holds, for the summary. */
const namesOf = (key: PanelKey, value: string): string => {
  if (key === "regions") return value;
  if (key === "otherNames") return parseOtherNames(value).names.map((n) => n.name).join(", ");
  try {
    const rows: unknown = JSON.parse(value);
    return Array.isArray(rows) ? rows.map((r) => String((r as { name?: unknown }).name ?? "")).filter((n) => n !== "").join(", ") : "";
  } catch {
    return "";
  }
};

/** Vodka, amaro and liqueur have no known releases: the form leaves the section out. */
const hasReleases = (group: string) => !["vodka", "amaro", "liqueur"].includes(group);

export function panelApplies(key: PanelKey, row: SheetRow, kinds: Kinds): boolean {
  switch (key) {
    case "regions":
      return showsRegions({ kind: kinds[row.label.categoryId] ?? null });
    case "otherNames":
      // A label that does not exist yet has no older names to keep: they come once it is saved.
      return !row.draft;
    case "releases":
      return !row.draft && hasReleases(row.label.fieldGroup);
  }
}

const stored = (key: PanelKey, row: SheetRow, ctx: SheetContext): string =>
  key === "regions" ? (row.label.regions ?? []).join(", ") : (ctx.lists?.[key === "otherNames" ? "versions" : "releases"][row.label.id] ?? []).join(", ");

export function panelEditor(key: PanelKey): CellEditor {
  return {
    column: key,
    field: key,
    scope: "label",
    spec: NO_SPEC,
    panel: key,
    applies: (row, kinds) => panelApplies(key, row, kinds),
    typeToReplace: false,
    initial: (row) => (key === "regions" ? (row.label.regions ?? []).join(", ") : ""),
    display: (value) => {
      const text = namesOf(key, value);
      return text === "" ? DASH : { text };
    },
  };
}

const LABELS: Record<PanelKey, string> = { regions: "Regions", otherNames: "Other names", releases: "Known releases" };

export const PANEL_COLUMNS: ReadonlyArray<SheetColumn> = PANEL_KEYS.map((key) => ({
  id: key,
  label: LABELS[key],
  group: "label",
  defaultHidden: true,
  section: key === "regions" ? "Where it came from" : key === "otherNames" ? "Other / old names" : "Known releases",
  cell: (row: SheetRow, ctx: SheetContext): Cell => {
    if (!panelApplies(key, row, ctx.kinds)) return { ...DASH, note: key === "regions" ? "Only for Scotch" : key === "releases" && row.draft ? "Save the label first" : "Not used for this spirit" };
    const text = stored(key, row, ctx);
    return text === "" ? DASH : { text };
  },
}));
