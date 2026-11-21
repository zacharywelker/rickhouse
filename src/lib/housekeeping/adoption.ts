import type { DuplicateKind } from "./duplicate-kinds";

export type Adoptable = { field: string; label: string; value: unknown };

export const ADOPTABLE: Record<DuplicateKind, readonly { field: string; label: string }[]> = {
  brands: [
    { field: "companyId", label: "Company" },
    { field: "notes", label: "Notes" },
  ],
  distilleries: [
    { field: "city", label: "City" },
    { field: "state", label: "State" },
    { field: "region", label: "Region" },
    { field: "dspNumber", label: "DSP number" },
    { field: "nomNumber", label: "NOM number" },
    { field: "founded", label: "Founded" },
    { field: "companyId", label: "Company" },
    { field: "notes", label: "Notes" },
  ],
  companies: [
    { field: "city", label: "City" },
    { field: "state", label: "State" },
    { field: "country", label: "Country" },
    { field: "notes", label: "Notes" },
  ],
  finishes: [
    { field: "finishType", label: "Finish type" },
    { field: "notes", label: "Notes" },
  ],
  ingredients: [{ field: "family", label: "Family" }],
  mashbills: [{ field: "style", label: "Style" }],
  cooperages: [{ field: "notes", label: "Notes" }],
  stores: [
    { field: "city", label: "City" },
    { field: "state", label: "State" },
    { field: "country", label: "Country" },
    { field: "url", label: "URL" },
    { field: "notes", label: "Notes" },
  ],
  tags: [{ field: "color", label: "Color" }],
};

const isEmpty = (value: unknown) => value === null || value === undefined || (typeof value === "string" && value.trim() === "");

export function planAdoption(kind: DuplicateKind, survivor: Record<string, unknown>, removed: Record<string, unknown>): Adoptable[] {
  const offered: Adoptable[] = [];
  for (const { field, label } of ADOPTABLE[kind]) {
    const value = removed[field];
    if (isEmpty(value)) continue;
    if (kind === "finishes" && field === "finishType") {
      if (survivor[field] !== "other" || value === "other") continue;
    } else if (!isEmpty(survivor[field])) continue;
    offered.push({ field, label, value });
  }
  return offered;
}

export function allowedAdoptions(kind: DuplicateKind, requested: readonly string[]): string[] {
  const allowed = new Set(ADOPTABLE[kind].map(({ field }) => field));
  return [...new Set(requested)].filter((field) => allowed.has(field));
}
