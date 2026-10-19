import { bottlesOfLabel, getExpression } from "@/lib/expressions/queries";
import { labelRankLine, type LabelRank } from "./label-rank";
import { rankingFor } from "./ranking-query";

/** What a caller that already has the label's row can hand over so it is not read twice. */
export type LabelKnown = { categoryId: number; categoryName: string; bottleIds: number[] };

/**
 * The label's tournament rank line (owner-scoped, ranked among its own category), or null. It is a garnish on the label
 * page, so any error yields null: the page must never fail because of the ranking.
 */
export async function labelRank(ownerId: number, expressionId: number, known?: LabelKnown): Promise<(LabelRank & { categoryId: number }) | null> {
  try {
    let info = known;
    if (!info) {
      const row = await getExpression(expressionId, ownerId);
      if (!row) return null;
      const owned = await bottlesOfLabel(expressionId, ownerId);
      info = { categoryId: row.category.id, categoryName: row.category.name, bottleIds: owned.map((b) => b.id) };
    }
    const ranking = await rankingFor(ownerId, info.categoryId);
    const line = labelRankLine(ranking, expressionId, info.bottleIds, info.categoryName);
    return line && { ...line, categoryId: info.categoryId };
  } catch (error) {
    console.error("label tournament rank failed", error);
    return null;
  }
}
