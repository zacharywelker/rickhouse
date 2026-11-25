import type { FieldSpec } from "@/lib/admin/types";
import { GENEVER_CLASSES, GIN_STYLES } from "./gin-details";
import type { CategoryKind } from "./rules";
import { BRANDY_GRADE_NAMES, BRANDY_MINIMUM_YEARS, brandyGradesFor } from "./spirit-details";

/**
 * The class, style or designation select as this kind has it. The field list holds every option any kind has (so a stored
 * value always validates); the form shows a kind only its own, under the name its spirit uses: a genever's class, a
 * mezcal's class (no Extra Añejo, no Cristalino), a Cognac's, Armagnac's or Calvados's designation with its minimum age.
 */
export function specForKind(field: FieldSpec, kind: CategoryKind | null): FieldSpec {
  if (field.kind !== "select") return field;
  const keep = (values: ReadonlyArray<string>, label?: string): FieldSpec => ({
    ...field,
    ...(label ? { label } : {}),
    options: field.options.filter((option) => option.value === "" || values.includes(option.value)),
  });
  if (field.name === "ginStyle") return kind === "genever" ? keep(GENEVER_CLASSES, "Genever Class") : keep(GIN_STYLES);
  if (field.name === "tequilaClass" && kind === "mezcal") return keep(["blanco", "joven", "reposado", "anejo"], "Mezcal Class");
  if (field.name === "brandyGrade" && kind && BRANDY_MINIMUM_YEARS[kind]) {
    const minimums = BRANDY_MINIMUM_YEARS[kind]!;
    const names = BRANDY_GRADE_NAMES[kind] ?? {};
    return {
      ...field,
      options: [
        ...field.options.filter((option) => option.value === ""),
        ...brandyGradesFor(kind).map((grade) => ({ value: grade, label: `${names[grade] ?? grade} · ${minimums[grade]}+ years` })),
      ],
    };
  }
  return field;
}
