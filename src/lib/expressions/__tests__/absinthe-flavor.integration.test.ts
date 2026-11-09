import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";

const session = vi.hoisted(() => ({ id: 0 }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ requireSession: async () => ({ id: session.id }) }));

/** Opt-in: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("absinthe supplies its own anise, against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let owner: number;
  let brand: number;
  let absinthe: number;
  let liqueur: number;
  let catalog: typeof import("@/app/(app)/bottles/add/actions");
  let save: typeof import("../save");
  const made: number[] = [];

  const category = async (name: string, slug: string, parent: number | null) => {
    const [row] = await m.sql<{ id: number }>(
      `INSERT INTO categories (name, slug, field_group, parent_id) VALUES ($1, $2, 'liqueur', $3) RETURNING id`,
      name, slug, parent,
    );
    made.push(row!.id);
    return row!.id;
  };
  const add = (categoryId: number, name: string) =>
    catalog.catalogBottleAction({
      expressionId: null,
      label: { brandId: String(brand), categoryId: String(categoryId), name },
      links: { distilleryLinks: "[]", mashbillLinks: "[]", finishLinks: "[]", ingredientLinks: "[]" },
      ttbIds: "",
      bottle: { acquisition: "purchase", status: "owned" },
    });

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    owner = await fx.mkUser();
    session.id = owner;
    [{ id: brand }] = await m.sql<{ id: number }>(`INSERT INTO brands (name, slug, owner_id) VALUES ('Brand', $1, $2) RETURNING id`, `b-${owner}-${Date.now()}`, owner) as [{ id: number }];
    const stamp = `${process.pid}${Date.now()}`;
    // Kinds come from the slug chain, so the test's categories hang under a parent slugged "liqueur" like the real ones.
    const [known] = await m.sql<{ id: number }>(`SELECT id FROM categories WHERE slug = 'liqueur'`);
    const parent = known?.id ?? (await category("Liqueur", "liqueur", null));
    absinthe = (await m.sql<{ id: number }>(`SELECT id FROM categories WHERE slug = 'absinthe'`))[0]?.id ?? (await category("Absinthe", "absinthe", parent));
    liqueur = await category(`Plain ${stamp}`, `plain-${stamp}`, parent);
    catalog = await import("@/app/(app)/bottles/add/actions");
    save = await import("../save");
  });
  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      for (const id of made.reverse()) await m.sql(`DELETE FROM categories WHERE id = $1`, id);
      await m.end();
    }
  });

  it("saves an absinthe with no flavor picked, and links Anise as an automatic flavor", async () => {
    const result = await add(absinthe, "Verte");
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    const rows = await m.sql<{ name: string; kind: string; is_manual: boolean }>(
      `SELECT i.name, i.kind, ei.is_manual FROM expression_ingredients ei JOIN ingredients i ON i.id = ei.ingredient_id WHERE ei.expression_id = $1`,
      result.expressionId,
    );
    expect(rows).toEqual([{ name: "Anise", kind: "flavor", is_manual: false }]);
  });

  it("still asks any other liqueur for a flavor, as an error on the field and not a crash", async () => {
    const result = await add(liqueur, "Plain");
    expect(result).toMatchObject({
      ok: false,
      error: "Add at least one flavor to this label.",
      labelErrors: { ingredientLinks: "Add at least one flavor to this label." },
    });
  });

  it("the label form's pre-check lets absinthe through but only when the list was sent", async () => {
    expect(await save.flavorMissing(absinthe, "liqueur", [])).toBe(false);
    expect(await save.flavorMissing(absinthe, "liqueur", undefined)).toBe(true);
    expect(await save.flavorMissing(liqueur, "liqueur", [])).toBe(true);
    expect(await save.flavorMissing(liqueur, "liqueur", [{ name: "Cherry", kind: "flavor" }])).toBe(false);
    expect(await save.flavorMissing(liqueur, "american", [])).toBe(false);
  });
});
