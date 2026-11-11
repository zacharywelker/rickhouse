import { EDITORS, type CellEditor, type Edits } from "./editors";
import type { Candidate } from "./suggest";
import type { SheetBottle, SheetLabel, SheetRow } from "./sheet";

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
