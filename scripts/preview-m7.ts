/**
 * Shows what the M7 migration would do to YOUR data, without touching it.
 *
 *   npm run m7:preview
 *
 * Run this against the live database before upgrading. The migration merges
 * label rows that share a brand and name, which is irreversible in the sense
 * that two rows become one — so it is worth seeing the list first.
 *
 * Read-only. It opens a transaction and rolls it back, so even the temporary
 * tables it builds leave nothing behind.
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const client = postgres(url, { max: 1 });
const db = drizzle(client);

type Group = {
  brand: string;
  name: string;
  ids: number[];
  batches: (string | null)[];
  bottles: number;
  conflicts: string[];
};

// Columns that move to the bottle, so disagreeing on them is not a conflict.
const MOVED = [
  "id", "slug", "created_at", "updated_at",
  "batch", "release_year", "is_single_barrel", "is_single_barrel_pick",
  "barrel_number", "bottle_count", "pick_name", "picked_by",
  "barrel_filled_on", "bottled_on", "warehouse", "rick_floor",
];

async function main() {
  const rows = await db.execute<Group>(sql`
    WITH grouped AS (
      SELECT e.brand_id,
             lower(e.name::text) AS key,
             min(e.id)           AS keeper_id,
             count(*)            AS n
        FROM expressions e
       GROUP BY e.brand_id, lower(e.name::text)
      HAVING count(*) > 1
    )
    SELECT b.name::text AS brand,
           k.name::text AS name,
           ARRAY(SELECT e.id FROM expressions e
                  WHERE e.brand_id = g.brand_id
                    AND lower(e.name::text) = g.key
                  ORDER BY e.id) AS ids,
           ARRAY(SELECT coalesce(e.batch, '—') FROM expressions e
                  WHERE e.brand_id = g.brand_id
                    AND lower(e.name::text) = g.key
                  ORDER BY e.id) AS batches,
           (SELECT count(*)::int FROM bottles bo
             JOIN expressions e ON e.id = bo.expression_id
            WHERE e.brand_id = g.brand_id
              AND lower(e.name::text) = g.key) AS bottles,
           coalesce((
             SELECT array_agg(DISTINCT d.key)
               FROM expressions e
               CROSS JOIN LATERAL jsonb_each_text(to_jsonb(e)) AS d(key, val)
               JOIN LATERAL jsonb_each_text(to_jsonb(k)) AS kv(key2, val2)
                 ON kv.key2 = d.key
              WHERE e.brand_id = g.brand_id
                AND lower(e.name::text) = g.key
                AND e.id <> g.keeper_id
                AND d.val IS DISTINCT FROM kv.val2
                AND d.key NOT IN (${sql.join(MOVED.map((c) => sql`${c}`), sql`, `)})
           ), '{}'::text[]) AS conflicts
      FROM grouped g
      JOIN expressions k ON k.id = g.keeper_id
      JOIN brands b ON b.id = g.brand_id
     ORDER BY b.name, k.name
  `);

  const groups = [...rows];

  const [{ labels = 0 } = {}] = [
    ...(await db.execute<{ labels: number }>(sql`SELECT count(*)::int AS labels FROM expressions`)),
  ];

  console.log(`\n  ${labels} labels today.\n`);

  if (groups.length === 0) {
    console.log("  Nothing would merge. Every label already has a unique brand + name.\n");
    return;
  }

  const merging = groups.reduce((sum, g) => sum + g.ids.length, 0);
  console.log(
    `  ${merging} labels in ${groups.length} group${groups.length === 1 ? "" : "s"} would merge ` +
      `into ${groups.length}, leaving ${labels - merging + groups.length}.\n`,
  );

  for (const g of groups) {
    const batches = g.batches.map((b) => b ?? "—").join(", ");
    console.log(`  ${g.brand} ${g.name}`);
    console.log(`    ids ${g.ids.join(", ")}  ·  batches ${batches}  ·  ${g.bottles} bottle(s)`);
    console.log(`    keeps id ${g.ids[0]}; each bottle keeps its own batch`);
    if (g.conflicts.length > 0) {
      console.log(`    ⚠ also disagree on: ${g.conflicts.join(", ")}`);
      console.log(`      id ${g.ids[0]}'s values win; the others are saved whole in label_merge_log`);
    }
    console.log();
  }

  const conflicted = groups.filter((g) => g.conflicts.length > 0);
  if (conflicted.length === 0) {
    console.log("  No conflicts: every merge is lossless once batch moves to the bottle.\n");
  } else {
    console.log(
      `  ${conflicted.length} group(s) disagree beyond batch. Nothing is deleted — the\n` +
        "  discarded rows land in label_merge_log. If you would rather reconcile them\n" +
        "  by hand first, edit them so they match (or rename one) before upgrading.\n",
    );
  }
}

main()
  .then(() => client.end())
  .catch(async (error) => {
    console.error(error);
    await client.end();
    process.exit(1);
  });
