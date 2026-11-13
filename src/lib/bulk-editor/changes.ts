import type { FieldGroup } from "@/db/schema";
import { derivedAge, type AgeState } from "./age-derive";
import { EDITORS, type CellEditor, type Edits } from "./editors";
import { isYesNoChoice } from "./fields";
import type { Candidate } from "./suggest";
import { compareRows, type SheetBottle, type SheetLabel, type SheetRow } from "./sheet";

/**
 * Where an edit is kept, which decides who it changes. A bottle's own cell is kept under the bottle's row, so it
 * changes that bottle. A label's cell is kept under the *label*, so every bottle row of that label shows it and the
 * save changes the label once, for all of its bottles. Rows that do not exist yet keep everything under their own key.
 */
export function editKey(row: SheetRow, editor: CellEditor): string {
  if (row.draft || editor.scope === "bottle") return row.key;
  return `l${row.label.id}`;
}

/** The edits a row shows: its own, and (for a saved row) the label's. Two lookups, so the stored objects stay stable. */
export const labelEditsOf = (edits: Edits, row: SheetRow): Readonly<Record<string, string>> | undefined => (row.draft ? undefined : edits[`l${row.label.id}`]);

// ---------------------------------------------------------------------------
// Moving a bottle to another label
// ---------------------------------------------------------------------------

/** Bottle row key to the id of the label it is moving to. A bottle's label is never renamed; it is changed. */
export type Moves = Readonly<Record<string, number>>;

/** Records a move, or forgets it when the bottle is put back on its own label. */
export function setMove(moves: Moves, key: string, target: number, original: number): Moves {
  if (target === original) {
    if (!(key in moves)) return moves;
    const { [key]: _gone, ...rest } = moves;
    return rest;
  }
  return moves[key] === target ? moves : { ...moves, [key]: target };
}

/** The saved rows with each moved bottle shown on the label it is moving to, so every label cell reads the new one. */
export function applyMoves(rows: ReadonlyArray<SheetRow>, moves: Moves, labels: ReadonlyArray<SheetLabel>): SheetRow[] {
  if (Object.keys(moves).length === 0) return [...rows];
  const byId = new Map(labels.map((label) => [label.id, label]));
  return rows.map((row) => {
    const target = moves[row.key] === undefined ? undefined : byId.get(moves[row.key]!);
    return target ? { ...row, label: target, moved: true } : row;
  });
}

/**
 * A rename or a change of brand typed into a label (kept under the label, see `editKey`), shown on every row of that
 * label. Rows of other labels are returned as they are, so they are not drawn again.
 */
export type CategoryInfo = Readonly<Record<number, { name: string; group: FieldGroup; slug?: string }>>;

export function applyLabelEdits(rows: ReadonlyArray<SheetRow>, edits: Edits, categories: CategoryInfo = {}): SheetRow[] {
  return rows.map((row) => {
    const own = row.draft ? undefined : edits[`l${row.label.id}`];
    if (!own || (own.name === undefined && own.brand === undefined && own.category === undefined)) return row;
    // A new category changes which of the label's cells apply, at once; what is stored for the others is kept.
    const id = own.category !== undefined && own.category.startsWith("id:") ? Number(own.category.slice(3)) : null;
    const chosen = id === null ? undefined : categories[id];
    return {
      ...row,
      label: {
        ...row.label,
        ...(own.name !== undefined ? { name: own.name } : {}),
        ...(own.brand !== undefined ? { brand: own.brand } : {}),
        ...(chosen && id !== null ? { categoryId: id, category: chosen.name, fieldGroup: chosen.group, ...(chosen.slug ? { categorySlug: chosen.slug } : {}) } : {}),
      },
    };
  });
}

/** What an edited value stands for on the row's own data: the fields it sets, as the row holds them. */
function rawOf(editor: CellEditor, value: string): Record<string, unknown> {
  if (editor.fieldsOf) return editor.fieldsOf(value);
  const { spec } = editor;
  if (spec.kind === "checkbox") return { [editor.field]: value === "true" };
  // A choice keeps its text (a yes/no choice reads "true" or "false" back into the form's own value); the rest is blank when blank.
  if (spec.kind === "select" || spec.kind === "slider" || isYesNoChoice(spec)) return { [editor.field]: value };
  return { [editor.field]: value === "" ? null : value };
}

/**
 * What has been typed into a row's cells, put onto the row's own label and bottle data, so that everything that reads a
 * row (its cells, which cells apply to it, the rail) sees it. A cell that gates others, like Private pick, then opens
 * them at once instead of once the save has been read back. Rows with nothing typed are returned as they are.
 */
