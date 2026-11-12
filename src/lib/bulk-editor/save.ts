import type { DraftRow } from "./drafts";
import { EDITORS, type CellEditor, type Edits } from "./editors";
import { isYesNoChoice } from "./fields";
import { linksPayload } from "@/lib/expressions/links";
import { linksBody, labelLists, type LinkLists } from "./links";
import { refServerFields } from "./references";
import type { SheetLabel } from "./sheet";
import type { Moves } from "./changes";

/**
 * Saving, as plain data: what a new row still needs, the requests a row's edits become, which cell a failure belongs
 * to, what the corner notice says, and which edits a refreshed sheet has made redundant. No React, no network.
 */

// ---------------------------------------------------------------------------
// What a new row needs
// ---------------------------------------------------------------------------

export type Need = {
  /** The cell that is missing it. */
  column: "brand" | "name" | "category";
  /** Finishes "cannot save until you …". */
  action: string;
  /** The words put in the cell itself. */
  short: string;
};

/**
 * What a new row must have before it can save, or null when it has it. A bottle needs nothing beyond its label: the
 * server accepts a bottle with no other value (checked against `createRow`). A new label also needs its category.
 */
export function draftNeeds(draft: DraftRow): Need | null {
  if (draft.brand === null) return { column: "brand", action: "choose a brand", short: "Choose a brand" };
  if (draft.label === null) return { column: "name", action: "choose a label", short: "Choose a label" };
  if (draft.label.kind === "new" && draft.categoryId === null) return { column: "category", action: "select a category", short: "Needs a category" };
  return null;
}

/** How the notice names a new row. */
export const draftTitle = (draft: DraftRow): string => [draft.brand?.name, draft.label?.name].filter(Boolean).join(" ") || "A new row";

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

const valueOrNull = (value: string): string | null => (value === "" ? null : value);

/**
 * What a cell's text is, to the server. A checkbox is a boolean, a yes/no choice is true, false or nothing, a cell that
 * stands for two fields (Cask / Bonded) is both, and the rest is its text, with nothing for a blank.
 */
export function serverFields(editor: CellEditor | undefined, column: string, value: string): Record<string, unknown> {
  // The Label column is a pick on a new row (its field is "label") but a typed rename on a saved label ("name").
  if (column === "name") return { name: valueOrNull(value) };
  if (!editor) return { [column]: valueOrNull(value) };
  if (editor.fieldsOf) return editor.fieldsOf(value);
  // The origin of an amaro or liqueur typed in is remembered as the owner's own, as the form does.
  if (editor.field === "originCountry" || editor.field === "originRegion") return { [editor.field]: valueOrNull(value), [`${editor.field}Manual`]: value.trim() !== "" };
  if (editor.reference) return refServerFields(editor.field, value);
  // The level is a whole number on the server; the cell holds the option's value as text.
  if (editor.field === "fillPct") return { fillPct: Number(value) };
  if (editor.spec.kind === "checkbox") return { [editor.field]: value === "true" };
  // A yes/no choice goes as the form sends it: "true", "false", or "" for unknown.
  if (isYesNoChoice(editor.spec)) return { [editor.field]: value };
  return { [editor.field]: valueOrNull(value) };
}

/**
 * What linking a distillery brings along (the form's `changeLinks`): the Scotch regions, and an amaro's or liqueur's origin.
 * They are edits under these names, not the Region and Origin cells', so they are not mistaken for being typed (typing an
 * origin marks it as the owner's own, and a later link then leaves it alone).
 */
const LINKED_FACTS: Readonly<Record<string, string>> = { regions: "regions", originCountryLinked: "originCountry", originRegionLinked: "originRegion" };
export const LINKED_COLUMNS = Object.keys(LINKED_FACTS);

/** A field and its text, under the server's field name. A blank clears the value (null). The lists are sent by `linksBody`. */
function patchFields(cells: Readonly<Record<string, string>>): Record<string, unknown> {
  return Object.assign(
    {},
    ...Object.entries(cells).map(([column, value]) => {
      if (EDITORS[column]?.links) return {};
      if (column in LINKED_FACTS) return { [LINKED_FACTS[column]!]: valueOrNull(value) };
      return serverFields(EDITORS[column], column, value);
    }),
  );
}

