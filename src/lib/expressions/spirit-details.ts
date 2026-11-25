import { normalizeCountry } from "@/lib/places";
import type { CategoryKind } from "./rules";
import { isGinKind } from "./gin-details";

export const AMARO_STYLES = ["Fernet", "Alpine", "Citrus", "New-World", "Old-World", "Medium-Bodied", "Aperitivo", "Carciofo", "Genepy", "Rabarbaro"] as const;
export const PEAT_STATUSES = ["unknown", "unpeated", "peated"] as const;
export const DAIRY_STATUSES = ["unknown", "dairy", "non-dairy"] as const;

/** Category composition is known even when a producer's exact recipe is not. */
export function whiskeyCategoryGrains(slug: string): string | null {
  if (slug === "single-malt-scotch" || slug === "malt-irish-whiskey") return "100% malted barley";
  if (slug === "pot-still-irish-whiskey") return "Malted and unmalted barley (at least 30% each; exact shares unknown)";
  return null;
}

export const TEQUILA_CLASSES = ["blanco", "joven", "reposado", "anejo", "extra-anejo", "cristalino"] as const;
export type TequilaClass = (typeof TEQUILA_CLASSES)[number];
export const TEQUILA_CLASS_LABELS: Record<TequilaClass, string> = {
  blanco: "Blanco", joven: "Joven", reposado: "Reposado", anejo: "Añejo",
  "extra-anejo": "Extra Añejo", cristalino: "Cristalino",
};
export const TEQUILA_CLASS_GUIDANCE: Partial<Record<TequilaClass, string>> = {
  blanco: "0–2 months", reposado: "2 months–1 year", anejo: "1–3 years",
  "extra-anejo": "3+ years",
};
/**
 * Every age designation any kind has. A kind offers some of them (`BRANDY_MINIMUM_YEARS`): Cognac VS, VSOP, XO; Armagnac
 * adds Napoléon and Hors d'Âge; Calvados has Vieux, and its "VS" is Fine. The values are what is stored and printed as the statement.
 */
export const BRANDY_GRADES = ["VS", "Vieux", "VSOP", "Napoléon", "XO", "Hors d'Âge"] as const;
export type BrandyGrade = (typeof BRANDY_GRADES)[number];

/**
 * Minimum age of the youngest component, in order of age. This is guidance, not a known age. The Armagnac figures are the
 * designer's recollection of the official ones and still to be verified (design record, section 9).
 */
export const BRANDY_MINIMUM_YEARS: Partial<Record<CategoryKind, Partial<Record<BrandyGrade, number>>>> = {
  cognac: { VS: 2, VSOP: 4, XO: 10 },
  armagnac: { VS: 1, VSOP: 4, Napoléon: 6, XO: 10, "Hors d'Âge": 10 },
  calvados: { VS: 2, Vieux: 3, VSOP: 4, XO: 6 },
};

/** What a designation is called where the kind has its own word for it. */
export const BRANDY_GRADE_NAMES: Partial<Record<CategoryKind, Partial<Record<BrandyGrade, string>>>> = {
  calvados: { VS: "Fine (VS)", Vieux: "Vieux / Réserve", VSOP: "VSOP / VO / Vieille Réserve", XO: "XO / Napoléon / Hors d'Âge" },
  armagnac: { VS: "VS / Three-Star" },
};

/** The designations a kind offers, youngest first. */
export const brandyGradesFor = (kind: CategoryKind | null): BrandyGrade[] =>
  kind && BRANDY_MINIMUM_YEARS[kind] ? BRANDY_GRADES.filter((grade) => grade in BRANDY_MINIMUM_YEARS[kind]!) : [];

/** The designation an age reaches: the oldest whose minimum it meets. Hors d'Âge is never worked out (it shares XO's minimum). */
export function brandyGradeFromYears(kind: CategoryKind | null, years: number): BrandyGrade | null {
  let found: BrandyGrade | null = null;
  for (const grade of brandyGradesFor(kind)) if (grade !== "Hors d'Âge" && years >= BRANDY_MINIMUM_YEARS[kind!]![grade]!) found = grade;
  return found;
}

