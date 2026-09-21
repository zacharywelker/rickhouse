import "server-only";
import { db } from "@/db";
import { categories, type FieldGroup } from "@/db/schema";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import type { Option } from "@/lib/admin/types";
import { expressionLinks } from "./queries";
import type { LinkedRow } from "@/components/expressions/ordered-picker";

/** Everything the expression form needs to render, in one round of queries. */
export async function expressionFormData(expressionId: number | null) {
  const [brands, cats, distilleries, mashbills, finishes, categoryRows] = await Promise.all([
    REFERENCE_OPTION_LOADERS.brands(),
    REFERENCE_OPTION_LOADERS.categories(),
    REFERENCE_OPTION_LOADERS.distilleries(),
    REFERENCE_OPTION_LOADERS.mashbills(),
    REFERENCE_OPTION_LOADERS.finishes(),
    db.select({ id: categories.id, fieldGroup: categories.fieldGroup }).from(categories),
  ]);

  const options: Record<string, Option[]> = {
    brandId: brands,
    categoryId: cats,
    distilleryLinks: distilleries,
    mashbillLinks: mashbills,
    finishLinks: finishes,
  };

  const categoryGroups: Record<number, FieldGroup> = {};
  for (const row of categoryRows) categoryGroups[row.id] = row.fieldGroup;

  const links =
    expressionId === null
      ? { distilleries: [] as LinkedRow[], mashbills: [] as LinkedRow[], finishes: [] as LinkedRow[] }
      : await loadLinks(expressionId);

  return { options, categoryGroups, links };
}

async function loadLinks(expressionId: number) {
  const linked = await expressionLinks(expressionId);
  const toRows = (rows: Array<{ id: number; name: string; amount: string | null }>): LinkedRow[] =>
    rows.map((row) => ({
      id: row.id,
      label: row.name,
      amount: row.amount === null ? "" : String(Number(row.amount)),
    }));
  return {
    distilleries: toRows(linked.distilleries),
    mashbills: toRows(linked.mashbills),
    finishes: toRows(linked.finishes),
  };
}
