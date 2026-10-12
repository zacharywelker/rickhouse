import type { FieldGroup } from "@/db/schema";
import { ageFilled } from "@/lib/bottles/age";

/**
 * What a label's category decides about its form, as pure functions so the
 * form, the server and the tests all read one rule.
 *
 * The field group says what kind of spirit it is (whiskey, rum, gin…); the
 * kind below says which whiskey, because "Straight" is an American
 * designation and Scotch has regions instead.
 */
export type CategoryKind = "american" | "scotch" | "other";

/** Each category's kind, by walking up its parents: Bourbon is American, Blended Scotch is Scotch. */
export function categoryKinds(
  rows: ReadonlyArray<{ id: number; slug: string; parentId: number | null }>,
): Record<number, CategoryKind> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const kinds: Record<number, CategoryKind> = {};
  for (const row of rows) {
    let kind: CategoryKind = "other";
    const seen = new Set<number>();
    for (let at: (typeof rows)[number] | undefined = row; at && !seen.has(at.id); at = byId.get(at.parentId ?? -1)) {
      seen.add(at.id);
      if (at.slug === "american-whiskey") kind = "american";
      else if (at.slug === "scotch") kind = "scotch";
      else continue;
      break;
    }
    kinds[row.id] = kind;
  }
  return kinds;
}

/** Fields an unaged spirit has no use for: vodka always, gin until it is marked aged. */
export const AGING_FIELDS: ReadonlyArray<string> = [
  "ageYears",
  "ageMonths",
  "ageDays",
  "ageStatement",
  "isNas",
  "isStraight",
  "isCaskStrength",
  "isBottledInBond",
];

export type FormContext = {
  group: FieldGroup;
  /** Null when the caller does not know the kinds, which leaves Straight alone. */
  kind: CategoryKind | null;
  values: Record<string, unknown>;
  /** Gin only: the "aged" button. */
  ginAged: boolean;
};

/** Whether aging matters: not for vodka, and not for a gin nobody has marked aged. */
export function isUnaged(context: Pick<FormContext, "group" | "ginAged">): boolean {
  return context.group === "vodka" || (context.group === "gin" && !context.ginAged);
}

/** Whether a gin already carries something only an aged one has, so it opens as aged. */
export function looksAged(values: Record<string, unknown>, finishCount: number): boolean {
  return ageFilled(values) || String(values.ageStatement ?? "").trim() !== "" || values.isNas === true || finishCount > 0;
}

/** Label fields the form leaves out for this category and choices. */
export function hiddenFields(context: FormContext): Set<string> {
  const hidden = new Set<string>();
  if (isUnaged(context)) for (const name of AGING_FIELDS) hidden.add(name);
  // Straight and Bottled In Bond are American designations.
  if (context.kind !== null && context.kind !== "american") {
    hidden.add("isStraight");
    hidden.add("isBottledInBond");
  }
  if (context.values.isSolera !== "true") hidden.add("soleraRange");
  return hidden;
}

/** The finishes list: aging matters to it too. */
export const showsFinishes = (context: Pick<FormContext, "group" | "ginAged">) => !isUnaged(context);

/** Rum records its base where other spirits record a mashbill. */
export const baseReplacesMashbills = (group: FieldGroup) => group === "rum";

/** Regions belong to Scotch. */
export const showsRegions = (context: Pick<FormContext, "kind">) => context.kind === "scotch";

/** Bottled in Bond is 100 proof, always: 50% ABV. */
export const BOND_PROOF = "100";

/**
 * A partial edit (the phone's) with the bond rule applied: a label that is, or is being made, Bottled In Bond is
 * 100 proof whenever the edit touches proof or the tick. A proof sent alone for a bonded label is overridden too.
 */
export function withBondProof<T extends Record<string, unknown>>(columns: T, wasBonded: boolean): T {
  const bonded = columns.isBottledInBond === undefined ? wasBonded : columns.isBottledInBond === true;
  if (bonded && (columns.proof !== undefined || columns.isBottledInBond === true)) return { ...columns, proof: BOND_PROOF };
  return columns;
}

/** The comma-separated regions text the form holds, as a list. */
export function parseRegions(text: unknown): string[] {
  return [...new Set(String(text ?? "").split(",").map((part) => part.trim()).filter((part) => part !== ""))];
}