const STATEMENT_WORDS: ReadonlyArray<[BrandyGrade, RegExp]> = [
  ["Hors d'Âge", /hors d.?age/],
  ["Napoléon", /napoleon/],
  ["VSOP", /\bv\.?s\.?o\.?p\b|vieille reserve|\bv\.?o\b/],
  ["XO", /\bx\.?o\b/],
  ["Vieux", /vieux|\breserve\b/],
  ["VS", /\bv\.?s\b|three.?star|\b3.?star|\bfine\b/],
];

/** The designation an age statement's words name, for the kind that has it ("Napoleon", "V.S.O.P."), or null. */
export function brandyGradeFromStatement(kind: CategoryKind | null, statement: string): BrandyGrade | null {
  const text = statement.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const offered = brandyGradesFor(kind);
  return STATEMENT_WORDS.find(([grade, pattern]) => offered.includes(grade) && pattern.test(text))?.[0] ?? null;
}

/** An age as years, from the years, months and days typed (blank counts as nothing); null when none is typed. */
export function ageInYears(years: unknown, months: unknown, days: unknown): number | null {
  const n = (value: unknown) => (String(value ?? "").trim() === "" ? null : Number(value));
  const [y, m, d] = [n(years), n(months), n(days)];
  if ([y, m, d].every((value) => value === null) || [y, m, d].some((value) => value !== null && !Number.isFinite(value))) return null;
  return (y ?? 0) + (m ?? 0) / 12 + (d ?? 0) / 365;
}

/** The class an age reaches (typing an age sets the class): under 2 months Blanco, under a year Reposado, a year Añejo, three Extra Añejo (tequila only). */
export function agaveClassFromYears(kind: CategoryKind | null, years: number): TequilaClass | null {
  if (!isAgaveKind(kind)) return null;
  if (years < 2 / 12 - 1e-9) return "blanco";
  if (years < 1 - 1e-9) return "reposado";
  return kind === "tequila" && years >= 3 - 1e-9 ? "extra-anejo" : "anejo";
}

/** The classes whose typing is manual: an age never moves a Joven or a Cristalino. */
export const MANUAL_AGAVE_CLASSES: ReadonlyArray<string> = ["joven", "cristalino"];
/** Blanco and Reposado are legally under a year: they take months and days, never years. */
export const UNDER_A_YEAR_CLASSES: ReadonlyArray<string> = ["blanco", "reposado"];

export const isAgaveKind = (kind: CategoryKind | null) => kind === "tequila" || kind === "mezcal";
export const isFrenchBrandy = (kind: CategoryKind | null) => kind === "cognac" || kind === "armagnac" || kind === "calvados";
export const hidesWarehouse = (group: string, kind: CategoryKind | null) =>
  group === "rum" || group === "brandy" || group === "gin" || group === "vodka" || group === "amaro" || group === "liqueur" || group === "other" ||
  kind === "canadian" || kind === "irish" || kind === "scotch" || isAgaveKind(kind);

export function countryForDistillery(kind: CategoryKind | null, country: string): boolean {
  const normalized = normalizeCountry(country);
  if (isAgaveKind(kind)) return normalized === "Mexico";
  if (isFrenchBrandy(kind)) return normalized === "France";
  if (kind === "pisco") return normalized === "Peru" || normalized === "Chile";
  if (kind === "canadian") return normalized === "Canada";
  if (kind === "irish") return ["Ireland", "Northern Ireland", "United Kingdom"].includes(normalized);
  return true;
}

export type IngredientChoice = { name: string; family?: string | null; kind?: "maguey" | "distillate" | "rum_base" | "botanical" | "gin_base" | "vodka_base" | "flavor" | "liqueur_base"; isManual?: boolean };

/** A Rhum Agricole made in Martinique is made on a column still; a distillery there pre-selects it. */
export const stillForCountry = (country: string | null | undefined): "column" | null =>
  country && normalizeCountry(country) === "Martinique" ? "column" : null;

