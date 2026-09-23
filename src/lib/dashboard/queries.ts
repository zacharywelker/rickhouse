import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { FieldGroup } from "@/db/schema";
import { humanise } from "@/lib/utils";

/**
 * Dashboard analytics. Everything is computed in Postgres and returned ready
 * to render — the charts receive rows, not raw tables to reduce in the browser.
 */

/** categoryIds carries the subtree behind the family, so a slice can link to /bottles?category=... */
export type Slice = { fieldGroup: FieldGroup; label: string; count: number; share: number; categoryIds: number[] };
export type Bin = { label: string; count: number; min: number; max: number };
export type Point = { month: string; count: number; spend: number };
export type Ranked = { id: number; label: string; slug: string | null; count: number };

/**
 * Bottle count by category field group — whiskey, rum, agave… — the same
 * families category color keys off (DESIGN-TOKENS.md §7), so a chart series
 * and its legend always match the color a bottle wears everywhere else.
 */
export async function categoryShare(): Promise<Slice[]> {
  const [counts, groups] = await Promise.all([
    db.execute<{ fieldGroup: FieldGroup; count: number }>(sql`
      SELECT c.field_group AS "fieldGroup", count(*)::int AS count
        FROM bottles b
        JOIN expressions e ON e.id = b.expression_id
        JOIN categories  c ON c.id = e.category_id
       GROUP BY c.field_group
       ORDER BY count DESC, c.field_group
    `),
    db.execute<{ id: number; fieldGroup: FieldGroup }>(sql`
      SELECT id, field_group AS "fieldGroup" FROM categories
    `),
  ]);

  const total = [...counts].reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return [];

  const idsByGroup = new Map<FieldGroup, number[]>();
  for (const row of groups) {
    const list = idsByGroup.get(row.fieldGroup) ?? [];
    list.push(row.id);
    idsByGroup.set(row.fieldGroup, list);
  }

  return [...counts].map((row) => ({
    fieldGroup: row.fieldGroup,
    label: humanise(row.fieldGroup),
    count: row.count,
    share: Math.round((row.count / total) * 1000) / 10,
    categoryIds: idsByGroup.get(row.fieldGroup) ?? [],
  }));
}

/** Proof, bucketed into tens. Empty buckets between the ends are kept. */
export async function proofDistribution(): Promise<Bin[]> {
  const rows = await db.execute<{ bucket: number; count: number }>(sql`
    SELECT (floor(e.proof / 10) * 10)::int AS bucket, count(*)::int AS count
      FROM bottles b
      JOIN expressions e ON e.id = b.expression_id
     WHERE e.proof IS NOT NULL
     GROUP BY bucket
     ORDER BY bucket
  `);

  const all = [...rows];
  if (all.length === 0) return [];

  const low = all[0]!.bucket;
  const high = all[all.length - 1]!.bucket;
  const byBucket = new Map(all.map((row) => [row.bucket, row.count]));

  const bins: Bin[] = [];
  for (let bucket = low; bucket <= high; bucket += 10) {
    bins.push({ label: `${bucket}–${bucket + 9}`, count: byBucket.get(bucket) ?? 0, min: bucket, max: bucket + 9 });
  }
  return bins;
}

/** Acquisitions by month, with the gaps filled so the line does not lie. */
export async function acquisitionsOverTime(months = 24): Promise<Point[]> {
  const rows = await db.execute<{ month: string; count: number; spend: string }>(sql`
    WITH span AS (
      SELECT date_trunc('month', min(date_acquired))::date AS first_month
        FROM bottles WHERE date_acquired IS NOT NULL
    ),
    series AS (
      SELECT generate_series(
        greatest(
          coalesce((SELECT first_month FROM span), date_trunc('month', current_date)::date),
          (date_trunc('month', current_date) - make_interval(months => ${months - 1}))::date
        ),
        date_trunc('month', current_date)::date,
        '1 month'
      )::date AS month
    )
    SELECT to_char(s.month, 'YYYY-MM') AS month,
           count(b.id)::int AS count,
           coalesce(sum(b.price_paid), 0)::text AS spend
      FROM series s
      LEFT JOIN bottles b ON date_trunc('month', b.date_acquired)::date = s.month
     GROUP BY s.month
     ORDER BY s.month
  `);
  return [...rows].map((row) => ({ month: row.month, count: row.count, spend: Number(row.spend) }));
}

