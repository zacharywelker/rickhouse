import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Acquisition } from "@/db/schema";
import {
  acquisitionsOverTime,
  categoryShare,
  mostExpensiveBottle,
  proofDistribution,
  topDistilleries,
} from "./queries";

/**
 * The raw facts behind each Numbers chapter, one round trip per chapter.
 * Counting rules follow queries.ts: "what the collection is" counts the shelf
 * (owned or open); money and acquisition history count everything actually
 * acquired (anything but wishlist). Numeric columns come back as numbers.
 */

const ON_SHELF = sql.raw(`b.status IN ('owned', 'open')`);
const ACQUIRED = sql.raw(`b.status <> 'wishlist'`);

export type YearCount = { year: number; count: number };

export type Stockpile = {
  onShelf: number;
  open: number;
  sealed: number;
  sealedDated: number;
  sealedSince: number | null;
  sealedTwoYears: number;
  medianWaitDays: number | null;
  waitSample: number;
  lastPour: number;
  finished: number;
  finishedByYear: YearCount[];
  sealedByYear: YearCount[];
};

export async function stockpile(ownerId: number): Promise<Stockpile> {
  const [head, finishedRows, sealedRows] = await Promise.all([
    db.execute<Omit<Stockpile, "finishedByYear" | "sealedByYear">>(sql`
      SELECT count(*) FILTER (WHERE ${ON_SHELF})::int AS "onShelf",
             count(*) FILTER (WHERE ${ON_SHELF} AND b.is_open)::int AS open,
             count(*) FILTER (WHERE ${ON_SHELF} AND NOT b.is_open)::int AS sealed,
             count(*) FILTER (WHERE ${ON_SHELF} AND NOT b.is_open AND b.date_acquired IS NOT NULL)::int AS "sealedDated",
             extract(year FROM min(b.date_acquired) FILTER (WHERE ${ON_SHELF} AND NOT b.is_open))::int AS "sealedSince",
             count(*) FILTER (
               WHERE ${ON_SHELF} AND NOT b.is_open
                 AND b.date_acquired <= current_date - interval '2 years'
             )::int AS "sealedTwoYears",
             (percentile_cont(0.5) WITHIN GROUP (ORDER BY b.date_opened - b.date_acquired)
                FILTER (WHERE ${ACQUIRED} AND b.date_opened >= b.date_acquired))::int AS "medianWaitDays",
             count(*) FILTER (WHERE ${ACQUIRED} AND b.date_opened >= b.date_acquired)::int AS "waitSample",
             count(*) FILTER (WHERE ${ON_SHELF} AND b.is_open AND b.fill_pct <= 10)::int AS "lastPour",
             count(*) FILTER (WHERE b.status = 'killed')::int AS finished
        FROM bottles b
       WHERE b.owner_id = ${ownerId}
    `),
    db.execute<YearCount>(sql`
      SELECT extract(year FROM b.date_killed)::int AS year, count(*)::int AS count
        FROM bottles b
       WHERE b.owner_id = ${ownerId} AND b.status = 'killed' AND b.date_killed IS NOT NULL
       GROUP BY year ORDER BY year
    `),
    db.execute<YearCount>(sql`
      SELECT extract(year FROM b.date_acquired)::int AS year, count(*)::int AS count
        FROM bottles b
       WHERE b.owner_id = ${ownerId} AND ${ON_SHELF} AND NOT b.is_open AND b.date_acquired IS NOT NULL
       GROUP BY year ORDER BY year
    `),
  ]);
  const row = [...head][0]!;
  return { ...row, finishedByYear: [...finishedRows], sealedByYear: fillYears([...sealedRows]) };
}

/** Empty years between the ends are kept, so a bar chart does not skip time. */
function fillYears(rows: YearCount[]): YearCount[] {
  if (rows.length === 0) return [];
  const byYear = new Map(rows.map((r) => [r.year, r.count]));
  const out: YearCount[] = [];
  for (let year = rows[0]!.year; year <= rows[rows.length - 1]!.year; year += 1) {
    out.push({ year, count: byYear.get(year) ?? 0 });
  }
  return out;
}

