import type { CategoryKind } from "@/lib/expressions/rules";
import { isAgaveKind } from "@/lib/expressions/spirit-details";
import { HOME_COUNTRY, isScotchCountry, normalizeCountry } from "@/lib/places";

export function countryForKind(kind: CategoryKind): string | null {
  if (isAgaveKind(kind)) return "Mexico";
  if (kind === "cognac" || kind === "armagnac" || kind === "calvados") return "France";
  if (kind === "pisco") return "Peru";
  if (kind === "canadian") return "Canada";
  if (kind === "irish") return "Ireland";
  if (kind === "scotch") return "Scotland";
  if (kind === "american") return "USA";
  return null;
}

/**
 * The identifier that goes with a country, by the same rules the save keeps it by (distilleriesConfig in registry.ts):
 * a NOM only for Mexico, a Scotch region only for Scotland and the UK, a DSP number only for the USA. The label's
 * spirit does not decide it: it only sets the country the popup starts with (countryForKind).
 */
export function placeIdentifier(country: string): "dsp" | "nom" | "region" | null {
  const normalized = normalizeCountry(country);
  if (normalized === "Mexico") return "nom";
  if (isScotchCountry(normalized)) return "region";
  if (normalized === HOME_COUNTRY) return "dsp";
  return null;
}

/** An option's label as the picker shows it ("NOM-1234: Casa Prueba") back to the distillery's own name. */
export function distilleryNameOf(label: string): string {
  return label.replace(/^NOM-[^:]*:\s*/i, "");
}

export function companyPrefill(typedName: string, brandName: string | null): boolean {
  const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
  const brand = normalize(brandName ?? "");
  if (!brand) return false;
  const name = normalize(typedName);
  return name === brand || name === `${brand} distillery`;
}
