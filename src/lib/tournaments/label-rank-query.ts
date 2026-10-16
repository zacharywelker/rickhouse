import { bottlesOfLabel, getExpression } from "@/lib/expressions/queries";
import { labelRankLine, type LabelRank } from "./label-rank";
import { rankingFor } from "./ranking-query";

/** The label's tournament rank line (owner-scoped, ranked among its own category), or null. */
export async function labelRank(ownerId: number, expressionId: number): Promise<(LabelRank & { categoryId: number }) | null> {
  const row = await getExpression(expressionId, ownerId);
  if (!row) return null;
  const [owned, ranking] = await Promise.all([bottlesOfLabel(expressionId, ownerId), rankingFor(ownerId, row.category.id)]);
  const line = labelRankLine(ranking, expressionId, owned.map((b) => b.id), row.category.name);
  return line && { ...line, categoryId: row.category.id };
}
