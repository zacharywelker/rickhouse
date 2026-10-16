import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { competitorId } from "./entrants";
import { audit, rankCompetitors, type AuditRow, type RankedHeat, type Strength } from "./ranking";

const list = (items: (number | string)[]): SQL => sql.join(items.map((i) => sql`${i}`), sql`, `);

export type RankedCompetitor = Strength & {
  name: string;
  /** The bottle or label this competitor is. */
  bottleId: number | null;
  expressionId: number | null;
  /** The average of its 0 to 10 tasting ratings, or null when it has none. */
  rating: number | null;
};

export type RankingResult = {
  competitors: RankedCompetitor[];
  /** Where the ranking and the ratings disagree, biggest gap first. */
  audit: (AuditRow & { name: string })[];
};

type HeatRow = { heat_id: number; place: number; entry_id: number; bottle_id: number | null; expression_id: number | null; display_name: string };

/**
 * The long-term ranking: every decided heat of every one of the owner's tournaments, pooled. Outside (ad hoc) entries
 * are left out of it. With `categoryId`, only competitors whose label is in that category or below it are ranked
 * (a heat's other competitors keep their relative order). Ratings come from the tastings of the same bottle, or, for
 * an entry with no bottle, of the label with no bottle.
 */
export async function rankingFor(ownerId: number, categoryId: number | null): Promise<RankingResult> {
  const run = async <T>(query: SQL): Promise<T[]> => (await db.execute(query)) as unknown as T[];

  const rows = await run<HeatRow>(sql`
    SELECT he.heat_id, he.place, te.id AS entry_id, te.bottle_id, te.expression_id, te.display_name
    FROM tournament_heat_entries he
    JOIN tournament_heats h ON h.id = he.heat_id AND h.status = 'decided'
    JOIN tournaments t ON t.id = h.tournament_id AND t.owner_id = ${ownerId}
    JOIN tournament_entries te ON te.id = he.entry_id
    WHERE he.place IS NOT NULL
    ORDER BY he.heat_id, he.place`);

  type Who = { id: string; bottleId: number | null; expressionId: number | null; name: string; entryId: number };
  const who = new Map<string, Who>();
  const perHeat = new Map<number, string[]>();
  for (const r of rows) {
    const id = competitorId({ bottleId: r.bottle_id, expressionId: r.expression_id });
    if (id === null) continue;
    const seen = who.get(id);
    if (!seen || r.entry_id > seen.entryId) who.set(id, { id, bottleId: r.bottle_id, expressionId: r.expression_id, name: r.display_name, entryId: r.entry_id });
    perHeat.set(r.heat_id, [...(perHeat.get(r.heat_id) ?? []), id]);
  }
  if (who.size === 0) return { competitors: [], audit: [] };

  const bottleIds = [...who.values()].flatMap((w) => (w.bottleId !== null ? [w.bottleId] : []));
  const labelIds = [...who.values()].flatMap((w) => (w.bottleId === null && w.expressionId !== null ? [w.expressionId] : []));
  const expressionIds = [...new Set([...who.values()].flatMap((w) => (w.expressionId !== null ? [w.expressionId] : [])))];

  const proofOfBottle = new Map(
    (bottleIds.length ? await run<{ id: number; proof: string | null }>(sql`SELECT id, proof FROM bottle_list WHERE owner_id = ${ownerId} AND id IN (${list(bottleIds)})`) : []).map((r) => [r.id, r.proof]),
  );
  const expressionRows = expressionIds.length
    ? await run<{ id: number; proof: string | null; category_id: number }>(sql`SELECT id, proof, category_id FROM expressions WHERE owner_id = ${ownerId} AND id IN (${list(expressionIds)})`)
    : [];
  const expressionById = new Map(expressionRows.map((r) => [r.id, r]));

  let allowedCategories: Set<number> | null = null;
  if (categoryId !== null) {
    const tree = await run<{ id: number }>(sql`WITH RECURSIVE tree AS (
      SELECT id FROM categories WHERE id = ${categoryId}
      UNION ALL SELECT c.id FROM categories c JOIN tree ON c.parent_id = tree.id) SELECT id FROM tree`);
    allowedCategories = new Set(tree.map((r) => r.id));
  }
  const inScope = (w: Who) => allowedCategories === null || (w.expressionId !== null && allowedCategories.has(expressionById.get(w.expressionId)?.category_id ?? -1));
  const proofOf = (w: Who): number | null => {
    const raw = w.bottleId !== null ? proofOfBottle.get(w.bottleId) : w.expressionId !== null ? expressionById.get(w.expressionId)?.proof : null;
    const n = raw === null || raw === undefined ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const heats: RankedHeat[] = [...perHeat.values()].map((ids) => ({
    ranking: ids.filter((id) => inScope(who.get(id)!)).map((id) => ({ id, proof: proofOf(who.get(id)!) })),
  }));
  const strengths = rankCompetitors(heats);

  const ratingRows = [
    ...(bottleIds.length
      ? await run<{ bottle_id: number; avg: string }>(sql`SELECT bottle_id, avg(rating) AS avg FROM tasting_notes WHERE owner_id = ${ownerId} AND rating IS NOT NULL AND bottle_id IN (${list(bottleIds)}) GROUP BY bottle_id`)
      : []
    ).map((r) => ["b:" + r.bottle_id, Number(r.avg)] as const),
    ...(labelIds.length
      ? await run<{ expression_id: number; avg: string }>(sql`SELECT expression_id, avg(rating) AS avg FROM tasting_notes WHERE owner_id = ${ownerId} AND rating IS NOT NULL AND bottle_id IS NULL AND expression_id IN (${list(labelIds)}) GROUP BY expression_id`)
      : []
    ).map((r) => ["e:" + r.expression_id, Number(r.avg)] as const),
  ];
  const ratings = new Map<string, number | null>(ratingRows.map(([id, avg]) => [id, Math.round(avg * 10) / 10]));

  return {
    competitors: strengths.map((s) => {
      const w = who.get(s.id)!;
      return { ...s, name: w.name, bottleId: w.bottleId, expressionId: w.expressionId, rating: ratings.get(s.id) ?? null };
    }),
    audit: audit(strengths, ratings).map((row) => ({ ...row, name: who.get(row.id)!.name })),
  };
}
