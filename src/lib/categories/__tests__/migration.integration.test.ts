import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { DEFAULT_FILTERS, parseFilters, serialiseFilters } from "@/lib/bottles/filters";
import { categoryKinds } from "@/lib/expressions/rules";
import { CATEGORY_TREE } from "../tree";
import { OLD_TREE } from "./old-tree";

/**
 * Migration 0055 against the tree as it was before it. Opt-in: needs TOURNAMENT_TEST_DATABASE_URL naming a local
 * database on a server where this test may create and drop a database of its own (the name contains "test").
 */
const url = process.env.TOURNAMENT_TEST_DATABASE_URL;

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
    const [owner] = await sql<{ id: number }[]>`INSERT INTO users (name, email, username) VALUES ('T', 't@example.test', 'tester') RETURNING id`;
    ownerId = owner!.id;
    const [brand] = await sql<{ id: number }[]>`INSERT INTO brands (name, slug, owner_id) VALUES ('B', 'b', ${ownerId}) RETURNING id`;
    brandId = brand!.id;
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
    // Stored the way the app stores them: serialiseFilters percent-encodes the comma ("category=12%2C40").
    const saved = (categoryIds: number[], storeIds: number[] = []) => serialiseFilters({ ...DEFAULT_FILTERS, categoryIds, storeIds });
    await sql`INSERT INTO groups (name, slug, owner_id, filter_query) VALUES
      ('g1', 'g1', ${ownerId}, ${saved([whiskey])}),
      ('g2', 'g2', ${ownerId}, ${saved([whiskey, rum], [3])}),
      ('g3', 'g3', ${ownerId}, ${saved([], [3])}),
      ('g4', 'g4', ${ownerId}, ${saved([bourbon])}),
      ('g5', 'g5', ${ownerId}, ${`store=3&category=${whiskey}`}),
      ('g6', 'g6', ${ownerId}, NULL),
      ('g7', 'g7', ${ownerId}, ${saved([rum, whiskey])}),
      ('g8', 'g8', ${ownerId}, ${`category=${whiskey},${rum}`})`;
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

    const q = Object.fromEntries(await groupQueries()) as Record<string, string | null>;
    const moved = ["american-whiskey", "scotch", "irish-whiskey"].map((slug) => idBySlug.get(slug)!);
    const read = (name: string) => parseFilters(Object.fromEntries(new URLSearchParams(q[name]!)));
    const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);
    // The app reads these back: the original ids are kept, the three moved ids are added once, the rest is untouched.
    expect(sorted(read("g1").categoryIds)).toEqual(sorted([whiskey, ...moved]));
    expect(sorted(read("g2").categoryIds)).toEqual(sorted([whiskey, rum, ...moved]));
    expect(read("g2").storeIds).toEqual([3]);
    expect(sorted(read("g7").categoryIds)).toEqual(sorted([rum, whiskey, ...moved]));
    expect(sorted(read("g8").categoryIds)).toEqual(sorted([whiskey, rum, ...moved]));
    expect(sorted(read("g5").categoryIds)).toEqual(sorted([whiskey, ...moved]));
    expect(read("g5").storeIds).toEqual([3]);
    // A group without the umbrella, without a category, or hand-picked is left exactly as it was.
    expect(q.g3).toBe(saved([], [3]));
    expect(q.g4).toBe(saved([bourbon]));
    expect(q.g6).toBeNull();
    // Written back the way the app writes it.
    expect(q.g1).toContain("%2C");
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
    // And the order the seed made: American, Scotch, Irish, Canadian; Herbal first among the liqueurs.
    const sortOf = (slug: string) => back.find((r) => r.slug === slug)!.sort;
    expect(["american-whiskey", "scotch", "irish-whiskey", "canadian-whisky"].map(sortOf)).toEqual([1, 2, 3, 4]);
    expect(["herbal-liqueur", "fruit-liqueur"].map(sortOf)).toEqual([1, 7]);
    for (const [, slug, , , sort] of OLD_TREE) expect(sortOf(slug), slug).toBe(sort);
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
