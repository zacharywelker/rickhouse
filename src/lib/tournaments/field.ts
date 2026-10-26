import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { entryDisplayName, toNumber } from "./entrants";
import { searchWords, type FieldFilters } from "./field-filters";

/** One of your bottles, as the setup picker lists it. `name` is exactly what an entry made from it is called in a tournament. */
export type FieldCandidate = {
  bottleId: number;
  expressionId: number;
  name: string;
  category: string;
  categoryId: number;
  proof: number | null;
  status: string;
  isOpen: boolean;
  tastings: number;
  avgRating: number | null;
};

/** One of your labels, for a label-only entry. */
export type LabelCandidate = {
  expressionId: number;
  name: string;
  category: string;
  proof: number | null;
};

const run = async <T>(query: SQL): Promise<T[]> =>
  (await db.execute(query)) as unknown as T[];

const list = (ids: number[]): SQL =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );

/** `%` and `_` in what was typed are letters, not wildcards. */
const contains = (word: string): string =>
  `%${word.replace(/[\\%_]/g, "\\$&")}%`;

/** Every word must appear in the brand, label name or what marks the bottle (pick, barrel, release, batch). */
function wordClauses(q: string, haystack: SQL): SQL[] {
  return searchWords(q).map((word) => sql`${haystack} ILIKE ${contains(word)}`);
}

/**
 * The owner's bottles that match the filters, by name then id, and how many match in all (so the picker can say
 * "showing 500 of 812"). Never another owner's bottles: the owner is the first condition and every other one narrows within it.
 */
export async function fieldCandidates(
  ownerId: number,
  filters: FieldFilters,
  limit = 500,
): Promise<{ rows: FieldCandidate[]; total: number }> {
  const clauses: SQL[] = [sql`bl.owner_id = ${ownerId}`];
  if (filters.statuses.length > 0)
    clauses.push(
      sql`bl.status IN (${sql.join(
        filters.statuses.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  if (filters.opened !== "any")
    clauses.push(
      filters.opened === "open" ? sql`bl.is_open` : sql`NOT bl.is_open`,
    );
  if (filters.tasted !== "any") {
    const exists = sql`EXISTS (SELECT 1 FROM tasting_notes tn WHERE tn.bottle_id = bl.id AND tn.owner_id = ${ownerId})`;
    clauses.push(filters.tasted === "tasted" ? exists : sql`NOT ${exists}`);
  }
  if (filters.categoryIds.length > 0) {
    // Categories nest: choosing Whiskey includes Bourbon.
    clauses.push(sql`bl.category_id IN (
      WITH RECURSIVE subtree AS (
        SELECT id FROM categories WHERE id IN (${list(filters.categoryIds)})
        UNION SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
      ) SELECT id FROM subtree)`);
  }
  clauses.push(
    ...wordClauses(
      filters.q,
      sql`concat_ws(' ', bl.brand, bl.expression_name, bl.pick_name, bl.release_name, bl.batch, b.barrel_number)`,
    ),
  );

  const rows = await run<{
    id: number;
    expression_id: number;
    brand: string;
    expression_name: string;
    pick_name: string | null;
    barrel_number: string | null;
    release_name: string | null;
    batch: string | null;
    category: string;
    category_id: number;
    proof: string | null;
    status: string;
    is_open: boolean;
    avg_rating: string | null;
    tastings: number;
    total: number;
  }>(sql`
    SELECT bl.id, bl.expression_id, bl.brand, bl.expression_name, bl.pick_name,
           CASE WHEN bl.field_group IN ('vodka', 'amaro', 'liqueur') THEN NULL ELSE b.barrel_number END AS barrel_number,
           CASE WHEN bl.field_group IN ('vodka', 'amaro', 'liqueur') THEN NULL ELSE bl.release_name END AS release_name, bl.batch,
           bl.category, bl.category_id, bl.proof, bl.status, bl.is_open, bl.avg_rating,
           (SELECT count(*)::int FROM tasting_notes tn WHERE tn.bottle_id = bl.id AND tn.owner_id = ${ownerId}) AS tastings,
           count(*) OVER ()::int AS total
      FROM bottle_list bl JOIN bottles b ON b.id = bl.id
     WHERE ${sql.join(clauses, sql` AND `)}
     ORDER BY lower(bl.brand || ' ' || bl.expression_name), lower(coalesce(nullif(bl.pick_name, ''), nullif(b.barrel_number, ''), nullif(bl.release_name, ''), nullif(bl.batch, ''), '')), bl.id
     LIMIT ${limit}`);

  return {
    rows: rows.map((r) => ({
      bottleId: r.id,
      expressionId: r.expression_id,
      name: entryDisplayName({
        brand: r.brand,
        name: r.expression_name,
        pickName: r.pick_name,
        barrelNumber: r.barrel_number,
        releaseName: r.release_name,
        batch: r.batch,
      }),
      category: r.category,
      categoryId: r.category_id,
      proof: toNumber(r.proof),
      status: r.status,
      isOpen: r.is_open,
      tastings: r.tastings,
      avgRating: toNumber(r.avg_rating),
    })),
    // With a limit and no rows past the first page the window count is still right; with no rows at all it is 0.
    total: rows[0]?.total ?? 0,
  };
}

/** The owner's labels whose brand or name matches the words typed, by name; for adding a label with no bottle. */
export async function labelCandidates(
  ownerId: number,
  q: string,
  limit = 30,
): Promise<LabelCandidate[]> {
  const rows = await run<{
    id: number;
    brand: string;
    name: string;
    category: string;
    proof: string | null;
  }>(sql`
    SELECT e.id, br.name AS brand, e.name, c.name AS category, e.proof
      FROM expressions e JOIN brands br ON br.id = e.brand_id JOIN categories c ON c.id = e.category_id
     WHERE e.owner_id = ${ownerId}
       ${sql.join(
         wordClauses(q, sql`concat_ws(' ', br.name, e.name)`).map(
           (c) => sql` AND ${c}`,
         ),
         sql``,
       )}
     ORDER BY lower(br.name || ' ' || e.name), e.id
     LIMIT ${limit}`);
  return rows.map((r) => ({
    expressionId: r.id,
    name: `${r.brand} ${r.name}`,
    category: r.category,
    proof: toNumber(r.proof),
  }));
}
