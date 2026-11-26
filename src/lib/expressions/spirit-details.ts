import { normalizeCountry } from "@/lib/places";
import type { CategoryKind } from "./rules";
import { isGinKind } from "./gin-details";

export const AMARO_STYLES = ["Fernet", "Alpine", "Citrus", "New-World", "Old-World", "Medium-Bodied", "Aperitivo", "Carciofo", "Genepy", "Rabarbaro"] as const;
export const CALVADOS_APPELLATIONS = ["aoc-calvados", "pays-d-auge", "domfrontais"] as const;
export type CalvadosAppellation = (typeof CALVADOS_APPELLATIONS)[number];
export const CALVADOS_APPELLATION_LABELS: Record<CalvadosAppellation, string> = {
  "aoc-calvados": "AOC Calvados", "pays-d-auge": "Pays d'Auge", domfrontais: "Domfrontais",
};
/** Mezcal's production categories (design record, section 9). */
export const MEZCAL_PRODUCTIONS = ["mezcal", "artesanal", "ancestral"] as const;
export type MezcalProduction = (typeof MEZCAL_PRODUCTIONS)[number];
export const MEZCAL_PRODUCTION_LABELS: Record<MezcalProduction, string> = { mezcal: "Mezcal", artesanal: "Mezcal Artesanal", ancestral: "Mezcal Ancestral" };
export const MEZCAL_FLAVOR_METHODS = ["abocado-con", "destilado-con"] as const;
export const MEZCAL_FLAVOR_METHOD_LABELS: Record<(typeof MEZCAL_FLAVOR_METHODS)[number], string> = { "abocado-con": "Abocado con (flavored after)", "destilado-con": "Destilado con (distilled with)" };

export const COOKING_METHODS = ["brick oven", "autoclave", "pit"] as const;
/** "hand mallet" is a hand method (mazo); "diffuser" is an industrial one. */
export const EXTRACTION_METHODS = ["tahona", "roller mill", "hand mallet", "diffuser"] as const;

/**
 * What each production category allows (the designer's reading of the mezcal standard; **to be verified**, which is why it is
 * one table). Ancestral: pit-oven cooking, a clay pot still, hand extraction. Artesanal: no column still and no diffuser.
 * Plain mezcal: anything. `preselect` fills a field the owner has not chosen.
 */
export const PRODUCTION_RULES: Record<MezcalProduction, { cooking?: ReadonlyArray<string>; still?: ReadonlyArray<string>; extraction?: ReadonlyArray<string>; notStill?: ReadonlyArray<string>; notExtraction?: ReadonlyArray<string>; preselect?: { cookingMethod?: string; stillType?: string } }> = {
  mezcal: {},
  artesanal: { notStill: ["column"], notExtraction: ["diffuser"] },
  ancestral: { cooking: ["pit"], still: ["clay-pot"], extraction: ["hand mallet"], preselect: { cookingMethod: "pit", stillType: "clay-pot" } },
};

export const PEAT_STATUSES = ["unknown", "unpeated", "peated"] as const;
export const DAIRY_STATUSES = ["unknown", "dairy", "non-dairy"] as const;
/** A liqueur is dairy or it is not: a Cream liqueur starts as dairy, every other as non-dairy, and "unknown" is never offered or kept. */
export const dairyDefault = (kind: CategoryKind | null): "dairy" | "non-dairy" => (kind === "cream-liqueur" ? "dairy" : "non-dairy");
export const effectiveDairy = (kind: CategoryKind | null, status: unknown): "dairy" | "non-dairy" =>
  status === "dairy" || status === "non-dairy" ? status : dairyDefault(kind);

/** Category composition is known even when a producer's exact recipe is not. */
export function whiskeyCategoryGrains(slug: string): string | null {
  if (slug === "single-malt-scotch" || slug === "malt-irish-whiskey") return "100% malted barley";
  if (slug === "pot-still-irish-whiskey") return "Malted and unmalted barley (at least 30% each; exact shares unknown)";
  return null;
}

