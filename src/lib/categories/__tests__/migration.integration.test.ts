import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { categoryKinds } from "@/lib/expressions/rules";
import { CATEGORY_TREE } from "../tree";

/**
 * Migration 0055 against the tree as it was before it. Opt-in: needs TOURNAMENT_TEST_DATABASE_URL naming a local
 * database on a server where this test may create and drop a database of its own (the name contains "test").
 */
const url = process.env.TOURNAMENT_TEST_DATABASE_URL;

/** The category rows the seed made before the redesign (scripts/seed.ts on 2026-11-24). */
const OLD_TREE: ReadonlyArray<[name: string, slug: string, parent: string | null, group: string, sort: number]> = [
  ["Whiskey", "whiskey", null, "whiskey", 1],
  ["Rum", "rum", null, "rum", 2],
  ["Agave", "agave", null, "agave", 3],
  ["Brandy", "brandy", null, "brandy", 4],
  ["Gin", "gin", null, "gin", 5],
  ["Genever", "genever", "gin", "gin", 1],
  ["Vodka", "vodka", null, "vodka", 6],
  ["Flavored Vodka", "flavored-vodka", "vodka", "vodka", 1],
  ["Amaro", "amaro", null, "amaro", 7],
  ["Liqueur", "liqueur", null, "liqueur", 8],
  ["Herbal Liqueur", "herbal-liqueur", "liqueur", "liqueur", 1],
  ["Nut Liqueur", "nut-liqueur", "liqueur", "liqueur", 2],
  ["Chocolate Liqueur", "chocolate-liqueur", "liqueur", "liqueur", 3],
  ["Coffee Liqueur", "coffee-liqueur", "liqueur", "liqueur", 4],
  ["Cream Liqueur", "cream-liqueur", "liqueur", "liqueur", 5],
  ["Anise Liqueur", "anise-liqueur", "liqueur", "liqueur", 6],
  ["Fruit Liqueur", "fruit-liqueur", "liqueur", "liqueur", 7],
  ["Tequila", "tequila", "agave", "agave", 1],
  ["Mezcal", "mezcal", "agave", "agave", 2],
  ["Cognac", "cognac", "brandy", "brandy", 1],
  ["Armagnac", "armagnac", "brandy", "brandy", 2],
  ["Calvados", "calvados", "brandy", "brandy", 3],
  ["Pisco", "pisco", "brandy", "brandy", 4],
  ["American Whiskey", "american-whiskey", "whiskey", "whiskey", 1],
  ["Scotch Whisky", "scotch", "whiskey", "whiskey", 2],
  ["Irish Whiskey", "irish-whiskey", "whiskey", "whiskey", 3],
  ["Canadian Whisky", "canadian-whisky", "whiskey", "whiskey", 4],
  ["Pot Still Irish Whiskey", "pot-still-irish-whiskey", "irish-whiskey", "whiskey", 1],
  ["Malt Irish Whiskey", "malt-irish-whiskey", "irish-whiskey", "whiskey", 2],
  ["Grain Irish Whiskey", "grain-irish-whiskey", "irish-whiskey", "whiskey", 3],
  ["Blended Irish Whiskey", "blended-irish-whiskey", "irish-whiskey", "whiskey", 4],
  ["Single Malt Scotch Whisky", "single-malt-scotch", "scotch", "whiskey", 1],
  ["Single Grain Scotch Whisky", "single-grain-scotch", "scotch", "whiskey", 2],
  ["Blended Scotch Whisky", "blended-scotch", "scotch", "whiskey", 3],
  ["Blended Grain Scotch Whisky", "blended-grain-scotch", "scotch", "whiskey", 4],
  ["Blended Malt Scotch Whisky", "blended-malt-scotch", "scotch", "whiskey", 5],
  ["Bourbon", "bourbon", "american-whiskey", "whiskey", 1],
  ["Rye", "rye", "american-whiskey", "whiskey", 2],
  ["Wheat Whiskey", "wheat-whiskey", "american-whiskey", "whiskey", 3],
  ["Corn Whiskey", "corn-whiskey", "american-whiskey", "whiskey", 4],
  ["American Single Malt", "american-single-malt", "american-whiskey", "whiskey", 5],
  ["Light Whiskey", "light-whiskey", "american-whiskey", "whiskey", 6],
];

const NEW_SLUGS = ["tennessee", "japanese", "international", "flavored-whisky", "cachaca", "agricole", "spiced-rum", "apple", "eau-de-vie", "absinthe", "akvavit", "shochu", "other"];

