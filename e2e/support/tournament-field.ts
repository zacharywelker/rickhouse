import postgres from "postgres";

/** Eight labels with a bottle each, at proofs 90 to 125. Their names are unlikely to occur anywhere else on a page. */
export const FIELD_WORDS = ["Quillon", "Brevard", "Tamsin", "Corbett", "Marlow", "Ostrava", "Penhall", "Ravenel"] as const;
export const FIELD_BRAND = "Tz";
export const FIELD_COUNT = FIELD_WORDS.length;
export const FIELD_NAMES = new RegExp(FIELD_WORDS.join("|"));

const PROOFS = [90, 92, 100, 101, 112, 115, 120, 125];

/**
 * Throws unless DATABASE_URL names a throwaway database on this machine (localhost, no `host=` override): one whose name has a segment test, tourney, scratch or proto
 * (`rickhouse_tourney_web`, `rickhouse_tourney_proto` pass; `rickhouse` and `contest` do not). Call it before anything
 * that resets or seeds, since `resetDatabase()` wipes whatever the URL points at.
 */
export function assertThrowawayDatabase(url: string | undefined = process.env.DATABASE_URL): void {
  let name = "";
  let local = false;
  try {
    const parsed = new URL(url ?? "");
    name = decodeURIComponent(parsed.pathname.slice(1));
    local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) && !parsed.searchParams.has("host");
  } catch {
    name = "";
  }
  if (!local || !/(^|_)(test|tourney|scratch|proto)(_|$)/.test(name)) {
    throw new Error("DATABASE_URL must be a local throwaway database (a name with a test, tourney, scratch or proto segment).");
  }
}

/**
 * Gives the admin account the field the tournament specs play with. `db:reset` leaves one bottle, and the specs need
 * eight with a proof. Rows go in with plain SQL: the point is the tournament screens, not the bottle form.
 * Run `resetDatabase()` first; refuses anything but a throwaway database.
 */
export async function seedTournamentField(): Promise<void> {
  assertThrowawayDatabase();
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [owner] = await sql<{ id: number }[]>`SELECT id FROM users WHERE username = 'admin'`;
    const [category] = await sql<{ id: number }[]>`SELECT id FROM categories WHERE name = 'Bourbon' LIMIT 1`;
    if (!owner || !category) throw new Error("seedTournamentField: run db:reset first (no admin or no Bourbon category).");
    const [brand] = await sql<{ id: number }[]>`INSERT INTO brands (name, slug, owner_id) VALUES (${FIELD_BRAND}, 'tz-e2e', ${owner.id}) RETURNING id`;
    for (const [i, word] of FIELD_WORDS.entries()) {
      const [label] = await sql<{ id: number }[]>`
        INSERT INTO expressions (brand_id, category_id, name, slug, owner_id, proof)
        VALUES (${brand!.id}, ${category.id}, ${word}, ${`tz-e2e-${i}`}, ${owner.id}, ${PROOFS[i]!})
        RETURNING id`;
      await sql`INSERT INTO bottles (expression_id, owner_id) VALUES (${label!.id}, ${owner.id})`;
    }
  } finally {
    await sql.end();
  }
}
