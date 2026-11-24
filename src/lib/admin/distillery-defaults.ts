import type { CategoryKind } from "@/lib/expressions/rules";
import { isAgaveKind } from "@/lib/expressions/spirit-details";
import { isScotchCountry, normalizeCountry } from "@/lib/places";

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

/** Lower case, no accents, single spaces: how a hand-typed country is compared. */
const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

export function placeIdentifier(kind: CategoryKind, country: string): "dsp" | "nom" | "region" | null {
  const typed = plain(country);
  if (isAgaveKind(kind) || typed === "mexico" || typed === "mx") return "nom";
  if (kind === "scotch" || isScotchCountry(typed)) return "region";
  if (normalizeCountry(country) === "USA") return "dsp";
  return null;
}

export function companyPrefill(typedName: string, brandName: string | null): boolean {
  const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
  const brand = normalize(brandName ?? "");
  if (!brand) return false;
  const name = normalize(typedName);
  return name === brand || name === `${brand} distillery`;
}
