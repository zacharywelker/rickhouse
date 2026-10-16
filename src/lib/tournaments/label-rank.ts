import type { RankingResult } from "./ranking-query";

export type LabelRank = { rank: number; of: number; text: string };

/**
 * The one-line tournament rank of a label: its best firm (not provisional) competitor among the label itself
 * (`e:<expressionId>`, an entrant with no bottle) and its bottles (`b:<bottleId>`). The rank is inside the
 * competitor's own comparable group and `of` is that group's size, because strengths of unlinked groups cannot be
 * compared. Ties on rank go to the larger group. The category name is used as stored, lowercased and not pluralised
 * ("3 of 41 in bourbon"): pluralising would get Scotch and Brandy wrong. Null when nothing of the label has a firm rank.
 */
export function labelRankLine(ranking: RankingResult, expressionId: number, bottleIds: number[], categoryName: string): LabelRank | null {
  const mine = new Set([`e:${expressionId}`, ...bottleIds.map((id) => `b:${id}`)]);
  const best = ranking.competitors
    .filter((c) => mine.has(c.id) && !c.provisional)
    .sort((a, b) => a.rank - b.rank || b.groupSize - a.groupSize)[0];
  if (!best) return null;
  return { rank: best.rank, of: best.groupSize, text: `Tournament rank: ${best.rank} of ${best.groupSize} in ${categoryName.toLowerCase()}` };
}