/**
 * The body for a saved bottle: its own cells, and the label it moves to. Clearing the date opened of a bottle that is
 * open would ask whether to keep it open or seal it; a cell cannot ask, so it keeps it open (nothing is lost, and
 * sealing is the Opened tick's job, which refuses to reset a level that is not full).
 */
export const bottlePatchBody = (cells: Readonly<Record<string, string>> | undefined, moveTo: number | undefined): Record<string, unknown> => ({
  ...patchFields(cells ?? {}),
  ...(cells?.dateOpened === "" ? { ifOpenedCleared: "keep_open" } : {}),
  ...(moveTo !== undefined ? { expressionId: moveTo } : {}),
});

/** The body for a saved label: only its own facts. One request reaches every bottle on it. */
export const labelPatchBody = (cells: Readonly<Record<string, string>> | undefined, links?: { label: SheetLabel; loaded: LinkLists | undefined }): Record<string, unknown> => ({
  ...patchFields(cells ?? {}),
  ...(links ? linksBody(cells ?? {}, links.loaded, labelLists(links.label)) : {}),
});

/**
 * The body for a new row. An existing brand or label goes by id (and an existing label takes no facts: they are not the
 * row's to change). A new label carries its category and the facts typed into the row. The bottle is included when the
 * view is of bottles, or when anything was typed into a bottle cell, so typed values are never dropped.
 */
export function createBody(draft: DraftRow, cells: Readonly<Record<string, string>> | undefined, bottleView: boolean): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  const bottle: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(cells ?? {})) {
    const editor = EDITORS[column];
    if (column in LINKED_FACTS) {
      if (value !== "") facts[LINKED_FACTS[column]!] = value;
      continue;
    }
    if (editor?.links) {
      const rows: unknown = JSON.parse(value);
      if (Array.isArray(rows) && rows.length > 0) facts[{ distilleries: "distilleryLinks", mashbills: "mashbillLinks", finishes: "finishLinks", ingredients: "ingredientLinks" }[editor.links]] = editor.links === "ingredients" ? JSON.stringify(rows) : linksPayload(rows as never);
      continue;
    }
    if (!editor || editor.combo || value === "") continue;
    Object.assign(editor.scope === "label" ? facts : bottle, serverFields(editor, column, value));
  }
  const brand = draft.brand!;
  const label = draft.label!;
  return {
    brand: brand.kind === "existing" ? { id: brand.id } : { name: brand.name },
    label: label.kind === "existing" ? { id: label.id } : { name: label.name, categoryId: draft.categoryId, ...(Object.keys(facts).length > 0 ? { facts } : {}) },
    ...(bottleView || Object.keys(bottle).length > 0 ? { bottle } : {}),
  };
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

