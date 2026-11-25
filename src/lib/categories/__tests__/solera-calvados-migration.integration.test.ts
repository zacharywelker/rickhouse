import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Migrations 0057 (solera ages, Calvados appellation, vintage year, Mosto Verde) and 0058 (mezcal production and flavor). Opt-in, like the 0055 and 0056 tests. */
const url = process.env.TOURNAMENT_TEST_DATABASE_URL;

describe.skipIf(!url)("migration 0057", () => {
  const dbName = `rickhouse_solera_test_${Math.random().toString(36).slice(2, 8)}`;
  let admin: ReturnType<typeof postgres>;
  let sql: ReturnType<typeof postgres>;
  let label = 0;

  beforeAll(async () => {
    const adminUrl = new URL(url!);
    adminUrl.pathname = "/postgres";
    admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE DATABASE ${dbName}`);
    const own = new URL(url!);
    own.pathname = `/${dbName}`;
    sql = postgres(own.toString(), { max: 1, onnotice: () => {} });
    await sql.unsafe("CREATE EXTENSION IF NOT EXISTS citext");
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    const [c] = await sql<{ id: number }[]>`INSERT INTO categories (name, slug, field_group, sort_order) VALUES ('t', 't-cat', 'brandy', 999) RETURNING id`;
    const [owner] = await sql<{ id: number }[]>`INSERT INTO users (name, email, username) VALUES ('T', 't@example.test', 'tester') RETURNING id`;
    const [brand] = await sql<{ id: number }[]>`INSERT INTO brands (name, slug, owner_id) VALUES ('B', 'b', ${owner!.id}) RETURNING id`;
    const [l] = await sql<{ id: number }[]>`INSERT INTO expressions (brand_id, category_id, name, slug, owner_id) VALUES (${brand!.id}, ${c!.id}, 'L', 'l', ${owner!.id}) RETURNING id`;
    label = l!.id;
  }, 120_000);

  afterAll(async () => {
    await sql?.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.end();
    }
  });

  it("adds the columns with their defaults", async () => {
    const [row] = await sql<{ is_mosto_verde: boolean; calvados_appellation: string | null }[]>`SELECT is_mosto_verde, calvados_appellation FROM expressions WHERE id = ${label}`;
    expect(row).toEqual({ is_mosto_verde: false, calvados_appellation: null });
  });
  it("takes a solera range, a known appellation and a vintage year", async () => {
    await sql`UPDATE expressions SET solera_low_years = 5, solera_high_years = 12, calvados_appellation = 'pays-d-auge', brandy_vintage_year = 1985 WHERE id = ${label}`;
    const [row] = await sql<{ solera_low_years: string }[]>`SELECT solera_low_years FROM expressions WHERE id = ${label}`;
    expect(Number(row!.solera_low_years)).toBe(5);
  });
  it("refuses a youngest age above the oldest, an unknown appellation and an impossible year", async () => {
    await expect(sql`UPDATE expressions SET solera_low_years = 20, solera_high_years = 5 WHERE id = ${label}`).rejects.toThrow(/solera_range_check/);
    await expect(sql`UPDATE expressions SET calvados_appellation = 'cider' WHERE id = ${label}`).rejects.toThrow(/appellation_check/);
    await expect(sql`UPDATE expressions SET brandy_vintage_year = 1200 WHERE id = ${label}`).rejects.toThrow(/vintage_year_check/);
  });
  it("0058 takes a mezcal production and flavor method, and refuses others", async () => {
    await sql`UPDATE expressions SET mezcal_production = 'ancestral', mezcal_flavor_method = 'abocado-con' WHERE id = ${label}`;
    await expect(sql`UPDATE expressions SET mezcal_production = 'industrial' WHERE id = ${label}`).rejects.toThrow(/mezcal_production_check/);
    await expect(sql`UPDATE expressions SET mezcal_flavor_method = 'infused' WHERE id = ${label}`).rejects.toThrow(/flavor_method_check/);
    const readFile = (await import("node:fs")).readFileSync;
    for (const statement of readFile("drizzle/rollback/0058_mezcal_production_flavor_down.sql", "utf8").split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean)) await sql.unsafe(statement);
    const cols = await sql<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'expressions' AND column_name LIKE 'mezcal_%'`;
    expect(cols).toEqual([]);
    for (const statement of readFile("drizzle/0058_mezcal_production_flavor.sql", "utf8").split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean)) await sql.unsafe(statement);
  });

  it("rolls back cleanly", async () => {
    for (const statement of (await import("node:fs")).readFileSync("drizzle/rollback/0057_solera_calvados_pisco_down.sql", "utf8").split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean)) await sql.unsafe(statement);
    const cols = await sql<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'expressions' AND column_name IN ('solera_low_years', 'is_mosto_verde')`;
    expect(cols).toEqual([]);
  });
});