export type Money = {
  acquired: number;
  priced: number;
  spend: number;
  thisYear: number;
  lastYearToDate: number;
  msrpSample: number;
  msrpPaid: number;
  msrpList: number;
  overMsrp: number;
  openValue: number;
  sealedValue: number;
  /** Spend where a store was recorded, so a store's share is of money we can place. */
  storedSpend: number;
  storedCount: number;
  topStore: { id: number; name: string; spend: number } | null;
  months: Awaited<ReturnType<typeof acquisitionsOverTime>>;
  priciest: Awaited<ReturnType<typeof mostExpensiveBottle>>;
};

export async function money(ownerId: number): Promise<Money> {
  const [head, stores, months, priciest] = await Promise.all([
    db.execute<Record<string, string | number>>(sql`
      SELECT count(*) FILTER (WHERE ${ACQUIRED})::int AS acquired,
             count(*) FILTER (WHERE ${ACQUIRED} AND b.price_paid IS NOT NULL)::int AS priced,
             coalesce(sum(b.price_paid) FILTER (WHERE ${ACQUIRED}), 0)::float8 AS spend,
             coalesce(sum(b.price_paid) FILTER (
               WHERE ${ACQUIRED} AND b.date_acquired >= date_trunc('year', current_date)
             ), 0)::float8 AS "thisYear",
             coalesce(sum(b.price_paid) FILTER (
               WHERE ${ACQUIRED}
                 AND b.date_acquired >= date_trunc('year', current_date) - interval '1 year'
                 AND b.date_acquired <= current_date - interval '1 year'
             ), 0)::float8 AS "lastYearToDate",
             count(*) FILTER (WHERE ${ACQUIRED} AND b.price_paid IS NOT NULL AND e.msrp IS NOT NULL)::int AS "msrpSample",
             coalesce(sum(b.price_paid) FILTER (WHERE ${ACQUIRED} AND e.msrp IS NOT NULL), 0)::float8 AS "msrpPaid",
             coalesce(sum(e.msrp) FILTER (WHERE ${ACQUIRED} AND b.price_paid IS NOT NULL), 0)::float8 AS "msrpList",
             count(*) FILTER (WHERE ${ACQUIRED} AND b.price_paid > e.msrp)::int AS "overMsrp",
             coalesce(sum(b.price_paid) FILTER (WHERE ${ACQUIRED} AND b.store_id IS NOT NULL), 0)::float8 AS "storedSpend",
             count(*) FILTER (WHERE ${ACQUIRED} AND b.store_id IS NOT NULL AND b.price_paid IS NOT NULL)::int AS "storedCount",
             coalesce(sum(b.price_paid) FILTER (WHERE ${ON_SHELF} AND b.is_open), 0)::float8 AS "openValue",
             coalesce(sum(b.price_paid) FILTER (WHERE ${ON_SHELF} AND NOT b.is_open), 0)::float8 AS "sealedValue"
        FROM bottles b
        JOIN expressions e ON e.id = b.expression_id
       WHERE b.owner_id = ${ownerId}
    `),
    db.execute<{ id: number; name: string; spend: number }>(sql`
      SELECT s.id, s.name::text AS name, sum(b.price_paid)::float8 AS spend
        FROM bottles b JOIN stores s ON s.id = b.store_id
       WHERE b.owner_id = ${ownerId} AND ${ACQUIRED} AND b.price_paid IS NOT NULL
       GROUP BY s.id, s.name
       ORDER BY spend DESC, s.name
       LIMIT 1
    `),
    acquisitionsOverTime(ownerId, 24),
    mostExpensiveBottle(ownerId),
  ]);
  const row = [...head][0]!;
  return {
    ...(row as unknown as Omit<Money, "topStore" | "months" | "priciest">),
    topStore: [...stores][0] ?? null,
    months,
    priciest,
  };
}

