import "server-only";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import type { Option } from "@/lib/admin/types";
import { categoryFieldGroups, expressionLinks } from "./queries";
import { shareText } from "./links";
import type { LinkedRow } from "@/components/expressions/ordered-picker";

/** Everything the expression form needs to render, in one round of queries. */
/** `expressionId`, when given, must already be checked to belong to `ownerId`. */
export async function expressionFormData(expressionId: number | null, ownerId: number) {
  const [brands, cats, distilleries, mashbills, finishes, categoryGroups] = await Promise.all([
    REFERENCE_OPTION_LOADERS.brands(ownerId),
    REFERENCE_OPTION_LOADERS.categories(ownerId),
    REFERENCE_OPTION_LOADERS.distilleries(ownerId),
    REFERENCE_OPTION_LOADERS.mashbills(ownerId),
    REFERENCE_OPTION_LOADERS.finishes(ownerId),
    categoryFieldGroups(),
  ]);

  const options: Record<string, Option[]> = {
    brandId: brands,
    categoryId: cats,
    distilleryLinks: distilleries,
    mashbillLinks: mashbills,
    finishLinks: finishes,
  };

  const links =
    expressionId === null
      ? { distilleries: [] as LinkedRow[], mashbills: [] as LinkedRow[], finishes: [] as LinkedRow[] }
      : await loadLinks(expressionId);

  return { options, categoryGroups, links };
}

/** A label's three lists as the form's pickers hold them. */
export async function loadLinks(expressionId: number) {
  const linked = await expressionLinks(expressionId);
  const toRows = (rows: Array<{ id: number; name: string; amount: string | null }>): LinkedRow[] =>
    rows.map((row) => ({
      id: row.id,
      label: row.name,
      amount: row.amount === null ? "" : String(Number(row.amount)),
    }));
  return {
    distilleries: linked.distilleries.map((row) => ({
      id: row.id,
      label: row.name,
      amount: shareText(row.amount),
      inferred: row.inferred === true,
      undisclosed: row.undisclosed === true,
    })),
    mashbills: linked.mashbills.map((row) => ({
      id: row.id,
      label: row.name,
      amount: shareText(row.amount),
      // Which of the label's distilleries made this recipe (issue #13); the
      // picker preselects this once there is more than one to choose from.
      distilleryId: row.distilleryId ?? null,
    })),
    finishes: toRows(linked.finishes),
  };
}
