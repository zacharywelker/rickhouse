import type { FieldGroup } from "@/db/schema";
import { ageFilled, withAgeDefaults } from "@/lib/bottles/age";
import { BRANDY_MINIMUM_YEARS, UNDER_A_YEAR_CLASSES, isAgaveKind, isFrenchBrandy } from "./spirit-details";
import { isGinKind, NAVY_GIN_PROOF } from "./gin-details";

/**
 * What a label's category decides about its form, as pure functions so the
 * form, the server and the tests all read one rule.
 *
 * The field group says what kind of spirit it is (whiskey, rum, gin…); the
 * kind below says which whiskey, because "Straight" is an American
 * designation and Scotch has regions instead.
 */
export type CategoryKind = "american" | "canadian" | "irish" | "scotch" | "tequila" | "mezcal" | "cognac" | "armagnac" | "calvados" | "pisco" | "gin" | "genever" | "vodka" | "flavored-vodka" | "amaro" | "liqueur" | "chocolate-liqueur" | "cream-liqueur" | "other" | "japanese" | "international" | "flavored-whisky" | "cachaca" | "agricole" | "spiced-rum" | "apple" | "eau-de-vie" | "absinthe" | "akvavit" | "shochu";

const SPECIAL_KINDS = new Set<CategoryKind>([
  "tequila", "mezcal", "cognac", "armagnac", "calvados", "pisco", "genever",
  "japanese", "international", "flavored-whisky", "cachaca", "agricole", "spiced-rum",
  "apple", "eau-de-vie", "absinthe", "akvavit", "shochu",
]);

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
      else if (at.slug === "canadian-whisky") kind = "canadian";
      else if (at.slug === "irish-whiskey") kind = "irish";
      else if (at.slug === "scotch") kind = "scotch";
      else if (at.slug === "flavored-vodka") kind = "flavored-vodka";
      else if (at.slug === "vodka") kind = "vodka";
      else if (at.slug === "amaro") kind = "amaro";
      else if (at.slug === "chocolate-liqueur") kind = "chocolate-liqueur";
      else if (at.slug === "cream-liqueur") kind = "cream-liqueur";
      else if (at.slug === "liqueur") kind = "liqueur";
      else if (at.slug === "gin") kind = "gin";
      else if (SPECIAL_KINDS.has(at.slug as CategoryKind)) kind = at.slug as CategoryKind;
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
  "barrelFilledOn",
  "bottledOn",
];

export type FormContext = {
  group: FieldGroup;
  /** Null when the caller does not know the kinds, which leaves Straight alone. */
  kind: CategoryKind | null;
  /** The category's own slug; omitted or null when unknown. */
  slug?: string | null;
  values: Record<string, unknown>;
  /** Gin only: the "aged" button. */
  ginAged: boolean;
};

/** The groups that have an Aged toggle and are unaged until it is on (gin has its own, `isAgedGin`). */
export const usesAgedToggle = (group: string | null) => group === "amaro" || group === "liqueur" || group === "rum";

/** Whether aging matters: not for vodka, and not for a gin, amaro, liqueur or rum nobody has marked aged. */
export function isUnaged(context: Pick<FormContext, "group" | "ginAged"> & { values?: Record<string, unknown> }): boolean {
  return context.group === "vodka" || (context.group === "gin" && !context.ginAged) ||
    (usesAgedToggle(context.group) && context.values?.isAged !== true);
}

/** Whether a gin already carries something only an aged one has, so it opens as aged. */
export function looksAged(values: Record<string, unknown>, finishCount: number): boolean {
  return ageFilled(values) || String(values.ageStatement ?? "").trim() !== "" || values.isNas === true || finishCount > 0;
}

/** Peat applies to these whisky kinds and to American Single Malt, keyed by its stable slug. */
export function peatKindFor(context: { kind: CategoryKind | null; slug?: string | null }): boolean {
  return context.kind === "irish" || context.kind === "scotch" || context.kind === "japanese" ||
    context.kind === "international" || context.slug === "american-single-malt";
}

