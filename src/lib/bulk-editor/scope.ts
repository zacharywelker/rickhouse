import type { Level, ValueField } from "./resolve";
import type { SheetRow } from "./sheet";

/**
 * Which level an edit to a value changes: the bottle's own, its vintage's, or the label's. Pure: the editor component
 * keeps the chosen level, and this says which levels a row has, where an edit starts, and how to step through them.
 */

const VINTAGE_FIELDS: ReadonlySet<ValueField> = new Set(["proof", "ageYears", "ageMonths", "ageDays", "ageStatement"]);
const hasVintage = (row: SheetRow) => row.bottle !== null && row.bottle.releaseId !== null && row.moved !== true;
const isPick = (row: SheetRow) => row.bottle !== null && (row.bottle.isSingleBarrel || row.bottle.isSingleBarrelPick);

/** The levels a row offers for a value, narrowest first. None for a new unsaved row or a label's own row: they have no choice. */
export function scopesFor(row: SheetRow, field?: ValueField): Level[] {
  if (row.draft || row.bottle === null) return [];
  return hasVintage(row) && (field === undefined || VINTAGE_FIELDS.has(field)) ? ["bottle", "vintage", "label"] : ["bottle", "label"];
}

/** Where an edit starts: this bottle for a single barrel or private selection, else its vintage, else the label. */
export function defaultScope(row: SheetRow, field?: ValueField): Level {
  if (row.draft || row.bottle === null) return "label";
  if (isPick(row)) return "bottle";
  return hasVintage(row) && (field === undefined || VINTAGE_FIELDS.has(field)) ? "vintage" : "label";
}

/** The next level (step 1) or the one before (step -1), wrapping round; the narrowest when `current` is not on offer. */
export function nextScope(levels: ReadonlyArray<Level>, current: Level, step: 1 | -1): Level {
  const at = levels.indexOf(current);
  if (at < 0) return levels[0] ?? current;
  return levels[(at + step + levels.length) % levels.length]!;
}

/** A bottle's own value is kept under the bottle's own editors (a label editor's edit on a bottle row would not reach the bottle). */
const OWN: Readonly<Record<string, string>> = {
  proof: "ownProof",
  sizeMl: "ownSize",
  ageYears: "ownAgeYears",
  ageMonths: "ownAgeMonths",
  ageDays: "ownAgeDays",
  ageStatement: "ownAgeStatement",
};

/** The column an edit is stored under at a level: the bottle's own editor for the bottle level, the column itself otherwise. */
export function columnFor(column: string, level: Level): string {
  return level === "bottle" ? (OWN[column] ?? column) : column;
}
