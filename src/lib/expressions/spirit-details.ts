import type { CategoryKind } from "./rules";
import { isGinKind } from "./gin-details";

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
  group === "rum" || group === "brandy" || group === "gin" || isAgaveKind(kind);

export function countryForDistillery(kind: CategoryKind | null, country: string): boolean {
  const normalized = country.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (isAgaveKind(kind)) return normalized === "mx" || normalized === "mexico";
  if (isFrenchBrandy(kind)) return normalized === "fr" || normalized === "france";
  if (kind === "pisco") return ["pe", "peru", "cl", "chile"].includes(normalized);
  return true;
}

export type IngredientChoice = { name: string; family?: string | null; kind?: "maguey" | "distillate" | "rum_base" | "botanical" | "gin_base" };
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
    if ("barrelFilledOn" in out) out.barrelFilledOn = null;
    if ("bottledOn" in out) out.bottledOn = null;
  }
  if (isGinKind(kind)) {
    if ("barrelFilledOn" in out) out.barrelFilledOn = null;
    if ("bottledOn" in out) out.bottledOn = null;
    if ("ageStatement" in out) out.ageStatement = null;
    if ("warehouse" in out) out.warehouse = null;
    if ("rickFloor" in out) out.rickFloor = null;
    if (!ginAged) {
      out.isSingleBarrel = false;
      out.isSingleBarrelPick = false;
      if ("ageYears" in out) out.ageYears = null;
      if ("ageMonths" in out) out.ageMonths = null;
      if ("ageDays" in out) out.ageDays = null;
      if ("ginIsNas" in out) out.ginIsNas = null;
    }
  } else if ("ginIsNas" in out) out.ginIsNas = null;
  if (hidesWarehouse(kind, kind)) {
    if ("warehouse" in out) out.warehouse = null;
    if ("rickFloor" in out) out.rickFloor = null;
  }
  return out as T;
}