/** The sheet column a server field belongs to. A bottle's own proof and size are separate columns from the label's. */
const COLUMN_OF_FIELD: Record<string, { label: string; bottle: string }> = {
  brand: { label: "brand", bottle: "brand" },
  label: { label: "name", bottle: "name" },
  name: { label: "name", bottle: "name" },
  expressionId: { label: "name", bottle: "name" },
  categoryId: { label: "category", bottle: "category" },
  proof: { label: "proof", bottle: "ownProof" },
  sizeMl: { label: "sizeMl", bottle: "ownSize" },
  msrp: { label: "msrp", bottle: "msrp" },
  pricePaid: { label: "pricePaid", bottle: "pricePaid" },
  storeId: { label: "store", bottle: "store" },
  storeName: { label: "store", bottle: "store" },
  releaseId: { label: "releaseId", bottle: "releaseId" },
  expressionNameId: { label: "expressionNameId", bottle: "expressionNameId" },
  cooperageId: { label: "cooperageId", bottle: "cooperageId" },
  cooperageName: { label: "cooperageId", bottle: "cooperageId" },
  distilleries: { label: "distilleries", bottle: "distilleries" },
  mashbills: { label: "mashbills", bottle: "mashbills" },
  finishes: { label: "finishes", bottle: "finishes" },
  ingredients: { label: "ingredients", bottle: "ingredients" },
  finishLinks: { label: "finishes", bottle: "finishes" },
  distilleryLinks: { label: "distilleries", bottle: "distilleries" },
  mashbillLinks: { label: "mashbills", bottle: "mashbills" },
  ingredientLinks: { label: "ingredients", bottle: "ingredients" },
  dateAcquired: { label: "dateAcquired", bottle: "dateAcquired" },
  releaseYear: { label: "releaseYear", bottle: "releaseYear" },
  pickName: { label: "pickName", bottle: "pickName" },
  location: { label: "location", bottle: "location" },
  notes: { label: "notes", bottle: "notes" },
  status: { label: "status", bottle: "status" },
  fillPct: { label: "fillPct", bottle: "fillPct" },
  isOpen: { label: "isOpen", bottle: "isOpen" },
  dateOpened: { label: "dateOpened", bottle: "dateOpened" },
  dateKilled: { label: "dateKilled", bottle: "dateKilled" },
};

/** The cell a failed save is shown on: the first failing field that has a column, else `fallback`. */
export function failureColumn(fieldErrors: Readonly<Record<string, string>>, scope: "label" | "bottle", fallback: string): string {
  for (const field of Object.keys(fieldErrors)) {
    const column = COLUMN_OF_FIELD[field]?.[scope];
    if (column) return column;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// The corner notice
// ---------------------------------------------------------------------------

export type Blocked = { key: string; title: string; /** "cannot save until you …" */ action?: string; /** A failed save's reason. */ message?: string };

/** One line for one blocked row. */
export const blockedLine = (b: Blocked): string => (b.action ? `${b.title} cannot save until you ${b.action}.` : `${b.title} could not be saved: ${b.message ?? "something went wrong"}`);

/** What the notice says: the row itself when there is one, otherwise how many, and the first. */
export function noticeText(blocked: ReadonlyArray<Blocked>): string {
  if (blocked.length === 0) return "";
  if (blocked.length === 1) return blockedLine(blocked[0]!);
  return `${blocked.length} rows cannot save. First: ${blockedLine(blocked[0]!)}`;
}

// ---------------------------------------------------------------------------
// After a save
// ---------------------------------------------------------------------------

/** What was sent for a row, so that once the sheet has reloaded the edits that were saved can be dropped and later ones kept. */
export type Sent = { cells: Readonly<Record<string, string>>; move?: number };

/**
 * Drops each saved edit that is still exactly what was sent. An edit typed again while the save was on its way is
 * different, so it stays and saves next.
 */
export function settleEdits(edits: Edits, sent: ReadonlyMap<string, Sent>): Edits {
  let next = edits;
  for (const [key, { cells }] of sent) {
    const row = next[key];
    if (!row) continue;
    const kept = Object.fromEntries(Object.entries(row).filter(([column, value]) => cells[column] !== value));
    if (Object.keys(kept).length === Object.keys(row).length) continue;
    const { [key]: _gone, ...others } = next;
    next = Object.keys(kept).length > 0 ? { ...others, [key]: kept } : others;
  }
  return next;
}

export function settleMoves(moves: Moves, sent: ReadonlyMap<string, Sent>): Moves {
  let next = moves;
  for (const [key, { move }] of sent) {
    if (move !== undefined && next[key] === move) {
      const { [key]: _gone, ...rest } = next;
      next = rest;
    }
  }
  return next;
}

/**
 * A key for the empty row that is never one a draft has, and never one an earlier draft had: `floor` is one past the
 * highest key the sheet has handed out. A saved draft is removed, and if the empty row then took its key, React would
 * treat the row being typed into as a different row and close its editor.
 */
export function nextDraftKey(drafts: ReadonlyArray<{ key: string }>, floor = 0): string {
  return `d${drafts.reduce((max, d) => Math.max(max, Number(d.key.slice(1)) + 1), floor)}`;
}
