import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";
import { labelPatchBody } from "../save";
import type { SheetLabel } from "../sheet";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** Opt-in, like the other integration tests: a throwaway migrated database. */
describe.skipIf(!url)("the list cells save, against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let rows: typeof import("../rows");
  let loadLinks: typeof import("@/lib/expressions/form-data").loadLinks;
  let toLists: typeof import("../links").linksFromLoaded;

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    owner = await fx.mkUser();
    rows = await import("../rows");
    loadLinks = (await import("@/lib/expressions/form-data")).loadLinks;
    toLists = (await import("../links")).linksFromLoaded;
  });
  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  const one = async <T extends Record<string, unknown>>(q: string, ...p: unknown[]) => (await m.sql<T>(q, ...p))[0]!;
  const rowsOf = (q: string, ...p: unknown[]) => m.sql<Record<string, unknown>>(q, ...p);
  async function distillery(name: string) {
    return (await m.sql<{ id: number }>(`INSERT INTO distilleries (owner_id, name, slug) VALUES ($1, $2::text, $3::text) RETURNING id`, owner, `${name} ${Math.random()}`, `d-${Math.random()}`))[0]!.id;
  }
  async function mashbill(name: string) {
    return (await m.sql<{ id: number }>(`INSERT INTO mashbills (owner_id, name) VALUES ($1, $2::text) RETURNING id`, owner, `${name} ${Math.random()}`))[0]!.id;
  }
  async function finish(name: string) {
    return (await m.sql<{ id: number }>(`INSERT INTO finishes (owner_id, name, slug) VALUES ($1, $2::text, $3::text) RETURNING id`, owner, `${name} ${Math.random()}`, `f-${Math.random()}`))[0]!.id;
  }
  const L = (id: number, label: string, extra: Record<string, unknown> = {}) => ({ id, label, amount: "", ...extra });
  const asLabel = (id: number) => ({ id, links: { distilleries: [], mashbills: [], finishes: [], ingredients: [] } }) as unknown as SheetLabel;
  const save = async (labelId: number, cells: Record<string, string>) => {
    const loaded = toLists(await loadLinks(labelId));
    return rows.patchLabelRow(owner, labelId, labelPatchBody(cells, { label: asLabel(labelId), loaded }));
  };

  it("saves distilleries with their share, order and inferred tick, and mashbills with the distillery that made them", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Links One");
    const [a, b, mb] = [await distillery("Alpha"), await distillery("Beta"), await mashbill("Rye")];
    expect(await save(label, { distilleries: JSON.stringify([L(b, "Beta", { amount: "40", inferred: true }), L(a, "Alpha", { amount: "60" })]) })).toEqual({ ok: true });
    expect(await rowsOf(`SELECT distillery_id, share_pct::float AS share, is_inferred FROM expression_distilleries WHERE expression_id = $1 ORDER BY position`, label)).toEqual([
      { distillery_id: b, share: 40, is_inferred: true },
      { distillery_id: a, share: 60, is_inferred: false },
    ]);
    expect(await save(label, { mashbills: JSON.stringify([L(mb, "Rye", { amount: "100", distilleryId: a })]) })).toEqual({ ok: true });
    expect(await one(`SELECT distillery_id FROM expression_mashbills WHERE expression_id = $1`, label)).toEqual({ distillery_id: a });
    // The distilleries sent with the mashbill edit were the ones already there.
    expect((await rowsOf(`SELECT 1 FROM expression_distilleries WHERE expression_id = $1`, label)).length).toBe(2);
  });

  it("saves finishes with their pairs, and an edit of another list does not drop them", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Links Two");
    const [mb, port, sherry, a] = [await mashbill("Corn"), await finish("Port"), await finish("Sherry"), await distillery("Gamma")];
    const finishes = [
      L(port, "Port", { amount: "6", share: "60", mashbills: [{ id: mb, share: "60" }] }),
      L(sherry, "Sherry", { amount: "3", share: "40", mashbills: [{ id: mb, share: "40" }] }),
    ];
    expect(await save(label, { mashbills: JSON.stringify([L(mb, "Corn", { amount: "100" })]), finishes: JSON.stringify(finishes) })).toEqual({ ok: true });
    const pairs = () => rowsOf(`SELECT finish_id, share_pct::float AS share FROM expression_finish_mashbills WHERE expression_id = $1 ORDER BY position`, label);
    expect(await pairs()).toEqual([{ finish_id: port, share: 60 }, { finish_id: sherry, share: 40 }]);
    // Only the distilleries are edited: the pairs are sent as the picker read them, and survive.
    expect(await save(label, { distilleries: JSON.stringify([L(a, "Gamma")]) })).toEqual({ ok: true });
    expect(await pairs()).toEqual([{ finish_id: port, share: 60 }, { finish_id: sherry, share: 40 }]);
  });

  it("refuses finish shares that do not add up, with the form's message, and saves nothing", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Links Three");
    const [mb, port] = [await mashbill("Barley"), await finish("Tawny")];
    const bad = await save(label, { mashbills: JSON.stringify([L(mb, "Barley", { amount: "100" })]), finishes: JSON.stringify([L(port, "Tawny", { share: "70", mashbills: [{ id: mb, share: "70" }] })]) });
    expect(bad).toMatchObject({ ok: false, kind: "invalid", error: expect.stringMatching(/Shares add up to 70%/) });
    expect((await rowsOf(`SELECT 1 FROM expression_mashbills WHERE expression_id = $1`, label)).length).toBe(0);
  });

  it("saves ingredients of every kind with whether each was chosen by hand", async () => {
    const liqueur = (await m.sql<{ id: number }>(`INSERT INTO categories (name, slug, field_group) VALUES ('Links Liqueur', 'links-liqueur-${Math.random()}', 'liqueur') RETURNING id`))[0]!.id;
    const label = await fx.mkLabel(owner, liqueur, "Links Four");
    const out = await save(label, { ingredients: JSON.stringify([{ name: "Cane spirit", family: null, kind: "liqueur_base", isManual: true }, { name: "Vanilla", family: null, kind: "flavor", isManual: false }]) });
    expect(out).toEqual({ ok: true });
    expect(await rowsOf(`SELECT i.name, i.kind, ei.is_manual FROM expression_ingredients ei JOIN ingredients i ON i.id = ei.ingredient_id WHERE ei.expression_id = $1 ORDER BY ei.position`, label)).toEqual([
      { name: "Cane spirit", kind: "liqueur_base", is_manual: true },
      { name: "Vanilla", kind: "flavor", is_manual: false },
    ]);
    await m.sql(`DELETE FROM expressions WHERE id = $1`, label);
    await m.sql(`DELETE FROM categories WHERE id = $1`, liqueur);
  });

  it("brings a Scotch region along with the link, and remembers an amaro's origin as typed only when it was", async () => {
    const scotch = await fx.mkLabel(owner, cat.whiskey, "Links Five");
    expect(await rows.patchLabelRow(owner, scotch, labelPatchBody({ regions: "Islay, Speyside" }))).toEqual({ ok: true }); // as a link would have staged it
    // (regions only apply to a Scotch category; this label is not one, so they are not kept: the form drops them too)
    const amaro = (await m.sql<{ id: number }>(`INSERT INTO categories (name, slug, field_group) VALUES ('Links Amaro', 'links-amaro-${Math.random()}', 'amaro') RETURNING id`))[0]!.id;
    const label = await fx.mkLabel(owner, amaro, "Links Six");
    expect(await rows.patchLabelRow(owner, label, labelPatchBody({ originCountryLinked: "Italy" }))).toEqual({ ok: true });
    expect(await one(`SELECT origin_country, origin_country_manual FROM expressions WHERE id = $1`, label)).toEqual({ origin_country: "Italy", origin_country_manual: false });
    expect(await rows.patchLabelRow(owner, label, { originCountry: "Spain", originCountryManual: true })).toEqual({ ok: true });
    expect(await one(`SELECT origin_country, origin_country_manual FROM expressions WHERE id = $1`, label)).toEqual({ origin_country: "Spain", origin_country_manual: true });
    await m.sql(`DELETE FROM expressions WHERE id = $1`, label);
    await m.sql(`DELETE FROM categories WHERE id = $1`, amaro);
  });

  it("a new row takes its lists in the facts", async () => {
    const [a, mb] = [await distillery("Delta"), await mashbill("Wheat")];
    const out = await rows.createRow(owner, {
      brand: { name: "Links Brand" },
      label: { name: "Links Seven", categoryId: cat.whiskey, facts: { distilleryLinks: JSON.stringify([{ id: a, amount: "" }]), mashbillLinks: JSON.stringify([{ id: mb, amount: "100" }]) } },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect((await rowsOf(`SELECT 1 FROM expression_distilleries WHERE expression_id = $1`, out.labelId)).length).toBe(1);
    expect((await rowsOf(`SELECT 1 FROM expression_mashbills WHERE expression_id = $1`, out.labelId)).length).toBe(1);
  });
});
