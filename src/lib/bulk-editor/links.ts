import type { FieldSpec, Option } from "@/lib/admin/types";
import type { LinkedRow } from "@/components/expressions/ordered-picker";
import { hasIngredientPickers, hasMashbillPicker } from "@/lib/expressions/link-rules";
import { describeLinks, linksPayload, type LinkKind } from "@/lib/expressions/links";
import { isSingleMaltCategory, showsFinishes, showsRegions, type CategoryKind } from "@/lib/expressions/rules";
import type { IngredientChoice } from "@/lib/expressions/spirit-details";
import type { CellEditor } from "./editors";
import type { Kinds } from "./fields";
import type { Cell, SheetColumn, SheetContext, SheetLabel, SheetRow } from "./sheet";

/**
 * A label's distilleries, mashbills, finishes and ingredients. Each is a cell that shows a summary and opens the label
 * form's own pickers (`label-link-pickers.tsx`) in a popover, so shares, order, which distillery made a mashbill, finish
 * pairs, creating one on the spot and every message are the form's. Which spirits get which is the form's rule too.
 *
 * An edited cell holds the list as JSON. The server takes the three ordered lists together (which distillery made each
 * mashbill, and which mashbill each finish went on, depend on each other), so a request is made from the lists that were
 * changed and, for the rest, the label's lists as the popover loaded them (`linksBody`).
 */
export type LinkKey = LinkKind | "ingredients";
export const LINK_KEYS: ReadonlyArray<LinkKey> = ["distilleries", "mashbills", "finishes", "ingredients"];

const NO_SPEC: FieldSpec = { kind: "text", name: "links", label: "" };
const DASH: Cell = { text: "—", muted: true };

/** A label's lists as the pickers hold them. */
export type LinkLists = { distilleries: LinkedRow[]; mashbills: LinkedRow[]; finishes: LinkedRow[]; ingredients: IngredientChoice[] };

const parse = <T,>(value: string): T[] => {
  try {
    const rows: unknown = JSON.parse(value);
    return Array.isArray(rows) ? (rows as T[]) : [];
  } catch {
    return [];
  }
};

/** The list this edit holds, or null when it holds none. */
export const listOf = <T,>(edits: Readonly<Record<string, string>> | undefined, key: LinkKey): T[] | null => (edits?.[key] === undefined ? null : parse<T>(edits[key]!));

/** What the table's columns show for a list (the same words as the labels table). */
export const ingredientNames = (rows: ReadonlyArray<IngredientChoice>): string => rows.map((r) => r.name).join(", ");
const summary = (key: LinkKey, rows: ReadonlyArray<unknown>): string => (key === "ingredients" ? ingredientNames(rows as IngredientChoice[]) : describeLinks(key, rows as LinkedRow[]));

export function labelLists(label: SheetLabel): LinkLists {
  return { distilleries: label.links.distilleries, mashbills: label.links.mashbills, finishes: label.links.finishes, ingredients: (label.links.ingredients ?? []) as IngredientChoice[] };
}

const singleMalt = (label: SheetLabel) => isSingleMaltCategory(label.categorySlug);

/** Whether the spirit has this list (the form shows it, or not, by the same rule). */
export function linkApplies(key: LinkKey, row: SheetRow, kinds: Kinds): boolean {
  const { label } = row;
  const kind = kinds[label.categoryId] ?? null;
  switch (key) {
    case "distilleries":
      return true;
    case "mashbills":
      return hasMashbillPicker(label.fieldGroup, singleMalt(label));
    case "finishes":
      return showsFinishes({ group: label.fieldGroup, ginAged: label.isAgedGin === true, values: label as unknown as Record<string, unknown> });
    case "ingredients":
      return hasIngredientPickers(label.fieldGroup, kind);
  }
}

export function linkEditor(key: LinkKey): CellEditor {
  return {
    column: key,
    field: key,
    scope: "label",
    spec: NO_SPEC,
    links: key,
    applies: (row, kinds) => linkApplies(key, row, kinds),
    typeToReplace: false,
    initial: (row) => JSON.stringify(labelLists(row.label)[key]),
    display: (value) => {
      const text = summary(key, parse<unknown>(value));
      return text === "" ? DASH : { text };
    },
  };
}

