import postgres from "postgres";

/** Eight labels with a bottle each, at proofs 90 to 125. Their names are unlikely to occur anywhere else on a page. */
export const FIELD_WORDS = ["Quillon", "Brevard", "Tamsin", "Corbett", "Marlow", "Ostrava", "Penhall", "Ravenel"] as const;
export const FIELD_BRAND = "Tz";
export const FIELD_COUNT = FIELD_WORDS.length;
export const FIELD_NAMES = new RegExp(FIELD_WORDS.join("|"));

const PROOFS = [90, 92, 100, 101, 112, 115, 120, 125];

/**
 * Gives the admin account the field the tournament specs play with. `db:reset` leaves one bottle, and the specs need
 * eight with a proof. Rows go in with plain SQL: the point is the tournament screens, not the bottle form.
 * Run `resetDatabase()` first; refuses anything but a throwaway database.
 */
export async function seedTournamentField(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url || !/(test|tourney|scratch|proto)/.test(new URL(url).pathname.slice(1))) {
    throw new Error("seedTournamentField needs DATABASE_URL to name a throwaway database (see the guard in the brief).");
  }
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