/** Distilleries by how many bottles they contributed to, blends included. */
export async function topDistilleries(limit = 8): Promise<Ranked[]> {
  const rows = await db.execute<{ id: number; label: string; slug: string; count: number }>(sql`
    SELECT d.id AS id, d.name::text AS label, d.slug AS slug, count(DISTINCT b.id)::int AS count
      FROM expression_distilleries ed
      JOIN distilleries d ON d.id = ed.distillery_id
      JOIN bottles b ON b.expression_id = ed.expression_id
     GROUP BY d.id, d.name, d.slug
     ORDER BY count DESC, d.name
     LIMIT ${limit}
  `);
  return [...rows];
}

export async function topMashbill(): Promise<{ label: string; id: number; count: number } | null> {
  const rows = await db.execute<{ label: string; id: number; count: number }>(sql`
    SELECT coalesce(m.name::text, 'Unnamed recipe') AS label, m.id AS id, count(DISTINCT b.id)::int AS count
      FROM expression_mashbills em
      JOIN mashbills m ON m.id = em.mashbill_id
      JOIN bottles b ON b.expression_id = em.expression_id
     GROUP BY m.name, m.id
     ORDER BY count DESC, m.id
     LIMIT 1
  `);
  return [...rows][0] ?? null;
}

export async function topFinish(): Promise<{ label: string; slug: string; count: number } | null> {
  const rows = await db.execute<{ label: string; slug: string; count: number }>(sql`
    SELECT f.name::text AS label, f.slug AS slug, count(DISTINCT b.id)::int AS count
      FROM expression_finishes ef
      JOIN finishes f ON f.id = ef.finish_id
      JOIN bottles b ON b.expression_id = ef.expression_id
     GROUP BY f.name, f.slug
     ORDER BY count DESC, f.name
     LIMIT 1
  `);
  return [...rows][0] ?? null;
}

export type BottleHighlight = { id: number; name: string };

/** The single priciest bottle, for a headline that points at one object. */
export async function mostExpensiveBottle(): Promise<(BottleHighlight & { price: string }) | null> {
  const rows = await db.execute<{ id: number; brand: string; expressionName: string; pricePaid: string }>(sql`
    SELECT id, brand::text AS brand, expression_name::text AS "expressionName", price_paid AS "pricePaid"
      FROM bottle_list
     WHERE price_paid IS NOT NULL
     ORDER BY price_paid DESC
     LIMIT 1
  `);
  const row = [...rows][0];
  return row ? { id: row.id, name: `${row.brand} ${row.expressionName}`, price: row.pricePaid } : null;
}

/** The bottle that has sat in the collection the longest, by acquisition date. */
export async function longestHeldBottle(): Promise<(BottleHighlight & { years: number }) | null> {
  const rows = await db.execute<{ id: number; brand: string; expressionName: string; years: number }>(sql`
    SELECT id, brand::text AS brand, expression_name::text AS "expressionName",
           extract(year FROM age(current_date, date_acquired))::int AS years
      FROM bottle_list
     WHERE date_acquired IS NOT NULL
     ORDER BY date_acquired ASC
     LIMIT 1
  `);
  const row = [...rows][0];
  return row ? { id: row.id, name: `${row.brand} ${row.expressionName}`, years: row.years } : null;
}

/** How many bottles have been owned for at least this many years. */
export async function longHeldCount(years = 5): Promise<number> {
  const rows = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count
      FROM bottle_list
     WHERE date_acquired IS NOT NULL
       AND date_acquired <= (current_date - make_interval(years => ${years}))
  `);
  return [...rows][0]?.count ?? 0;
}

export type Headline = {
  bottles: number;
  open: number;
  killed: number;
  spend: string;
  msrp: string;
  avgProof: string | null;
  avgRating: string | null;
  expressions: number;
};

export async function headline(): Promise<Headline> {
  const rows = await db.execute<Headline>(sql`
    SELECT count(*)::int AS bottles,
           count(*) FILTER (WHERE b.is_open)::int AS open,
           count(*) FILTER (WHERE b.status = 'killed')::int AS killed,
           coalesce(sum(b.price_paid), 0)::text AS spend,
           coalesce(sum(e.msrp) FILTER (WHERE b.price_paid IS NOT NULL), 0)::text AS msrp,
           round(avg(e.proof), 1)::text AS "avgProof",
           (SELECT round(avg(rating), 1)::text FROM tasting_notes) AS "avgRating",
           (SELECT count(*)::int FROM expressions) AS expressions
      FROM bottles b
      JOIN expressions e ON e.id = b.expression_id
  `);
  return (
    [...rows][0] ?? {
      bottles: 0,
      open: 0,
      killed: 0,
      spend: "0",
      msrp: "0",
      avgProof: null,
      avgRating: null,
      expressions: 0,
    }
  );
}