export type Acquiring = {
  acquired: number;
  mix: Array<{ kind: Acquisition; count: number }>;
  favouriteStore: { id: number; name: string; count: number; stores: number } | null;
  picks: number;
  topPicker: { name: string; count: number } | null;
};

export async function acquiring(ownerId: number): Promise<Acquiring> {
  const [mix, stores, picks] = await Promise.all([
    db.execute<{ kind: Acquisition; count: number }>(sql`
      SELECT b.acquisition AS kind, count(*)::int AS count
        FROM bottles b
       WHERE b.owner_id = ${ownerId} AND ${ACQUIRED}
       GROUP BY b.acquisition ORDER BY count DESC, kind
    `),
    db.execute<{ id: number; name: string; count: number; stores: number }>(sql`
      SELECT s.id, s.name::text AS name, count(*)::int AS count,
             (count(*) OVER ())::int AS stores
        FROM bottles b JOIN stores s ON s.id = b.store_id
       WHERE b.owner_id = ${ownerId} AND ${ACQUIRED}
       GROUP BY s.id, s.name
       ORDER BY count DESC, s.name
       LIMIT 1
    `),
    db.execute<{ picks: number; name: string | null; count: number | null }>(sql`
      WITH picks AS (
        SELECT b.picked_by FROM bottles b
         WHERE b.owner_id = ${ownerId} AND ${ON_SHELF} AND b.is_single_barrel_pick
      )
      SELECT (SELECT count(*) FROM picks)::int AS picks, top.name, top.count
        FROM (SELECT 1) one
        LEFT JOIN LATERAL (
          SELECT picked_by::text AS name, count(*)::int AS count FROM picks
           WHERE picked_by IS NOT NULL AND picked_by <> ''
           GROUP BY picked_by ORDER BY count DESC, picked_by LIMIT 1
        ) top ON true
    `),
  ]);
  const mixRows = [...mix];
  const pickRow = [...picks][0]!;
  return {
    acquired: mixRows.reduce((sum, r) => sum + r.count, 0),
    mix: mixRows,
    favouriteStore: [...stores][0] ?? null,
    picks: pickRow.picks,
    topPicker: pickRow.name && pickRow.count ? { name: pickRow.name, count: pickRow.count } : null,
  };
}

export type Shelf = {
  onShelf: number;
  caskStrength: number;
  bottledInBond: number;
  liquidMl: number;
  medianAge: number | null;
  ageSample: number;
  proofSample: number;
  categories: Awaited<ReturnType<typeof categoryShare>>;
  proof: Awaited<ReturnType<typeof proofDistribution>>;
  topDistillery: Awaited<ReturnType<typeof topDistilleries>>[number] | null;
};

export async function shelf(ownerId: number): Promise<Shelf> {
  const [head, categories, proof, distilleries] = await Promise.all([
    db.execute<Omit<Shelf, "categories" | "proof" | "topDistillery">>(sql`
      SELECT count(*)::int AS "onShelf",
             count(*) FILTER (WHERE e.is_cask_strength)::int AS "caskStrength",
             count(*) FILTER (WHERE e.is_bottled_in_bond)::int AS "bottledInBond",
             coalesce(sum(b.fill_pct * e.size_ml / 100.0), 0)::float8 AS "liquidMl",
             (percentile_cont(0.5) WITHIN GROUP (ORDER BY bl.age_years))::float8 AS "medianAge",
             count(bl.age_years)::int AS "ageSample",
             count(bl.proof)::int AS "proofSample"
        FROM bottles b
        JOIN expressions e ON e.id = b.expression_id
        JOIN bottle_list bl ON bl.id = b.id
       WHERE b.owner_id = ${ownerId} AND ${ON_SHELF}
    `),
    categoryShare(ownerId),
    proofDistribution(ownerId),
    topDistilleries(ownerId, 1),
  ]);
  return { ...[...head][0]!, categories, proof, topDistillery: distilleries[0] ?? null };
}