/** Label fields the form leaves out for this category and choices. */
export function hiddenFields(context: FormContext): Set<string> {
  const hidden = new Set<string>();
  // Solera is an aged rum's: its range goes with the age.
  if (isUnaged(context)) for (const name of [...AGING_FIELDS, "isSolera", "soleraRange"]) hidden.add(name);
  if (!isAgaveKind(context.kind)) hidden.add("tequilaClass");
  if (!context.kind || !BRANDY_MINIMUM_YEARS[context.kind]) hidden.add("brandyGrade");
  if (isAgaveKind(context.kind)) {
    hidden.add("barrelFilledOn");
    hidden.add("bottledOn");
    hidden.add("isNas");
  }
  if (isAgaveKind(context.kind) || isGinKind(context.kind)) hidden.add("isCaskStrength");
  if (isFrenchBrandy(context.kind)) hidden.add("isNas");
  if (context.kind === "tequila") hidden.add("ageStatement");
  // Blanco and Reposado are under a year by law: months and days, never years.
  if (isAgaveKind(context.kind) && UNDER_A_YEAR_CLASSES.includes(String(context.values.tequilaClass ?? ""))) hidden.add("ageYears");
  if (isGinKind(context.kind)) {
    // A gin is aged in years and months: no dates, no statement, no days. Genever has a class where gin has a style.
    hidden.add("barrelFilledOn"); hidden.add("bottledOn"); hidden.add("ageStatement"); hidden.add("ageDays");
  } else {
    hidden.add("ginStyle"); hidden.add("isAgedGin");
  }
  if (!usesAgedToggle(context.group)) hidden.add("isAged");
  // A Rhum Agricole is pure cane juice: nothing is added.
  if (context.kind === "agricole") hidden.add("sugarGPerL");
  if (context.group === "amaro" || context.group === "liqueur") {
    hidden.add("ageDays"); hidden.add("barrelFilledOn"); hidden.add("bottledOn");
    hidden.add("isCaskStrength"); hidden.add("isStillProof");
  }
  if (context.group !== "amaro") hidden.add("amaroStyle");
  if (context.group !== "amaro" && context.group !== "liqueur") {
    hidden.add("originCountry"); hidden.add("originRegion");
  }
  if (context.group !== "liqueur" || !["liqueur", "chocolate-liqueur", "cream-liqueur"].includes(context.kind ?? "")) hidden.add("dairyStatus");
  if (context.group === "whiskey") {
    hidden.add("isChillFiltered"); hidden.add("colorAdded"); hidden.add("charLevel");
    if (context.kind === "scotch") {
      hidden.add("entryProof"); hidden.add("isAdditiveFree");
    } else if (context.kind === "american") hidden.add("isAdditiveFree");
    if (!peatKindFor(context)) hidden.add("peatStatus");
  } else {
    hidden.add("isNonChillFiltered"); hidden.add("peatStatus");
  }
  // Straight and Bottled In Bond are American designations.
  if (context.kind !== null && context.kind !== "american") {
    hidden.add("isStraight");
    hidden.add("isBottledInBond");
  }
  if (context.values.isSolera !== "true") hidden.add("soleraRange");
  for (const [name, flag] of Object.entries(STRENGTH_FLAGS)) if (!flag.groups.includes(context.group)) hidden.add(name);
  // Still proof is for the unaged: an age, or a statement, rules it out.
  if (ageFilled(context.values) || String(context.values.ageStatement ?? "").trim() !== "") hidden.add("isStillProof");
  return hidden;
}

/** Designations a label ticks for itself, and the spirits that offer each. Still Proof is an unaged agave spirit's. */
export const STRENGTH_FLAGS: Record<string, { groups: ReadonlyArray<FieldGroup>; label: string }> = {
  isStillProof: { groups: ["agave"], label: "Still Proof" },
};

export type StrengthTier = "navy" | "overproof";

export const STRENGTH_TIER_LABELS: Record<StrengthTier, string> = { navy: "Navy Strength", overproof: "Overproof" };

/**
 * Navy Strength and Overproof, worked out from the proof (ABV is half of it) rather than ticked, so they cannot
 * go stale when the proof changes and a bottle with a proof of its own gets its own. Rum is Navy Strength from 54%
 * ABV and Overproof from 57%; gin has no Overproof, so it is Navy Strength from 54% up. Anything else has neither.
 */
