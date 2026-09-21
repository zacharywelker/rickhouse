import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Dashboard analytics. Everything is computed in Postgres and returned ready
 * to render — the charts receive rows, not raw tables to reduce in the browser.
 */

export type Slice = { label: string; count: number; share: number };
export type Bin = { label: string; count: number };
export type Point = { month: string; count: number; spend: number };
export type Ranked = { label: string; slug: string | null; count: number };

/** Top classes by bottle count, with the tail folded into one "Other". */
export async function categoryShare(limit = 5): Promise<Slice[]> {
  const rows = await db.execute<{ label: string; count: number }>(sql`
    SELECT c.name::text AS label, count(*)::int AS count
      FROM bottles b
      JOIN expressions e ON e.id = b.expression_id
      JOIN categories  c ON c.id = e.category_id
     GROUP BY c.name
     ORDER BY count DESC, c.name
  `);

  const all = [...rows];
  const total = all.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return [];

  const head = all.slice(0, limit);
  const tailCount = all.slice(limit).reduce((sum, row) => sum + row.count, 0);
  // Never invent a colour for a ninth series: the tail folds into one slice.
  const slices = tailCount > 0 ? [...head, { label: "Other", count: tailCount }] : head;

  return slices.map((row) => ({
    label: row.label,
    count: row.count,
    share: Math.round((row.count / total) * 1000) / 10,
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
    bins.push({ label: `${bucket}–${bucket + 9}`, count: byBucket.get(bucket) ?? 0 });
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
  const rows = await db.execute<{ label: string; slug: string; count: number }>(sql`
    SELECT d.name::text AS label, d.slug AS slug, count(DISTINCT b.id)::int AS count
      FROM expression_distilleries ed
      JOIN distilleries d ON d.id = ed.distillery_id
      JOIN bottles b ON b.expression_id = ed.expression_id
     GROUP BY d.name, d.slug
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
