import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";
import { AdminRuleError } from "../errors";

vi.mock("server-only", () => ({}));

/** Opt-in: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("the Ingredients resource against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let stranger: number;
  let registry: typeof import("../registry");
  const res = () => registry.RESOURCES.ingredients;
  const add = (kind: string, name: string, family = "") => res().save({ kind, name, family }, null, owner);
  const idOf = async (name: string, kind = "") =>
    (await res().list(owner)).find((row) => row.cells.name === name && (kind === "" || row.cells.kind === kind))!.id;
  const link = async (ingredientId: number, isManual = true) => {
    const label = await fx.mkLabel(owner, cat.rum, `Label ${ingredientId} ${isManual}`);
    await m.sql(`INSERT INTO expression_ingredients (expression_id, ingredient_id, position, is_manual) VALUES ($1, $2, 0, $3)`, label, ingredientId, isManual);
    return label;
  };

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    owner = await fx.mkUser();
    stranger = await fx.mkUser();
    registry = await import("../registry");
  });
  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  it("adds an ingredient and lists it with its kind and no labels", async () => {
    expect((await add("rum_base", "Palm Sugar")).ok).toBe(true);
    const row = (await res().list(owner)).find((r) => r.cells.name === "Palm Sugar")!;
    expect(row.cells).toMatchObject({ kind: "Rum base", uses: 0 });
    expect(row.locked).toBeUndefined();
    expect(row.deleteBlockedBy).toBeUndefined();
  });

  it("refuses the same name and kind in any case, but allows it under another kind", async () => {
    const clash = await add("rum_base", "palm sugar");
    expect(clash).toMatchObject({ ok: false, fieldErrors: { name: "Already exists." } });
    expect((await add("flavor", "Palm Sugar")).ok).toBe(true);
  });

  it("refuses a built-in name and creates nothing", async () => {
    const result = await add("rum_base", "molasses");
    expect(result).toMatchObject({ ok: false, fieldErrors: { name: "Molasses is a built-in choice. Pick Molasses on the label itself instead." } });
    expect((await res().list(owner)).some((r) => r.cells.name === "molasses")).toBe(false);
  });

  it("requires a family for a distillate", async () => {
    expect(await add("distillate", "Muscat")).toMatchObject({ ok: false, fieldErrors: { family: "Choose a family." } });
    expect((await add("distillate", "Muscat", "grape")).ok).toBe(true);
  });

  it("changes the name on edit but ignores a different kind", async () => {
    const id = await idOf("Palm Sugar", "Rum base");
    expect((await res().save({ kind: "gin_base", name: "Palm Sugar Syrup", family: "" }, id, owner)).ok).toBe(true);
    const row = (await res().list(owner)).find((r) => r.id === id)!;
    expect(row.cells).toMatchObject({ name: "Palm Sugar Syrup", kind: "Rum base" });
  });

  it("will not let another account edit or delete it", async () => {
    const id = await idOf("Palm Sugar Syrup");
    expect(await res().save({ kind: "rum_base", name: "Stolen", family: "" }, id, stranger)).toMatchObject({ ok: false });
    await res().remove(id, stranger);
    expect((await res().list(owner)).some((r) => r.id === id)).toBe(true);
  });

  it("blocks delete while a label uses it, and allows it once unlinked", async () => {
    await add("rum_base", "Coconut Sugar");
    const id = await idOf("Coconut Sugar");
    const label = await link(id);
    expect((await res().list(owner)).find((r) => r.id === id)!.deleteBlockedBy).toBe("1 label uses this ingredient");
    await expect(res().remove(id, owner)).rejects.toThrow(AdminRuleError);
    await expect(res().remove(id, owner)).rejects.toThrow(/1 label uses this ingredient/);
    expect((await res().list(owner)).some((r) => r.id === id)).toBe(true);
    await m.sql(`DELETE FROM expression_ingredients WHERE expression_id = $1`, label);
    await res().remove(id, owner);
    expect((await res().list(owner)).some((r) => r.id === id)).toBe(false);
  });

  it("locks a row that any label links as style-derived, on the server", async () => {
    await add("botanical", "Wormwood");
    const id = await idOf("Wormwood");
    expect((await res().list(owner)).find((r) => r.id === id)!.locked).toBeUndefined();
    await link(id, false);
    expect((await res().list(owner)).find((r) => r.id === id)!.locked?.tag).toBe("Fixed");
    expect(await res().save({ kind: "botanical", name: "Wormwood Two", family: "" }, id, owner)).toMatchObject({ ok: false });
    await expect(res().remove(id, owner)).rejects.toThrow(AdminRuleError);
  });

  it("locks a preset-named row against rename, but lets it be deleted while no label uses it", async () => {
    await m.sql(`INSERT INTO ingredients (owner_id, kind, name) VALUES ($1, 'rum_base', 'Honey')`, owner);
    const id = await idOf("Honey");
    const row = (await res().list(owner)).find((r) => r.id === id)!;
    expect(row.locked).toMatchObject({ tag: "Built-in", allowDelete: true });
    expect(await res().save({ kind: "rum_base", name: "Honey Two", family: "" }, id, owner)).toMatchObject({ ok: false });
    await link(id);
    await expect(res().remove(id, owner)).rejects.toThrow(/1 label uses this ingredient/);
    await m.sql(`DELETE FROM expression_ingredients WHERE ingredient_id = $1`, id);
    await res().remove(id, owner);
    expect((await res().list(owner)).some((r) => r.id === id)).toBe(false);
  });
});
