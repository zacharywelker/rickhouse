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
export const BRANDY_GRADES = ["VS", "VSOP", "XO"] as const;
export type BrandyGrade = (typeof BRANDY_GRADES)[number];

/** Minimum age of the youngest component. This is guidance, not a known age. */
export const BRANDY_MINIMUM_YEARS: Partial<Record<CategoryKind, Record<BrandyGrade, number>>> = {
  cognac: { VS: 2, VSOP: 4, XO: 10 },
  armagnac: { VS: 1, VSOP: 4, XO: 10 },
  calvados: { VS: 2, VSOP: 4, XO: 6 },
};

export const isAgaveKind = (kind: CategoryKind | null) => kind === "tequila" || kind === "mezcal";
export const isFrenchBrandy = (kind: CategoryKind | null) => kind === "cognac" || kind === "armagnac" || kind === "calvados";
export const hidesWarehouse = (group: string, kind: CategoryKind | null) =>
  group === "rum" || group === "brandy" || group === "gin" || group === "vodka" || group === "amaro" || group === "liqueur" ||
  kind === "canadian" || kind === "irish" || kind === "scotch" || isAgaveKind(kind);

export function countryForDistillery(kind: CategoryKind | null, country: string): boolean {
  const normalized = country.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (isAgaveKind(kind)) return normalized === "mx" || normalized === "mexico";
  if (isFrenchBrandy(kind)) return normalized === "fr" || normalized === "france";
  if (kind === "pisco") return ["pe", "peru", "cl", "chile"].includes(normalized);
  if (kind === "canadian") return normalized === "ca" || normalized === "canada";
  if (kind === "irish") return ["ie", "ireland", "northern ireland", "uk", "united kingdom", "gb"].includes(normalized);
  return true;
}

export type IngredientChoice = { name: string; family?: string | null; kind?: "maguey" | "distillate" | "rum_base" | "botanical" | "gin_base" | "vodka_base" | "flavor" | "liqueur_base"; isManual?: boolean };
export function ingredientAllowed(kind: CategoryKind | null, ingredient: IngredientChoice): boolean {
  if (kind === "tequila") return ingredient.name.trim().toLocaleLowerCase() === "blue weber";
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
export function withBottleSpiritFacts<T extends Record<string, unknown>>(facts: T, kind: CategoryKind, ginAged = false): T {
  const out: Record<string, unknown> = { ...facts };
  if (kind === "tequila") {
    if ("tequilaClass" in out) {
      const chosen = out.tequilaClass;
      out.ageStatement = typeof chosen === "string" && chosen in TEQUILA_CLASS_LABELS
        ? TEQUILA_CLASS_LABELS[chosen as TequilaClass] : null;
      if (chosen === "blanco") { out.ageYears = null; out.ageMonths = null; out.ageDays = null; }
    }
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
  if (hidesWarehouse(kind, kind)) {
    delete out.warehouse;
    delete out.rickFloor;
  }
  return out as T;
}