export function applyEdits(rows: ReadonlyArray<SheetRow>, edits: Edits): SheetRow[] {
  return rows.map((row) => {
    const labelCells = row.draft ? edits[row.key] : edits[`l${row.label.id}`];
    const bottleCells = row.bottle ? edits[row.key] : undefined;
    if (!labelCells && !bottleCells) return row;
    let label: unknown = row.label;
    let bottle: unknown = row.bottle;
    const whiskey = row.label.fieldGroup === "whiskey";
    const put = (cells: Readonly<Record<string, string>> | undefined, scope: "label" | "bottle") => {
      const changed: Record<string, unknown> = {};
      for (const [column, value] of Object.entries(cells ?? {})) {
        const editor = EDITORS[column];
        if (!editor || editor.combo || editor.reference || editor.links || editor.panel || editor.scope !== scope) continue;
        Object.assign(changed, rawOf(editor, value));
      }
      if (Object.keys(changed).length === 0) return;
      // A whiskey's statement fills the years in, and typed years mark the age entered: what the server will do, shown now.
      const extra = derivedAge(scope === "label" ? (row.label as AgeState) : (row.bottle as unknown as AgeState), changed, whiskey);
      if (scope === "label") label = { ...(label as object), ...changed, ...extra };
      else bottle = { ...(bottle as object), ...changed, ...extra };
    };
    put(labelCells, "label");
    put(bottleCells, "bottle");
    return { ...row, label: label as SheetLabel, bottle: bottle as SheetBottle | null };
  });
}

/**
 * The saved rows as the person has just left them: a moved bottle on its new label, a renamed label under its new name,
 * and every row in the place that puts it in. A row goes to its sorted place the moment it is changed, not when the
 * save has been read back, so the cursor and the view can follow it (or stay behind) right away.
 */
export function arrange(rows: ReadonlyArray<SheetRow>, moves: Moves, edits: Edits, labels: ReadonlyArray<SheetLabel>, categories: CategoryInfo = {}): SheetRow[] {
  const renamed = Object.keys(moves).length > 0 || Object.values(edits).some((cells) => "name" in cells || "brand" in cells || "category" in cells);
  const typed = applyEdits(rows, edits);
  if (!renamed) return typed;
  return applyLabelEdits(applyMoves(typed, moves, labels), edits, categories).sort(compareRows);
}

/**
 * What a saved bottle's Brand or Label cell offers: labels that already exist, never a new one (a move only picks).
 * From the Brand cell it is every label, named with its brand, so "four ro" finds Four Roses and a mistake in the brand
 * is fixed in one pick. From the Label cell it is the labels under the bottle's current brand, the usual fix.
 */
export function moveCandidates(column: "brand" | "name", row: SheetRow, labels: ReadonlyArray<SheetLabel>): Candidate[] {
  if (column === "brand") return labels.map((l) => ({ id: l.id, name: `${l.brand} ${l.name}`, hint: l.category }));
  return labels.filter((l) => l.brandId === row.label.brandId).map((l) => ({ id: l.id, name: l.name, hint: l.category }));
}

// ---------------------------------------------------------------------------
// What saving would send
// ---------------------------------------------------------------------------

export type BottleChange = { bottleId: number; fields: Record<string, string>; moveToLabelId?: number };
export type LabelChange = { labelId: number; fields: Record<string, string>; /** Every bottle on the label takes it. */ bottles: number };
export type Changes = { bottles: BottleChange[]; labels: LabelChange[] };

/**
 * The edits as requests: one per bottle for its own cells (and its move), one per label for the label's. A label edit
 * is one request however many rows show it, and says how many bottles it reaches. Rows not saved yet are not here.
 */
export function buildChanges(edits: Edits, moves: Moves, labels: ReadonlyArray<SheetLabel>, bottles: ReadonlyArray<SheetBottle>): Changes {
  // The Label column is a pick on a new row (its field is "label") but a typed rename on a saved label, which the server calls "name".
  const fieldOf = (column: string) => (column === "name" ? "name" : (EDITORS[column]?.field ?? column));
  const byBottle = new Map<number, BottleChange>();
  const out: Changes = { bottles: [], labels: [] };
  const bottle = (id: number) => {
    let change = byBottle.get(id);
    if (!change) {
      change = { bottleId: id, fields: {} };
      byBottle.set(id, change);
      out.bottles.push(change);
    }
    return change;
  };

  for (const [key, cells] of Object.entries(edits)) {
    const id = Number(key.slice(1));
    const fields = Object.fromEntries(Object.entries(cells).map(([column, value]) => [fieldOf(column), value]));
    if (key.startsWith("b") && bottles.some((b) => b.id === id)) Object.assign(bottle(id).fields, fields);
    else if (key.startsWith("l")) {
      const label = labels.find((l) => l.id === id);
      if (label) out.labels.push({ labelId: id, fields, bottles: label.bottleCount });
    }
  }
  for (const [key, target] of Object.entries(moves)) {
    const id = Number(key.slice(1));
    if (bottles.some((b) => b.id === id)) bottle(id).moveToLabelId = target;
  }
  return out;
}
