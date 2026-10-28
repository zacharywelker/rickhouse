import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";
import { DEFAULT_FILTERS } from "@/lib/bottles/filters";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ requireSession: async () => ({ id: 0 }) }));

/** Opt-in: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("ingredient pages against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let stranger: number;
  let queries: typeof import("../queries");
  let grid: typeof import("@/lib/bottles/grid");
  const mkIngredient = async (user: number, kind: string, name: string) =>
    (await m.sql<{ id: number }>(`INSERT INTO ingredients (owner_id, kind, name) VALUES ($1, $2, $3) RETURNING id`, user, kind, name))[0]!.id;
  const linkLabel = async (user: number, ingredient: number, name: string) => {
    const label = await fx.mkLabel(user, cat.rum, name);
    await m.sql(`INSERT INTO expression_ingredients (expression_id, ingredient_id, position, is_manual) VALUES ($1, $2, 0, true)`, label, ingredient);
    return label;
  };

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    owner = await fx.mkUser();
    stranger = await fx.mkUser();
    queries = await import("../queries");
    grid = await import("@/lib/bottles/grid");
  });
  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  it("finds the ingredient for its owner and for nobody else", async () => {
    const id = await mkIngredient(owner, "rum_base", "Palm Sugar");
    expect(await queries.getIngredient(id, owner)).toMatchObject({ id, name: "Palm Sugar", kind: "rum_base" });
    expect(await queries.getIngredient(id, stranger)).toBeNull();
  });

  it("lists same-name rows of other kinds with bottle counts, and never another account's", async () => {
    const rum = await mkIngredient(owner, "rum_base", "Wheatish");
    const vodka = await mkIngredient(owner, "vodka_base", "Wheatish");
    const theirs = await mkIngredient(stranger, "gin_base", "Wheatish");
    await fx.mkBottle(owner, await linkLabel(owner, vodka, "Vodka label"));
    await fx.mkBottle(owner, await linkLabel(owner, vodka, "Vodka label two"));
    await linkLabel(stranger, theirs, "Their label");
    const also = await queries.getAlsoUsedAs({ id: rum, name: "Wheatish" }, owner);
    expect(also).toEqual([{ id: vodka, kind: "vodka_base", bottles: 2 }]);
  });

  it("filters the grid to bottles whose label links the ingredient", async () => {
    const a = await mkIngredient(owner, "rum_base", "Filter A");
    const b = await mkIngredient(owner, "rum_base", "Filter B");
    await fx.mkBottle(owner, await linkLabel(owner, a, "Filter label A"));
    await fx.mkBottle(owner, await linkLabel(owner, b, "Filter label B"));
    // If every count here is 0, check that a new bottle's default status is in DEFAULT_STATUSES.
    expect((await grid.queryBottles({ ...DEFAULT_FILTERS, ingredientIds: [a] }, owner)).total).toBe(1);
    expect((await grid.queryBottles({ ...DEFAULT_FILTERS, ingredientIds: [a, b] }, owner)).total).toBe(2);
    expect((await grid.queryBottles({ ...DEFAULT_FILTERS, ingredientIds: [a] }, stranger)).total).toBe(0);
  });
});