/** The one base a kind has by definition: tequila's Blue Weber, and the sugarcane juice of a Rhum Agricole and a Cachaça. */
export function fixedIngredient(kind: CategoryKind | null): (IngredientChoice & { kind: NonNullable<IngredientChoice["kind"]> }) | null {
  if (kind === "tequila") return { name: "Blue Weber", kind: "maguey" };
  if (kind === "agricole" || kind === "cachaca") return { name: "Sugarcane juice", kind: "rum_base" };
  return null;
}

export function ingredientAllowed(kind: CategoryKind | null, ingredient: IngredientChoice): boolean {
  const fixed = fixedIngredient(kind);
  if (fixed && (ingredient.kind === undefined || ingredient.kind === fixed.kind)) return ingredient.name.trim().toLocaleLowerCase() === fixed.name.toLocaleLowerCase();
  if (kind === "calvados") return ingredient.family === "apple" || ingredient.family === "pear";
  if (kind === "cognac" || kind === "armagnac") return ingredient.family === "grape";
  return true;
}

export function spiritAgeLabel(kind: CategoryKind | null, tequilaClass: string | null | undefined, brandyGrade: string | null | undefined, exactAge?: string | null) {
  if (exactAge) return exactAge;
  if (kind === "tequila" && tequilaClass && tequilaClass in TEQUILA_CLASS_LABELS) return TEQUILA_CLASS_LABELS[tequilaClass as TequilaClass];
  if (brandyGrade && kind && BRANDY_MINIMUM_YEARS[kind] && brandyGrade in BRANDY_MINIMUM_YEARS[kind]) return brandyGrade;
  return null;
}

/** A bottle stores only its own designation; null continues to inherit from its label. */
export function withBottleSpiritFacts<T extends Record<string, unknown>>(facts: T, kind: CategoryKind, ginAged = false, group: string = kind): T {
  const out: Record<string, unknown> = { ...facts };
  if (kind === "tequila" && "tequilaClass" in out) {
    const chosen = out.tequilaClass;
    out.ageStatement = typeof chosen === "string" && chosen in TEQUILA_CLASS_LABELS ? TEQUILA_CLASS_LABELS[chosen as TequilaClass] : null;
  }
  if (isAgaveKind(kind)) {
    if (UNDER_A_YEAR_CLASSES.includes(String(out.tequilaClass ?? ""))) out.ageYears = null;
  } else if ("tequilaClass" in out) out.tequilaClass = null;
  if (BRANDY_MINIMUM_YEARS[kind]) {
    if ("brandyGrade" in out) out.ageStatement = out.brandyGrade ?? null;
  } else if ("brandyGrade" in out) out.brandyGrade = null;
  if (isAgaveKind(kind)) {
    delete out.barrelFilledOn;
    delete out.bottledOn;
  }
  if (isGinKind(kind)) {
    delete out.barrelFilledOn;
    delete out.bottledOn;
    delete out.ageStatement;
    delete out.warehouse;
    delete out.rickFloor;
    if (!ginAged) {
      delete out.isSingleBarrel;
      delete out.isSingleBarrelPick;
      delete out.ageYears;
      delete out.ageMonths;
      delete out.ageDays;
      delete out.ageYearsSource;
      delete out.ginIsNas;
    }
  } else delete out.ginIsNas;
  if (kind === "vodka" || kind === "flavored-vodka" || kind === "amaro" || kind === "liqueur" || kind === "chocolate-liqueur" || kind === "cream-liqueur") {
    for (const name of ["releaseId", "batch", "releaseYear", "isSingleBarrel", "isSingleBarrelPick", "barrelNumber", "bottleCount", "pickName", "pickedBy", "warehouse", "rickFloor", "barrelFilledOn", "bottledOn"]) delete out[name];
    if (kind !== "vodka" && kind !== "flavored-vodka") delete out.proof;
    for (const name of ["ageYears", "ageMonths", "ageDays", "ageStatement"]) delete out[name];
    delete out.ageYearsSource;
  }
  if (hidesWarehouse(group, kind)) {
    delete out.warehouse;
    delete out.rickFloor;
  }
  return out as T;
}
