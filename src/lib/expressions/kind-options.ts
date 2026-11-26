import type { FieldSpec } from "@/lib/admin/types";
import { GENEVER_CLASSES, GIN_STYLES } from "./gin-details";
import type { CategoryKind } from "./rules";
import { BRANDY_GRADE_NAMES, BRANDY_MINIMUM_YEARS, PRODUCTION_RULES, brandyGradesFor, type MezcalProduction } from "./spirit-details";

/**
 * The class, style or designation select as this kind has it. The field list holds every option any kind has (so a stored
 * value always validates); the form shows a kind only its own, under the name its spirit uses: a genever's class, a
 * mezcal's class (no Extra Añejo, no Cristalino), a Cognac's, Armagnac's or Calvados's designation with its minimum age.
 */
export function specForKind(field: FieldSpec, kind: CategoryKind | null, values: Record<string, unknown> = {}): FieldSpec {
  if (field.kind !== "select") return field;
  const keep = (values: ReadonlyArray<string>, label?: string): FieldSpec => ({
    ...field,
    ...(label ? { label } : {}),
    options: field.options.filter((option) => option.value === "" || values.includes(option.value)),
  });
  if (field.name === "ginStyle") return kind === "genever" ? keep(GENEVER_CLASSES, "Genever Class") : keep(GIN_STYLES);
  if (field.name === "tequilaClass" && kind === "mezcal") return keep(["blanco", "joven", "reposado", "anejo", "madurado-en-vidrio"], "Mezcal Class");
  if (field.name === "tequilaClass" && kind === "tequila") return keep(["blanco", "joven", "reposado", "anejo", "extra-anejo", "cristalino"]);
  // A mezcal's production category narrows how it was cooked, distilled and milled.
  const production = kind === "mezcal" ? PRODUCTION_RULES[String(values.mezcalProduction) as MezcalProduction] : undefined;
  if (production && (field.name === "cookingMethod" || field.name === "stillType" || field.name === "extraction")) {
    const only = field.name === "cookingMethod" ? production.cooking : field.name === "stillType" ? production.still : production.extraction;
    const not = field.name === "stillType" ? production.notStill : field.name === "extraction" ? production.notExtraction : undefined;
    return { ...field, options: field.options.filter((option) => option.value === "" || ((!only || only.includes(option.value)) && !not?.includes(option.value))) } as FieldSpec;
  }
  if (field.name === "brandyGrade" && kind && BRANDY_MINIMUM_YEARS[kind]) {
    const minimums = BRANDY_MINIMUM_YEARS[kind]!;
    const names = BRANDY_GRADE_NAMES[kind] ?? {};
    return {
      ...field,
      options: [
        ...field.options.filter((option) => option.value === ""),
        ...brandyGradesFor(kind).map((grade) => ({ value: grade, label: grade === "Millésime" ? (names[grade] ?? grade) : grade === "Blanche" ? `${grade} · unaged` : `${names[grade] ?? grade} · ${minimums[grade]}+ years` })),
      ],
    };
  }
  return field;
}

/** The cooking, still and extraction a new production category leaves as they were, or replaces (with its preselect, else blank). */
export function withProduction<T extends Record<string, unknown>>(next: T, production: string): T {
  const rules = PRODUCTION_RULES[production as MezcalProduction];
  if (!rules) return next;
  const fits = (field: "cookingMethod" | "stillType" | "extraction") => {
    const value = String(next[field] ?? "");
    const only = field === "cookingMethod" ? rules.cooking : field === "stillType" ? rules.still : rules.extraction;
    const not = field === "stillType" ? rules.notStill : field === "extraction" ? rules.notExtraction : undefined;
    return value === "" || ((!only || only.includes(value)) && !not?.includes(value));
  };
  const out: Record<string, unknown> = { ...next };
  for (const field of ["cookingMethod", "stillType", "extraction"] as const) {
    if (fits(field)) continue;
    out[field] = (rules.preselect as Record<string, string> | undefined)?.[field] ?? "";
  }
  // Ancestral also fills what was left empty.
  for (const [field, value] of Object.entries(rules.preselect ?? {})) if (String(out[field] ?? "") === "") out[field] = value;
  return out as T;
}
