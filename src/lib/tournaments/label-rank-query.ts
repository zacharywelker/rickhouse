import { sql } from "drizzle-orm";
import { db } from "@/db";
import { bottlesOfLabel, getExpression } from "@/lib/expressions/queries";
import { labelRankLine, type LabelRank } from "./label-rank";
import { rankingFor } from "./ranking-query";

/** What a caller that already has the label's row can hand over so it is not read twice. */
export type LabelKnown = { categoryId: number; categoryName: string; bottleIds: number[] };

/** True when the owner has any decided flight (a bye is its own status): without one there is nothing to rank. One cheap query. */
async function hasDecidedFlight(ownerId: number): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM tournament_heats h JOIN tournaments t ON t.id = h.tournament_id
      WHERE t.owner_id = ${ownerId} AND h.status = 'decided'
    ) AS has`)) as unknown as { has: boolean }[];
  return rows[0]?.has === true;
}

/**
 * The label's tournament rank line (owner-scoped, ranked among its own category), or null. It is a garnish on the label
 * page, so any error yields null: the page must never fail because of the ranking.
 */
export async function labelRank(ownerId: number, expressionId: number, known?: LabelKnown): Promise<(LabelRank & { categoryId: number }) | null> {
  try {
    // Most owners never play a tournament; skip the whole-owner fit (and the label reads) for them.
    if (!(await hasDecidedFlight(ownerId))) return null;
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