export function strengthTier(group: FieldGroup | null | undefined, proof: unknown): StrengthTier | null {
  if (group !== "rum" && group !== "gin") return null;
  const text = String(proof ?? "").trim();
  if (text === "") return null;
  const abv = Number(text) / 2;
  if (!Number.isFinite(abv)) return null;
  if (group === "rum" && abv >= 57) return "overproof";
  return group === "gin" ? (Number(proof) >= NAVY_GIN_PROOF ? "navy" : null) : abv >= 54 ? "navy" : null;
}

/** What a name can say about a label; each ticks or sets something when the name starts to say it. */
export type NameFlag = "isCaskStrength" | "isBottledInBond" | "fullProof";

const NAME_RULES: ReadonlyArray<{ flag: NameFlag; pattern: RegExp }> = [
  {
    flag: "isCaskStrength",
    pattern: /\b(cask[\s-]strength|barrel[\s-]proof|rickhouse[\s-]proof|barrel[\s-]strength|straight[\s-]from[\s-]the[\s-]barrel)\b/i,
  },
  { flag: "isBottledInBond", pattern: /\b(bib|bottled[\s-]in[\s-]bond|bonded)\b/i },
  { flag: "fullProof", pattern: /\bfull[\s-]proof\b/i },
];

export type NameContext = { group: FieldGroup; kind: CategoryKind | null };

/** Whether a name's say-so means anything for this spirit: cask strength needs an age, bond and full proof need whiskey. */
function nameFlagApplies(flag: NameFlag, { group, kind }: NameContext): boolean {
  if (flag === "isCaskStrength") return group === "whiskey" || group === "rum" || group === "brandy";
  if (flag === "fullProof") return group === "whiskey";
  return group === "whiskey" && kind === "american";
}

/** The words in `name` that say something about the label, by what they say. */
export function nameSays(name: unknown, context: NameContext): Partial<Record<NameFlag, string>> {
  const found: Partial<Record<NameFlag, string>> = {};
  for (const rule of NAME_RULES) {
    const match = rule.pattern.exec(String(name ?? ""));
    if (match && nameFlagApplies(rule.flag, context)) found[rule.flag] = match[0];
  }
  return found;
}

/** The category a label's values name, as the rules read it; no category is "other" and no kinds is unknown. */
export function nameContextFor(
  values: Record<string, unknown>,
  groups: Record<number, FieldGroup>,
  kinds?: Record<number, CategoryKind>,
): NameContext {
  const raw = values.categoryId;
  const id = typeof raw === "string" && raw !== "" ? Number(raw) : typeof raw === "number" ? raw : null;
  return {
    group: (id !== null ? groups[id] : undefined) ?? "other",
    kind: kinds ? (id !== null ? (kinds[id] ?? "other") : "other") : null,
  };
}

const blank = (value: unknown) => String(value ?? "").trim() === "";

/**
 * What the name does when it starts to say something it did not before: Cask Strength gets ticked, Bottled In
 * Bond gets ticked with its 100 proof and 4 years, and Full Proof copies the proof into Entry Proof. Only on the
 * change, so unticking by hand sticks while the name still says it; and the category counts too, so a name typed
 * before its category still takes effect once the category fits. Entry Proof then keeps following Proof until it
 * is changed by hand.
 */
export function withNameRules<T extends Record<string, unknown>>(
  prev: T,
  next: T,
  resolve: (values: T) => NameContext,
): T {
  const before = nameSays(prev.name, resolve(prev));
  const after = nameSays(next.name, resolve(next));
  let out = next;
  if (after.isCaskStrength !== undefined && before.isCaskStrength === undefined) out = { ...out, isCaskStrength: true };
  if (after.isBottledInBond !== undefined && before.isBottledInBond === undefined) {
    out = withAgeDefaults(out, { ...out, isBottledInBond: true, proof: BOND_PROOF }, "isBottledInBond");
  }
  if (after.fullProof !== undefined) {
    const justSaid = before.fullProof === undefined;
    const followed = blank(prev.entryProof) || String(prev.entryProof) === String(prev.proof ?? "");
    const proofMoved = String(out.proof ?? "") !== String(prev.proof ?? "");
    if (justSaid ? blank(out.entryProof) : proofMoved && followed) out = { ...out, entryProof: out.proof };
  }
  return out;
}

