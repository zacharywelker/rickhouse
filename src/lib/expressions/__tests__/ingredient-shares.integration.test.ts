import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";

vi.mock("server-only", () => ({}));

/** Opt-in: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("ingredient shares against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let owner: number;
  let cognac: number;
  let madeCognac = false;
  let save: typeof import("../save");
  let dbModule: typeof import("@/db");

  const replace = (label: number, choices: unknown[]) =>
    dbModule.db.transaction((tx) => save.replaceIngredients(tx, owner, label, save.parseIngredientLinks(JSON.stringify(choices)) ?? []));
  const sharesOf = async (label: number) =>
    Object.fromEntries((await m.sql<{ name: string; share_pct: string | null }>(
      `SELECT i.name, ei.share_pct FROM expression_ingredients ei JOIN ingredients i ON i.id = ei.ingredient_id WHERE ei.expression_id = $1`, label,
    )).map((r) => [r.name, r.share_pct === null ? null : Number(r.share_pct)]));
  const grape = (name: string, share?: number | null) => ({ name, family: "grape", kind: "distillate", ...(share !== undefined ? { share } : {}) });

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    owner = await fx.mkUser();
    const [found] = await m.sql<{ id: number }>(`SELECT id FROM categories WHERE slug = 'cognac'`);
    if (found) cognac = found.id;
    else {
      cognac = (await m.sql<{ id: number }>(`INSERT INTO categories (name, slug, field_group) VALUES ('Cognac', 'cognac', 'brandy') RETURNING id`))[0]!.id;
      madeCognac = true;
    }
    save = await import("../save");
    dbModule = await import("@/db");
  });

  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      if (madeCognac) await m.sql(`DELETE FROM categories WHERE id = $1`, cognac);
      await m.end();
    }
  });

  it("saves each grape's share", async () => {
    const label = await fx.mkLabel(owner, cognac, "Shares One");
    await replace(label, [grape("Ugni Blanc", 90), grape("Colombard", 10)]);
    expect(await sharesOf(label)).toEqual({ "Ugni Blanc": 90, Colombard: 10 });
  });

  it("keeps a saved share when a caller sends names only (the phone)", async () => {
    const label = await fx.mkLabel(owner, cognac, "Shares Two");
    await replace(label, [grape("Ugni Blanc", 90), grape("Colombard", 10)]);
    await replace(label, [grape("Ugni Blanc"), grape("Colombard"), grape("Folle Blanche")]);
    expect(await sharesOf(label)).toEqual({ "Ugni Blanc": 90, Colombard: 10, "Folle Blanche": null });
  });

  it("clears a share that is sent as none, and a removed row leaves no share behind", async () => {
    const label = await fx.mkLabel(owner, cognac, "Shares Three");
    await replace(label, [grape("Ugni Blanc", 90), grape("Colombard", 10)]);
    await replace(label, [grape("Ugni Blanc", null)]);
    expect(await sharesOf(label)).toEqual({ "Ugni Blanc": null });
  });

  it("refuses a share outside 0 to 100 at the database", async () => {
    const label = await fx.mkLabel(owner, cognac, "Shares Four");
    await replace(label, [grape("Ugni Blanc", 50)]);
    await expect(m.sql(`UPDATE expression_ingredients SET share_pct = 150 WHERE expression_id = $1`, label)).rejects.toThrow(/share_check/);
  });

  it("saves a Calvados's fruit as its rows, whatever name a phone sends, and keeps a saved share", async () => {
    const [calvados] = await m.sql<{ id: number }>(`SELECT id FROM categories WHERE slug = 'calvados'`);
    if (!calvados) return;
    const label = await fx.mkLabel(owner, calvados.id, "Phone Calvados");
    const fruit = (name: string, family: string, share?: number | null) => ({ name, family, kind: "distillate", ...(share !== undefined ? { share } : {}) });
    await replace(label, [fruit("Pears", "pear", 30), fruit("Sweet apples", "apple", 70)]);
    await replace(label, [fruit("Pear", "pear"), fruit("Sweet Apple", "apple"), fruit("Cider Apple", "apple")]);
    expect(await sharesOf(label)).toEqual({ Pears: 30, "Sweet apples": 70, "Apples (type not stated)": null });
  });

  it("migration 0059 turns a Calvados label's apple and pear tags into the two unstated rows, and touches no other label", async () => {
    const [calvados] = await m.sql<{ id: number }>(`SELECT id FROM categories WHERE slug = 'calvados'`);
    const [brandy] = await m.sql<{ id: number }>(`SELECT id FROM categories WHERE slug = 'apple'`);
    if (!calvados || !brandy) return; // a database without the seeded tree cannot show it
    const calvadosLabel = await fx.mkLabel(owner, calvados.id, "Conv Calvados");
    const [eau] = await m.sql<{ id: number }>(`SELECT id FROM categories WHERE slug = 'eau-de-vie'`);
    const brandyLabel = await fx.mkLabel(owner, brandy.id, "Conv Apple Brandy");
    const tag = async (name: string, family: string) =>
      (await m.sql<{ id: number }>(`INSERT INTO ingredients (owner_id, kind, name, family) VALUES ($1, 'distillate', $2, $3) ON CONFLICT (owner_id, kind, name) DO UPDATE SET family = EXCLUDED.family RETURNING id`, owner, name, family))[0]!.id;
    const [apple, cider, pear] = [await tag("Apple", "apple"), await tag("Cider Apple", "apple"), await tag("Pear", "pear")];
    for (const [label, ingredient] of [[calvadosLabel, apple], [calvadosLabel, cider], [calvadosLabel, pear], [brandyLabel, apple]] as const) {
      await m.sql(`INSERT INTO expression_ingredients (expression_id, ingredient_id) VALUES ($1, $2)`, label, ingredient);
    }
    const statements = readFileSync("drizzle/0059_ingredient_shares.sql", "utf8").split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean).slice(1);
    for (const statement of statements) await m.sql(statement);
    expect(Object.keys(await sharesOf(calvadosLabel)).sort()).toEqual(["Apples (type not stated)", "Pears"]);
    expect(Object.keys(await sharesOf(brandyLabel))).toEqual(["Apple"]);
    for (const statement of statements) await m.sql(statement); // idempotent
    expect(Object.keys(await sharesOf(calvadosLabel)).sort()).toEqual(["Apples (type not stated)", "Pears"]);
    // An eau de vie that uses the converted "Pears" row (a hand-made link) is not a Calvados label: the rollback leaves it alone.
    const eauLabel = eau ? await fx.mkLabel(owner, eau.id, "Conv Eau de Vie") : null;
    if (eauLabel) await m.sql(`INSERT INTO expression_ingredients (expression_id, ingredient_id) SELECT $1, id FROM ingredients WHERE owner_id = $2 AND name = 'Pears'`, eauLabel, owner);
    // The rollback puts the plain tags back.
    const down = readFileSync("drizzle/rollback/0059_ingredient_shares_down.sql", "utf8").split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean).slice(0, 3);
    for (const statement of down) await m.sql(statement);
    expect(Object.keys(await sharesOf(calvadosLabel)).sort()).toEqual(["Apple", "Pear"]);
    if (eauLabel) expect(Object.keys(await sharesOf(eauLabel))).toEqual(["Pears"]);
  });
});
