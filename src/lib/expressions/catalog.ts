import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bottles } from "@/db/schema";
import type { LinkedRow } from "@/components/expressions/ordered-picker";
import { ageLabel } from "./display";
import { loadLinks } from "./form-data";
import { expressionLinks, getExpression } from "./queries";

export type CatalogLabel = {
  id: number;
  brand: string;
  name: string;
  category: string;
  proof: string | null;
  age: string | null;
  sizeMl: number;
  bottles: number;
  distilleries: Array<{ name: string; inferred: boolean }>;
  mashbills: string[];
  finishes: string[];
  /** The label row, for the label's fields when it is edited from the page. */
  values: Record<string, string | number | boolean | null>;
  links: { distilleries: LinkedRow[]; mashbills: LinkedRow[]; finishes: LinkedRow[] };
};

export async function loadCatalogLabel(id: number, ownerId: number): Promise<CatalogLabel | null> {
  const row = await getExpression(id, ownerId);
  if (!row) return null;
  const [linked, links, bottleCount] = await Promise.all([
    expressionLinks(id),
    loadLinks(id),
    db.$count(bottles, and(eq(bottles.expressionId, id), eq(bottles.ownerId, ownerId))),
  ]);
  const e = row.expression;
  // Dates and other non-form columns stay behind; the form reads only its own fields.
  const values: CatalogLabel["values"] = {};
  for (const [key, value] of Object.entries(e)) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      values[key] = value;
    }
  }
  return {
    id,
    brand: row.brand.name,
    name: e.name,
    category: row.category.name,
    proof: e.proof,
    age: ageLabel(e),
    sizeMl: e.sizeMl,
    bottles: bottleCount,
    distilleries: linked.distilleries.map((d) => ({ name: d.name, inferred: d.inferred === true })),
    // A generic style has no recipe; its name is all there is.
    mashbills: linked.mashbills.map((m) => m.recipe || m.name),
    finishes: linked.finishes.map((f) => f.name),
    values,
    links,
  };
}