/** The ingredients column; the other three are the labels table's own. */
export const INGREDIENTS_COLUMN: SheetColumn = {
  id: "ingredients",
  label: "Ingredients",
  group: "label",
  defaultHidden: true,
  cell: (row: SheetRow, ctx: SheetContext) => {
    if (!linkApplies("ingredients", row, ctx.kinds)) return { ...DASH, note: "Not used for this spirit" };
    const text = ingredientNames(labelLists(row.label).ingredients);
    return text === "" ? DASH : { text };
  },
};

/** The `label` an edited list shows its rows by, with a column's other lists as they stand (an edit, or the label's own). */
export function listsWith(label: SheetLabel, edits: Readonly<Record<string, string>> | undefined): LinkLists {
  const base = labelLists(label);
  return {
    distilleries: listOf<LinkedRow>(edits, "distilleries") ?? base.distilleries,
    mashbills: listOf<LinkedRow>(edits, "mashbills") ?? base.mashbills,
    finishes: listOf<LinkedRow>(edits, "finishes") ?? base.finishes,
    ingredients: listOf<IngredientChoice>(edits, "ingredients") ?? base.ingredients,
  };
}

/**
 * The lists a save sends. Only when one of the three ordered lists was edited, all three go (the server rewrites them
 * together); ingredients go on their own when edited. `loaded` is the label as the popover read it, with its finish pairs:
 * what is not edited is taken from there, so a save never drops pairs it did not show. Nothing when no list was edited.
 */
export function linksBody(cells: Readonly<Record<string, string>>, loaded: LinkLists | undefined, fallback: LinkLists): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const base = loaded ?? fallback;
  const orderedEdited = (["distilleries", "mashbills", "finishes"] as const).some((key) => cells[key] !== undefined);
  if (orderedEdited) {
    for (const key of ["distilleries", "mashbills", "finishes"] as const) {
      const rows = listOf<LinkedRow>(cells, key) ?? base[key];
      body[key] = JSON.parse(linksPayload(rows));
    }
  }
  const ingredients = listOf<IngredientChoice>(cells, "ingredients");
  if (ingredients !== null) body.ingredients = ingredients.map((item) => ({ name: item.name, family: item.family ?? null, ...(item.kind ? { kind: item.kind } : {}), ...(item.isManual !== undefined ? { isManual: item.isManual } : {}) }));
  return body;
}

/**
 * What linking a distillery brings along, as the label form's `changeLinks` does it: a linked distillery adds its Scotch
 * region to a Scotch label, and gives an amaro or liqueur its origin country and region, unless the owner typed those
 * (`originCountryManual`). Returned as edits under the names `save.ts` sends without marking them typed.
 */
export function linkedFacts(
  label: SheetLabel,
  kind: CategoryKind | null,
  options: ReadonlyArray<Option>,
  before: ReadonlyArray<LinkedRow>,
  after: ReadonlyArray<LinkedRow>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const chosen = after.map((row) => options.find((option) => option.value === row.id));
  if (label.fieldGroup === "amaro" || label.fieldGroup === "liqueur") {
    const one = (field: "country" | "region", manual: boolean | undefined, name: "originCountryLinked" | "originRegionLinked") => {
      if (manual === true) return;
      if (chosen.length > 0 && chosen.every((option) => option?.[field])) {
        const values = [...new Set(chosen.map((option) => option![field]!.trim()))];
        out[name] = values.length === 1 ? values[0]! : "";
      } else out[name] = "";
    };
    one("country", label.originCountryManual, "originCountryLinked");
    one("region", label.originRegionManual, "originRegionLinked");
  }
  if (showsRegions({ kind })) {
    const regions = label.regions ?? [];
    const known = new Set(before.map((row) => row.id));
    const brought = after
      .filter((row) => !known.has(row.id))
      .map((row) => options.find((option) => option.value === row.id)?.region)
      .filter((region): region is string => region !== undefined && !regions.includes(region));
    if (brought.length > 0) out.regions = [...new Set([...regions, ...brought])].join(", ");
  }
  return out;
}

/** A label's lists as `labelLinksAction` reads them (the form's own loader), as the pickers hold them. */
export function linksFromLoaded(loaded: { distilleries: LinkedRow[]; mashbills: LinkedRow[]; finishes: LinkedRow[]; ingredients: ReadonlyArray<{ name: string; family?: string | null; kind?: string; isManual?: boolean }> }): LinkLists {
  return { distilleries: loaded.distilleries, mashbills: loaded.mashbills, finishes: loaded.finishes, ingredients: loaded.ingredients as IngredientChoice[] };
}