/**
 * The columns the name rules set on a saved label beyond what the edit itself sent: `current` is the label as
 * stored, `facts` the change. A column the edit named is left as sent.
 */
export function nameRuleColumns(
  current: Record<string, unknown>,
  facts: Record<string, unknown>,
  resolve: (values: Record<string, unknown>) => NameContext,
): Record<string, unknown> {
  const next = { ...current, ...facts };
  const out = withNameRules(current, next, resolve);
  return Object.fromEntries(Object.entries(out).filter(([key, value]) => value !== next[key] && !(key in facts)));
}

/** Whether Entry Proof should follow Proof: the name says Full Proof. */
export const followsProof = (name: unknown, context: NameContext) => nameSays(name, context).fullProof !== undefined;

/** Corn and Light whiskey have no finishes: their Barrel type is one of these, or a finish of the owner's own. */
export const BARREL_TYPE_SUGGESTIONS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "corn-whiskey": ["Uncharred", "Used"],
  "light-whiskey": ["Uncharred", "Used"],
};

/**
 * Whether the finishes picker is a Barrel type (one optional value, the same finish data under another name): agave, an aged gin
 * (not genever), and Corn and Light whiskey, keyed by slug. Not yet: mezcal of the class Madurado en Vidrio, which the app cannot say.
 */
export function barrelTypeKind(context: { group: FieldGroup; kind: CategoryKind | null; slug?: string | null; ginAged: boolean }): boolean {
  return context.group === "agave" || (context.kind === "gin" && context.ginAged) || (context.slug != null && context.slug in BARREL_TYPE_SUGGESTIONS);
}

/** The finishes list: aging matters to it too. */
export const showsFinishes = (context: Pick<FormContext, "group" | "ginAged"> & { values?: Record<string, unknown> }) => !isUnaged(context);

/** Rum records its base where other spirits record a mashbill. */
export const baseReplacesMashbills = (group: FieldGroup) => group === "rum";

/** The categories whose recipe is fixed at 100% malted barley: the two Single Malts and Blended Malt Scotch. */
export const isSingleMaltCategory = (slug: unknown) => slug === "american-single-malt" || slug === "single-malt-scotch" || slug === "blended-malt-scotch";

/** Regions belong to Scotch. */
export const showsRegions = (context: Pick<FormContext, "kind">) => context.kind === "scotch";

/** Bottled in Bond is 100 proof, always: 50% ABV. */
export const BOND_PROOF = "100";

/** Restore the pre-bond proof on untick unless it has since been edited by hand. */
export function proofAfterBondToggle(input: {
  bonded: boolean;
  proof: string;
  stashed: string | null;
}): { proof: string; stashed: string | null } {
  const { bonded, proof, stashed } = input;
  if (bonded) return { proof: BOND_PROOF, stashed: proof === BOND_PROOF ? stashed : proof };
  return { proof: proof === BOND_PROOF && stashed !== null ? stashed : proof, stashed: null };
}

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

export type ProofSpread = { min: number; max: number; releases: number; bottles: number };

/** The lowest and highest proof across a label's vintages and bottles, or null when none has one. */
export function proofSpread(releaseProofs: ReadonlyArray<unknown>, bottleProofs: ReadonlyArray<unknown>): ProofSpread | null {
  const numbers = (list: ReadonlyArray<unknown>) =>
    list.filter((value) => String(value ?? "").trim() !== "").map(Number).filter(Number.isFinite);
  const releases = numbers(releaseProofs);
  const bottles = numbers(bottleProofs);
  const all = [...releases, ...bottles];
  if (all.length === 0) return null;
  return { min: Math.min(...all), max: Math.max(...all), releases: releases.length, bottles: bottles.length };
}

/** What a cask-strength label shows for its proof: the one known proof, "126.1 - 132.7", or "Cask Strength". */
export function spreadLabel(spread: ProofSpread | null): string {
  if (!spread) return "Cask Strength";
  return spread.min === spread.max ? String(spread.min) : `${spread.min} - ${spread.max}`;
}

/** A label's usual barrel-fill (distillation) and bottling dates, which a bottle goes by unless it has its own. */
export type LabelDates = { barrelFilledOn: string | null; bottledOn: string | null };