const statements = (file: string) =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .filter(Boolean);

describe.skipIf(!url)("migration 0055 on the old category tree", () => {
  const dbName = `rickhouse_p3_tree_test_${Math.random().toString(36).slice(2, 8)}`;
  let admin: ReturnType<typeof postgres>;
  let sql: ReturnType<typeof postgres>;
  let ownerId = 0;
  let brandId = 0;

  const run = async (file: string) => {
    for (const statement of statements(file)) await sql.unsafe(statement);
  };
  const rows = async () =>
    sql<{ id: number; slug: string; name: string; parentId: number | null; parent: string | null; group: string; sort: number }[]>`
      SELECT c.id, c.slug, c.name, c.parent_id AS "parentId", p.slug AS parent, c.field_group AS "group", c.sort_order AS sort
        FROM categories c LEFT JOIN categories p ON p.id = c.parent_id ORDER BY c.slug`;
  const shape = async () => (await rows()).map(({ slug, name, parent, group, sort }) => ({ slug, name, parent, group, sort }));
  const groupQueries = async () => (await sql<{ name: string; q: string | null }[]>`SELECT name, filter_query AS q FROM groups ORDER BY name`).map((r) => [r.name, r.q]);

  beforeAll(async () => {
    const adminUrl = new URL(url!);
    adminUrl.pathname = "/postgres";
    admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE DATABASE ${dbName}`);
    const own = new URL(url!);
    own.pathname = `/${dbName}`;
    sql = postgres(own.toString(), { max: 1, onnotice: () => {} });
    await sql.unsafe("CREATE EXTENSION IF NOT EXISTS citext");
    // Every migration, 0055 included. Earlier migrations leave a few category rows (Amaro, Liqueur); start from the old
    // tree exactly as the seed made it.
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    await sql`DELETE FROM categories`;
    for (const [name, slug, parent, group, sort] of OLD_TREE) {
      await sql`INSERT INTO categories (name, slug, parent_id, field_group, sort_order)
                VALUES (${name}, ${slug}, (SELECT id FROM categories WHERE slug = ${parent}), ${group}, ${sort})`;
    }
    [{ id: ownerId }] = await sql<{ id: number }[]>`INSERT INTO users (name, email, username) VALUES ('T', 't@example.test', 'tester') RETURNING id`;
    [{ id: brandId }] = await sql<{ id: number }[]>`INSERT INTO brands (name, slug, owner_id) VALUES ('B', 'b', ${ownerId}) RETURNING id`;
  }, 120_000);

  afterAll(async () => {
    await sql?.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.end();
    }
  });

  it("keeps every id, every label's category and every old category's kind, and reaches the target tree", async () => {
    const before = await rows();
    const idBySlug = new Map(before.map((r) => [r.slug, r.id]));
    for (const r of before) {
      await sql`INSERT INTO expressions (brand_id, category_id, name, slug, owner_id) VALUES (${brandId}, ${r.id}, ${`L ${r.slug}`}, ${`l-${r.slug}`}, ${ownerId})`;
    }
    const whiskey = idBySlug.get("whiskey")!;
    const rum = idBySlug.get("rum")!;
    const bourbon = idBySlug.get("bourbon")!;
    await sql`INSERT INTO groups (name, slug, owner_id, filter_query) VALUES
      ('g1', 'g1', ${ownerId}, ${`category=${whiskey}`}),
      ('g2', 'g2', ${ownerId}, ${`category=${whiskey},${rum}&pick=1`}),
      ('g3', 'g3', ${ownerId}, 'store=3'),
      ('g4', 'g4', ${ownerId}, ${`category=${bourbon}`}),
      ('g5', 'g5', ${ownerId}, ${`pick=1&category=${whiskey}`}),
      ('g6', 'g6', ${ownerId}, NULL)`;
    const labelsBefore = await sql<{ slug: string; category_id: number }[]>`SELECT slug, category_id FROM expressions ORDER BY slug`;
    const kindsBefore = categoryKinds(before);

    await run("drizzle/0055_category_tree.sql");

    const after = await rows();
    const slugs = new Set(after.map((r) => r.slug));
    for (const [, slug] of OLD_TREE) {
      expect(slugs.has(slug), slug).toBe(true);
      expect(after.find((r) => r.slug === slug)!.id, slug).toBe(idBySlug.get(slug));
    }
    expect(await sql`SELECT slug, category_id FROM expressions ORDER BY slug`).toEqual(labelsBefore);
    const kindsAfter = categoryKinds(after);
    for (const [, slug] of OLD_TREE) expect(kindsAfter[idBySlug.get(slug)!], slug).toBe(kindsBefore[idBySlug.get(slug)!]);

    expect(await shape()).toEqual(
      [...CATEGORY_TREE].map(({ slug, name, parent, fieldGroup, sortOrder }) => ({ slug, name, parent, group: fieldGroup, sort: sortOrder })).sort((a, b) => a.slug.localeCompare(b.slug)),
    );
    const top = after.find((r) => r.slug === "whiskey")!;
    expect(top.name).toBe("Whisky");
    expect(after.filter((r) => r.parentId === top.id).map((r) => r.slug).sort()).toEqual(["canadian-whisky", "flavored-whisky", "international", "japanese"]);

    const q = Object.fromEntries(await groupQueries());
    const moved = ["american-whiskey", "scotch", "irish-whiskey"].map((s) => idBySlug.get(s)!).sort((a, b) => a - b).join(",");
    expect(q.g1).toBe(`category=${whiskey},${moved}`);
    expect(q.g2).toBe(`category=${whiskey},${rum},${moved}&pick=1`);
    expect(q.g3).toBe("store=3");
    expect(q.g4).toBe(`category=${bourbon}`);
    expect(q.g5).toBe(`pick=1&category=${whiskey},${moved}`);
    expect(q.g6).toBeNull();
  });

  it("changes nothing when it is run again", async () => {
    const treeBefore = await shape();
    const groupsBefore = await groupQueries();
    await run("drizzle/0055_category_tree.sql");
    expect(await shape()).toEqual(treeBefore);
    expect(await groupQueries()).toEqual(groupsBefore);
  });

  it("is undone by the down script, which refuses while a label uses a new category", async () => {
    const [tennessee] = await sql<{ id: number }[]>`SELECT id FROM categories WHERE slug = 'tennessee'`;
    await sql`INSERT INTO expressions (brand_id, category_id, name, slug, owner_id) VALUES (${brandId}, ${tennessee!.id}, 'T', 'l-tennessee', ${ownerId})`;
    await expect(run("drizzle/rollback/0055_category_tree_down.sql")).rejects.toThrow(/Cannot roll back/);
    await sql`DELETE FROM expressions WHERE slug = 'l-tennessee'`;
    await run("drizzle/rollback/0055_category_tree_down.sql");

    const back = await rows();
    for (const slug of NEW_SLUGS) expect(back.some((r) => r.slug === slug), slug).toBe(false);
    for (const [, slug, parent] of OLD_TREE) expect(back.find((r) => r.slug === slug)!.parent, slug).toBe(parent);
    expect(back.find((r) => r.slug === "whiskey")!.name).toBe("Whiskey");
  });
});

describe.skipIf(!url)("a fresh install: migrations, then the seed", () => {
  const dbName = `rickhouse_p3_seed_test_${Math.random().toString(36).slice(2, 8)}`;
  let admin: ReturnType<typeof postgres>;
  let sql: ReturnType<typeof postgres>;
  let dbUrl = "";
  const shape = async () =>
    (await sql<{ slug: string; name: string; parent: string | null; group: string; sort: number }[]>`
      SELECT c.slug, c.name, p.slug AS parent, c.field_group AS "group", c.sort_order AS sort
        FROM categories c LEFT JOIN categories p ON p.id = c.parent_id ORDER BY c.slug`);
  const seed = () =>
    promisify(execFile)("npx", ["tsx", "scripts/seed.ts"], { env: { ...process.env, DATABASE_URL: dbUrl }, timeout: 120_000 });

  beforeAll(async () => {
    const adminUrl = new URL(url!);
    adminUrl.pathname = "/postgres";
    admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE DATABASE ${dbName}`);
    const own = new URL(url!);
    own.pathname = `/${dbName}`;
    dbUrl = own.toString();
    sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
    await sql.unsafe("CREATE EXTENSION IF NOT EXISTS citext");
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  }, 120_000);

  afterAll(async () => {
    await sql?.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.end();
    }
  });

  const target = () =>
    [...CATEGORY_TREE].map(({ slug, name, parent, fieldGroup, sortOrder }) => ({ slug, name, parent, group: fieldGroup, sort: sortOrder })).sort((a, b) => a.slug.localeCompare(b.slug));

  it("ends with exactly the target tree", async () => {
    await seed();
    expect(await shape()).toEqual(target());
  }, 150_000);

  it("changes nothing when the seed runs again", async () => {
    await seed();
    expect(await shape()).toEqual(target());
  }, 150_000);
});
