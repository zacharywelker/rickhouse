import { inferredAge } from "./age";
import type { SheetBottle, SheetContext, SheetLabel, SheetRow, SheetVintage } from "./sheet";

/**
 * What a cell shows for a value that can come from three places: the bottle's own, else its vintage's (a label's
 * vintage), else the label's. Pure, so the rule is testable and the cells, the sort and the edit note all agree.
 */

export type Level = "bottle" | "vintage" | "label";
/** The fields that resolve this way. A vintage has proof and the four age fields; the rest go bottle, then label. */
export type ValueField = "proof" | "sizeMl" | "ageYears" | "ageMonths" | "ageDays" | "ageStatement" | "tequilaClass" | "brandyGrade" | "ginIsNas";
/** The small tag that says a value is not the label's own. */
export type Marker = "V" | "SB" | "PS" | "SB PS" | "B";
export type Resolved = {
  value: string | null;
  level: Level;
  marker: Marker | null;
  /** A label with no value of its own whose vintages (or, for a cask strength label, whose bottles) disagree. Display only. */
  varies: boolean;
  /** The age a designation implies (Straight, Bottled in Bond), worked out and never stored. Only ever the label's, and last. */
  derived: boolean;
};

const VINTAGE_FIELDS: ReadonlySet<ValueField> = new Set(["proof", "ageYears", "ageMonths", "ageDays", "ageStatement"]);

/** The lookups the resolver needs, built once per load of the sheet and not per cell. */
export type SheetIndex = {
  vintageById: ReadonlyMap<number, SheetVintage>;
  vintagesByLabel: ReadonlyMap<number, ReadonlyArray<SheetVintage>>;
  bottlesByLabel: ReadonlyMap<number, ReadonlyArray<SheetBottle>>;
};

/** `labels` is part of the signature for callers that hold all three lists; the lookups need only bottles and vintages. */
export function indexSheet(_labels: ReadonlyArray<SheetLabel>, bottles: ReadonlyArray<SheetBottle>, vintages: ReadonlyArray<SheetVintage>): SheetIndex {
  const group = <T,>(items: ReadonlyArray<T>, by: (item: T) => number) => {
    const out = new Map<number, T[]>();
    for (const item of items) {
      const key = by(item);
      const list = out.get(key);
      if (list) list.push(item);
      else out.set(key, [item]);
    }
    return out;
  };
  return { vintageById: new Map(vintages.map((v) => [v.id, v])), vintagesByLabel: group(vintages, (v) => v.labelId), bottlesByLabel: group(bottles, (b) => b.expressionId) };
}

const filled = (value: unknown): boolean => value !== null && value !== undefined && String(value).trim() !== "";
const asText = (value: unknown): string | null => (filled(value) ? String(value) : null);

function bottleValue(b: SheetBottle, field: ValueField): string | null {
  return asText((b as unknown as Record<string, unknown>)[field]);
}
function vintageValue(v: SheetVintage, field: ValueField): string | null {
  return asText((v as unknown as Record<string, unknown>)[field]);
}
function labelValue(l: SheetLabel, field: ValueField): string | null {
  if (field === "ginIsNas") return String(l.isNas === true);
  return asText((l as unknown as Record<string, unknown>)[field]);
}

/** The marker for a value that comes from this level of this row. The label's own has none. */
export function markerFor(row: SheetRow, level: Level): Marker | null {
  if (level === "label") return null;
  if (level === "vintage") return "V";
  const b = row.bottle;
  if (b?.isSingleBarrel && b.isSingleBarrelPick) return "SB PS";
  if (b?.isSingleBarrel) return "SB";
  if (b?.isSingleBarrelPick) return "PS";
  return "B";
}

/** How many different values there are. Numbers compare as numbers (112 and 112.0 agree); an age statement is text and compares as text. */
const distinct = (values: ReadonlyArray<string | null>, text = false): number => new Set(values.filter((v): v is string => v !== null).map((v) => (text ? v.trim().toLowerCase() : Number(v)))).size;

export function resolve(field: ValueField, row: SheetRow, ctx: Pick<SheetContext, "kinds" | "index">): Resolved {
  const { label, bottle } = row;
  const fromLabel = labelValue(label, field);
  const index = ctx.index;

  if (bottle) {
    const own = bottleValue(bottle, field);
    if (own !== null) return { value: own, level: "bottle", marker: markerFor(row, "bottle"), varies: false, derived: false };
    if (VINTAGE_FIELDS.has(field) && bottle.releaseId !== null) {
      const vintage = index?.vintageById.get(bottle.releaseId);
      const v = vintage ? vintageValue(vintage, field) : null;
      if (v !== null) return { value: v, level: "vintage", marker: "V", varies: false, derived: false };
    }
  }

  if (fromLabel !== null) return { value: fromLabel, level: "label", marker: null, varies: false, derived: false };

  // Nothing stored anywhere: a designation may imply an age, and a label row may say its values vary.
  if (field === "ageYears") {
    const implied = inferredAge(label, ctx.kinds);
    if (implied) return { value: implied.text, level: "label", marker: null, varies: false, derived: true };
  }
  const varies = !bottle && VINTAGE_FIELDS.has(field) && (
    distinct((index?.vintagesByLabel.get(label.id) ?? []).map((v) => vintageValue(v, field)), field === "ageStatement") > 1 ||
    (field === "proof" && label.isCaskStrength === true && distinct((index?.bottlesByLabel.get(label.id) ?? []).map((b) => bottleValue(b, field))) > 1)
  );
  return { value: null, level: "label", marker: null, varies, derived: false };
}
