import postgres from "postgres";
import { assertThrowawayDatabase } from "./tournament-field";

/** Eighteen labels with no photo (one bottle each), five single-barrel bottles with no photo, four vintages with none. */
export const HK_LABELS = 18;
export const HK_BARRELS = 5;
export const HK_VINTAGES = 4;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Gives the admin account what the Housekeeping photo specs page through. The barrels' labels and the vintages' label
 * have their own photo so they do not add to the Labels count. Plain SQL, like the tournament seed: the point is the
 * Housekeeping screens. Run `resetDatabase()` first; refuses anything but a throwaway database.
 */
export async function seedHousekeepingField(): Promise<void> {
  assertThrowawayDatabase();
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const [owner] = await sql<{ id: number }[]>`SELECT id FROM users WHERE username = 'admin'`;
    const [category] = await sql<{ id: number }[]>`SELECT id FROM categories WHERE name = 'Bourbon' LIMIT 1`;
    if (!owner || !category) throw new Error("seedHousekeepingField: run db:reset first (no admin or no Bourbon category).");
    const [brand] = await sql<{ id: number }[]>`INSERT INTO brands (name, slug, owner_id) VALUES ('Hk', 'hk-e2e', ${owner.id}) RETURNING id`;
    const label = async (name: string, slug: string, photo: string | null) => {
      const [row] = await sql<{ id: number }[]>`
        INSERT INTO expressions (brand_id, category_id, name, slug, owner_id, photo_path)
        VALUES (${brand!.id}, ${category.id}, ${name}, ${slug}, ${owner.id}, ${photo})
        RETURNING id`;
      return row!.id;
    };
    for (let i = 1; i <= HK_LABELS; i++) {
      const id = await label(`Hk Lab ${pad(i)}`, `hk-lab-${pad(i)}`, null);
      await sql`INSERT INTO bottles (expression_id, owner_id) VALUES (${id}, ${owner.id})`;
    }
    for (let i = 1; i <= HK_BARRELS; i++) {
      const id = await label(`Hk Barrel ${pad(i)}`, `hk-barrel-${pad(i)}`, "bottles/seed.webp");
      await sql`INSERT INTO bottles (expression_id, owner_id, is_single_barrel, barrel_number) VALUES (${id}, ${owner.id}, true, ${String(400 + i)})`;
    }
    const base = await label("Hk Vintage Base", "hk-vintage-base", "bottles/seed.webp");
    for (let i = 1; i <= HK_VINTAGES; i++) {
      await sql`INSERT INTO expression_releases (expression_id, name, release_year) VALUES (${base}, ${`Hk Vintage ${pad(i)}`}, ${2015 + i})`;
    }
  } finally {
    await sql.end();
  }
}

/** The id of the admin's label with this name, for specs that open its own page. */
export async function labelIdByName(name: string): Promise<number> {
  assertThrowawayDatabase();
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const [row] = await sql<{ id: number }[]>`SELECT id FROM expressions WHERE name = ${name}`;
    if (!row) throw new Error(`No label named ${name}`);
    return row.id;
  } finally {
    await sql.end();
  }
}

/** How many of the admin's labels have no photo right now (the reset's own example data adds to the seeded field). */
export async function countUnpicturedLabels(): Promise<number> {
  assertThrowawayDatabase();
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM expressions
      WHERE photo_path IS NULL AND owner_id = (SELECT id FROM users WHERE username = 'admin')`;
    return row!.n;
  } finally {
    await sql.end();
  }
}
