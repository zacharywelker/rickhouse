import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Migration 0056 (the rum Aged backfill). Opt-in like the 0055 test: needs TOURNAMENT_TEST_DATABASE_URL naming a local
 * server where this test may create and drop a database of its own (the name contains "test").
 */
const url = process.env.TOURNAMENT_TEST_DATABASE_URL;

const statements = (file: string) =>
  readFileSync(file, "utf8").split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean);

describe.skipIf(!url)("migration 0056, the rum Aged backfill", () => {
  const dbName = `rickhouse_rum_aged_test_${Math.random().toString(36).slice(2, 8)}`;
  let admin: ReturnType<typeof postgres>;
  let sql: ReturnType<typeof postgres>;
  let ownerId = 0;
  let brandId = 0;
  const cat: Record<string, number> = {};
  const ids: Record<string, number> = {};

  const run = async (file: string) => {
    for (const statement of statements(file)) await sql.unsafe(statement);
  };
  const label = async (name: string, category: string, columns: Record<string, unknown> = {}) => {
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO expressions (brand_id, category_id, name, slug, owner_id)
      VALUES (${brandId}, ${cat[category]!}, ${name}, ${name.toLowerCase().replace(/\W+/g, "-")}, ${ownerId}) RETURNING id`;
    ids[name] = row!.id;
    for (const [column, value] of Object.entries(columns)) await sql.unsafe(`UPDATE expressions SET ${column} = $1 WHERE id = $2`, [value as never, row!.id]);
  };
  const aged = async () => Object.fromEntries((await sql<{ name: string; is_aged: boolean }[]>`SELECT name, is_aged FROM expressions`).map((r) => [r.name, r.is_aged]));

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
    for (const [slug, group] of [["t-rum", "rum"], ["t-bourbon", "whiskey"], ["t-amaro", "amaro"]] as const) {
      const [c] = await sql<{ id: number }[]>`INSERT INTO categories (name, slug, field_group, sort_order) VALUES (${slug}, ${slug}, ${group}, 999) RETURNING id`;
      cat[slug] = c!.id;
    }
    const [owner] = await sql<{ id: number }[]>`INSERT INTO users (name, email, username) VALUES ('T', 't@example.test', 'tester') RETURNING id`;
    ownerId = owner!.id;
    const [brand] = await sql<{ id: number }[]>`INSERT INTO brands (name, slug, owner_id) VALUES ('B', 'b', ${ownerId}) RETURNING id`;
    brandId = brand!.id;
    await label("Bare", "t-rum");
    await label("Years", "t-rum", { age_years: 5 });
    await label("Months", "t-rum", { age_months: 6 });
    await label("Statement", "t-rum", { age_statement: "Solera 15" });
    await label("Blank statement", "t-rum", { age_statement: "  " });
    await label("Nas", "t-rum", { is_nas: true });
    await label("Filled", "t-rum", { barrel_filled_on: "2020-01-01" });
    await label("Bottled", "t-rum", { bottled_on: "2024-01-01" });
    await label("Finished", "t-rum");
    const [finish] = await sql<{ id: number }[]>`INSERT INTO finishes (name, slug, owner_id) VALUES ('Port', 'port', ${ownerId}) RETURNING id`;
    await sql`INSERT INTO expression_finishes (expression_id, finish_id) VALUES (${ids.Finished!}, ${finish!.id})`;
    await label("Bottle age", "t-rum");
    await label("Bottle pick", "t-rum");
    await label("Bottle plain", "t-rum");
    for (const [name, columns] of [["Bottle age", "age_years = 12"], ["Bottle pick", "is_single_barrel_pick = true"], ["Bottle plain", "notes = 'x'"]] as const) {
      const [b] = await sql<{ id: number }[]>`INSERT INTO bottles (owner_id, expression_id) VALUES (${ownerId}, ${ids[name]!}) RETURNING id`;
      await sql.unsafe(`UPDATE bottles SET ${columns} WHERE id = ${b!.id}`);
    }
    await label("Bourbon aged", "t-bourbon", { age_years: 8 });
    await label("Amaro bare", "t-amaro", { age_years: 2 });
    // The migration ran on an empty database, so none of these has been touched yet: run it on the data.
    await run("drizzle/0056_rum_aged_backfill.sql");
  }, 120_000);

  afterAll(async () => {
    await sql?.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.end();
    }
  });

  it("switches on every rum label that shows aging and leaves a bare one off", async () => {
    const now = await aged();
    for (const name of ["Years", "Months", "Statement", "Nas", "Filled", "Bottled", "Finished", "Bottle age", "Bottle pick"]) expect(now[name], name).toBe(true);
    expect(now.Bare).toBe(false);
    expect(now["Blank statement"]).toBe(false);
    expect(now["Bottle plain"]).toBe(false);
  });

  it("leaves labels of other groups alone", async () => {
    const now = await aged();
    expect(now["Bourbon aged"]).toBe(false);
    expect(now["Amaro bare"]).toBe(false);
  });

  it("is idempotent, and does not switch a label off", async () => {
    const before = await aged();
    await run("drizzle/0056_rum_aged_backfill.sql");
    expect(await aged()).toEqual(before);
  });

  it("rolls back to every rum label unaged, without touching its aging facts or other groups", async () => {
    await sql`UPDATE expressions SET is_aged = true WHERE name = 'Amaro bare'`;
    await run("drizzle/rollback/0056_rum_aged_backfill_down.sql");
    const now = await aged();
    for (const name of ["Years", "Statement", "Finished", "Bare"]) expect(now[name], name).toBe(false);
    expect(now["Amaro bare"]).toBe(true);
    const [years] = await sql<{ age_years: string }[]>`SELECT age_years FROM expressions WHERE name = 'Years'`;
    expect(Number(years!.age_years)).toBe(5);
    await run("drizzle/0056_rum_aged_backfill.sql");
  });
});