export const TEQUILA_CLASSES = ["blanco", "joven", "reposado", "anejo", "extra-anejo", "cristalino", "madurado-en-vidrio"] as const;
export type TequilaClass = (typeof TEQUILA_CLASSES)[number];
export const TEQUILA_CLASS_LABELS: Record<TequilaClass, string> = {
  blanco: "Blanco", joven: "Joven", reposado: "Reposado", anejo: "Añejo",
  "extra-anejo": "Extra Añejo", cristalino: "Cristalino", "madurado-en-vidrio": "Madurado en Vidrio",
};
export const TEQUILA_CLASS_GUIDANCE: Partial<Record<TequilaClass, string>> = {
  blanco: "0–2 months", reposado: "2 months–1 year", anejo: "1–3 years",
  "extra-anejo": "3+ years",
};
/**
 * Every age designation any kind has. A kind offers some of them (`BRANDY_MINIMUM_YEARS`): Cognac VS, VSOP, XO; Armagnac
 * adds Napoléon and Hors d'Âge; Calvados has Vieux, and its "VS" is Fine. The values are what is stored and printed as the statement.
 */
export const BRANDY_GRADES = ["Blanche", "VS", "Vieux", "VSOP", "Napoléon", "XO", "Hors d'Âge", "Millésime"] as const;
export type BrandyGrade = (typeof BRANDY_GRADES)[number];

/**
 * Minimum age of the youngest component, in order of age. This is guidance, not a known age. The Armagnac figures are the
 * designer's recollection of the official ones and still to be verified (design record, section 9).
 */
export const BRANDY_MINIMUM_YEARS: Partial<Record<CategoryKind, Partial<Record<BrandyGrade, number>>>> = {
  cognac: { VS: 2, VSOP: 4, XO: 10 },
  armagnac: { Blanche: 0, VS: 1, VSOP: 4, Napoléon: 6, XO: 10, "Hors d'Âge": 10, Millésime: 0 },
  calvados: { VS: 2, Vieux: 3, VSOP: 4, XO: 6, Millésime: 0 },
};

/** What a designation is called where the kind has its own word for it. */
export const BRANDY_GRADE_NAMES: Partial<Record<CategoryKind, Partial<Record<BrandyGrade, string>>>> = {
  calvados: { VS: "Fine (VS)", Vieux: "Vieux / Réserve", VSOP: "VSOP / VO / Vieille Réserve", XO: "XO / Napoléon / Hors d'Âge" },
  armagnac: { VS: "VS / Three-Star", Millésime: "Vintage / Millésimé" },
};

/** The designations a kind offers, youngest first. */
export const brandyGradesFor = (kind: CategoryKind | null): BrandyGrade[] =>
  kind && BRANDY_MINIMUM_YEARS[kind] ? BRANDY_GRADES.filter((grade) => grade in BRANDY_MINIMUM_YEARS[kind]!) : [];

/** Designations an age never settles: Hors d'Âge shares XO's minimum, and a Millésime is a year, not an age. */
const NOT_FROM_AGE: ReadonlyArray<BrandyGrade> = ["Hors d'Âge", "Millésime"];

/** The designation an age reaches: the oldest whose minimum it meets. */
export function brandyGradeFromYears(kind: CategoryKind | null, years: number): BrandyGrade | null {
  let found: BrandyGrade | null = null;
  for (const grade of brandyGradesFor(kind)) if (!NOT_FROM_AGE.includes(grade) && years >= BRANDY_MINIMUM_YEARS[kind!]![grade]!) found = grade;
  return found;
}

