import type { CategoryKind } from "@/lib/expressions/rules";
import { isAgaveKind } from "@/lib/expressions/spirit-details";

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

export function placeIdentifier(kind: CategoryKind, country: string): "dsp" | "nom" | "region" | null {
  if (isAgaveKind(kind) || country === "Mexico") return "nom";
  if (kind === "scotch" || country === "Scotland") return "region";
  if (country === "USA") return "dsp";
  return null;
}

export function companyPrefill(typedName: string, brandName: string | null): boolean {
  const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
  const brand = normalize(brandName ?? "");
  if (!brand) return false;
  const name = normalize(typedName);
  return name === brand || name === `${brand} distillery`;
}