const STATEMENT_WORDS: ReadonlyArray<[BrandyGrade, RegExp]> = [
  ["Millésime", /millesim|vintage/],
  ["Blanche", /blanche/],
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
  // Calvados calls its XO also Napoléon and Hors d'Âge.
  const alias = (grade: BrandyGrade): BrandyGrade => (kind === "calvados" && (grade === "Napoléon" || grade === "Hors d'Âge") ? "XO" : grade);
  return STATEMENT_WORDS.map(([grade, pattern]) => [alias(grade), pattern] as const).find(([grade, pattern]) => offered.includes(grade) && pattern.test(text))?.[0] ?? null;
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
export const MANUAL_AGAVE_CLASSES: ReadonlyArray<string> = ["joven", "cristalino", "madurado-en-vidrio"];
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

export type IngredientChoice = {
  name: string; family?: string | null; kind?: "maguey" | "distillate" | "rum_base" | "botanical" | "gin_base" | "vodka_base" | "flavor" | "liqueur_base"; isManual?: boolean;
  /** Its share of the blend, 0 to 100. Undefined: not sent (a saved share is kept); null: sent as none. Only a distillate (a grape, a fruit) has one. */
  share?: number | null;
};

/** The share a row sent: a number from 0 to 100 (two places), null for none, undefined when the key was not there at all. */
export function parseShare(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
}

/** Which pisco country a distillery's country says: Peru or Chile (the two that may call it pisco), else null. */
export function piscoCountry(countries: ReadonlyArray<string | null | undefined>): "Peru" | "Chile" | null {
  const found = new Set(countries.map((country) => (country ? normalizeCountry(country) : "")));
  return found.size === 1 && found.has("Peru") ? "Peru" : found.size === 1 && found.has("Chile") ? "Chile" : null;
}

/**
 * What a pisco's grapes or strength make it, worked out and not stored. Peru: one grape is a Puro, two or more an Acholado.
 * Chile: the class follows the ABV (Tradicional 30%+, Especial 35%+, Reservado 40%+, Gran Pisco 43%+); Chile has no Acholado.
 */
export function piscoStyle(country: "Peru" | "Chile" | null, grapes: number, abv: number | null): string | null {
  if (country === "Peru") return grapes === 0 ? null : grapes === 1 ? "Puro" : "Acholado";
  if (country === "Chile" && abv !== null) return abv >= 43 ? "Gran Pisco" : abv >= 40 ? "Reservado" : abv >= 35 ? "Especial" : abv >= 30 ? "Tradicional" : null;
  return null;
}

/** A Rhum Agricole made in Martinique is made on a column still; a distillery there pre-selects it. */
export const stillForCountry = (country: string | null | undefined): "column" | null =>
  country && normalizeCountry(country) === "Martinique" ? "column" : null;

/** The one base a kind has by definition: tequila's Blue Weber, the sugarcane juice of a Rhum Agricole and a Cachaça, an apple brandy's apples. */
export function fixedIngredient(kind: CategoryKind | null): (IngredientChoice & { kind: NonNullable<IngredientChoice["kind"]> }) | null {
  if (kind === "tequila") return { name: "Blue Weber", kind: "maguey" };
  if (kind === "agricole" || kind === "cachaca") return { name: "Sugarcane juice", kind: "rum_base" };
  if (kind === "apple") return { name: "Apple", kind: "distillate", family: "apple" };
  return null;
}

export function ingredientAllowed(kind: CategoryKind | null, ingredient: IngredientChoice): boolean {
  const fixed = fixedIngredient(kind);
  if (fixed && (ingredient.kind === undefined || ingredient.kind === fixed.kind)) return ingredient.name.trim().toLocaleLowerCase() === fixed.name.toLocaleLowerCase();
  if (kind === "calvados") return ingredient.family === "apple" || ingredient.family === "pear";
  if (kind === "cognac" || kind === "armagnac" || kind === "pisco") return ingredient.family === "grape";
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
  // Madurado en Vidrio is a mezcal's: a tequila bottle cannot keep it.
  if (kind === "tequila" && out.tequilaClass === "madurado-en-vidrio") out.tequilaClass = null;
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

/** A solera's ages, as "5–12 years" (one end alone as "from 5" or "up to 12"). */
export function soleraText(low: string | number | null | undefined, high: string | number | null | undefined): string | null {
  const n = (value: string | number | null | undefined) => (value === null || value === undefined || value === "" ? null : Number(value));
  const [a, b] = [n(low), n(high)];
  if (a === null && b === null) return null;
  if (a !== null && b !== null) return a === b ? `${a} years` : `${a}–${b} years`;
  return a !== null ? `from ${a} years` : `up to ${b} years`;
}

/**
 * A note on a list of shares, or null when there is nothing to say: shares are optional, and a total that is not 100 is a warning,
 * never a block. Nothing is said until at least one share is filled; a rounding difference (99.99, 100.01) is not worth a note.
 */
export function shareNote(rows: ReadonlyArray<{ share?: number | null }>): string | null {
  const filled = rows.filter((row) => row.share !== null && row.share !== undefined);
  if (filled.length === 0) return null;
  const total = Math.round(filled.reduce((sum, row) => sum + (row.share ?? 0), 0) * 100) / 100;
  if (Math.abs(total - 100) <= 0.05) return filled.length < rows.length ? "Some grapes have no share yet." : null;
  return `The shares add up to ${total}%${filled.length < rows.length ? " so far" : ""}, not 100%.`;
}

/** A Calvados's fruit is six fixed rows, each an ingredient with a share (design: ingredient shares). The last two are what the old plain tags became. */
export const CALVADOS_FRUIT_ROWS: ReadonlyArray<{ name: string; label: string; family: "apple" | "pear" }> = [
  { name: "Bittersweet apples", label: "Bittersweet", family: "apple" },
  { name: "Bitter apples", label: "Bitter", family: "apple" },
  { name: "Sweet apples", label: "Sweet", family: "apple" },
  { name: "Acidic / tart apples", label: "Acidic / tart", family: "apple" },
  { name: "Apples (type not stated)", label: "Apples (type not stated)", family: "apple" },
  { name: "Pears", label: "Pears", family: "pear" },
];

/** The apples' subtotal, the pears and the total of the shares filled in, to two places; null where nothing is filled. */
export function calvadosTotals(rows: ReadonlyArray<{ name: string; share?: number | null }>): { apples: number | null; pears: number | null; total: number | null } {
  const sum = (names: ReadonlyArray<string>) => {
    const found = rows.filter((row) => names.includes(row.name) && row.share !== null && row.share !== undefined);
    return found.length === 0 ? null : Math.round(found.reduce((total, row) => total + (row.share ?? 0), 0) * 100) / 100;
  };
  const apples = sum(CALVADOS_FRUIT_ROWS.filter((row) => row.family === "apple").map((row) => row.name));
  const pears = sum(["Pears"]);
  return { apples, pears, total: apples === null && pears === null ? null : Math.round(((apples ?? 0) + (pears ?? 0)) * 100) / 100 };
}

/** What a Calvados's appellation asks of its pears, as a warning (never a block): Pays d'Auge at most 30%, Domfrontais at least 30%. */
export function pearNote(appellation: unknown, pears: number | null): string | null {
  if (pears === null) return null;
  if (appellation === "pays-d-auge" && pears > 30) return "Pays d'Auge allows at most 30% pears.";
  if (appellation === "domfrontais" && pears < 30) return "Domfrontais takes at least 30% pears.";
  return null;
}

/**
 * A Calvados's fruit as its six rows: a name the phone or an old label brings ("Pear", "Cider Apple", "Sweet Apple") becomes the
 * row it stands for (a pear is Pears; an apple is its type when the name says it, else "Apples (type not stated)"), and two
 * that land on one row become one, their shares added. Only apple and pear fruit; anything else is left as it is.
 */
export function normalizeCalvadosFruit<T extends { name: string; family?: string | null; share?: number | null }>(rows: ReadonlyArray<T>): T[] {
  const target = (row: T): string | null => {
    const name = row.name.toLocaleLowerCase();
    if (row.family === "pear" || /\bpears?\b|poire/.test(name)) return "Pears";
    if (row.family !== "apple" && !/\bapples?\b|cider|pomme/.test(name)) return null;
    if (/bittersweet/.test(name)) return "Bittersweet apples";
    if (/\bbitter\b/.test(name)) return "Bitter apples";
    if (/\bsweet\b/.test(name)) return "Sweet apples";
    if (/acid|tart/.test(name)) return "Acidic / tart apples";
    return "Apples (type not stated)";
  };
  const out: T[] = [];
  for (const row of rows) {
    const name = target(row);
    if (name === null) { out.push(row); continue; }
    const fixed = CALVADOS_FRUIT_ROWS.find((fruit) => fruit.name === name)!;
    const next = { ...row, name, family: fixed.family };
    const at = out.findIndex((existing) => existing.name === name);
    if (at === -1) { out.push(next); continue; }
    const [a, b] = [out[at]!.share, row.share];
    out[at] = { ...out[at]!, share: a === undefined && b === undefined ? undefined : (a ?? null) === null && (b ?? null) === null ? null : (a ?? 0) + (b ?? 0) };
  }
  return out;
}
