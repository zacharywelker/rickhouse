import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, fixtures, settings, url, type Cat, type Db, type Fixtures } from "./fixtures";
import { DEFAULT_FIELD_FILTERS, parseFieldFilters, type FieldFilters } from "../field-filters";

type FieldModule = typeof import("../field");

describe.skipIf(!url)("the field picker's queries against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let field: FieldModule;
  let owner: number;
  let other: number;
  let cat: Cat;
  // Three whiskey bottles and one rum, with the states each filter looks at.
  let owned: number; // Alpha Rye, owned, sealed, never tasted
  let opened: number; // Beta Rye, open, tasted twice (rated 7 and 9)
  let killed: number; // Gamma Rye, killed
  let rum: number; // Delta Rum, owned (a child category of whiskey in this test)
  let picked: number; // Alpha Rye again, with a pick name
  let strangers: number;
  let rumLabel: number;
  let lonely: number; // a label with no bottle

  const filters = (over: Partial<FieldFilters> = {}): FieldFilters => ({ ...DEFAULT_FIELD_FILTERS, ...over });
  const names = async (over: Partial<FieldFilters> = {}) => (await field.fieldCandidates(owner, filters(over))).rows.map((r) => r.name);

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    field = await import("../field");
    owner = await fx.mkUser();
    other = await fx.mkUser();
    cat = await fx.mkCategories();
    await m.sql(`UPDATE categories SET parent_id = $1 WHERE id = $2`, cat.whiskey, cat.rum);

    const alpha = await fx.mkLabel(owner, cat.whiskey, "Alpha Rye", { proof: 100 });
    const beta = await fx.mkLabel(owner, cat.whiskey, "Beta Rye", { proof: 90 });
    const gamma = await fx.mkLabel(owner, cat.whiskey, "Gamma Rye", { proof: 110 });
    rumLabel = await fx.mkLabel(owner, cat.rum, "Delta Rum", { proof: 80 });
    lonely = await fx.mkLabel(owner, cat.whiskey, "Epsilon Label", { proof: 95 });
    owned = await fx.mkBottle(owner, alpha);
    opened = await fx.mkBottle(owner, beta);
    killed = await fx.mkBottle(owner, gamma);
    rum = await fx.mkBottle(owner, rumLabel);
    picked = await fx.mkBottle(owner, alpha, { pickName: "Store Pick" });
    await m.sql(`UPDATE bottles SET status = 'open', is_open = true WHERE id = $1`, opened);
    await m.sql(`UPDATE bottles SET status = 'killed' WHERE id = $1`, killed);
    for (const rating of [7, 9]) {
      await m.sql(`INSERT INTO tasting_notes (owner_id, expression_id, bottle_id, rating) VALUES ($1, $2, $3, $4)`, owner, beta, opened, rating);
    }

    // Someone else's bottle of a label with the same name must never show.
    const theirs = await fx.mkLabel(other, cat.whiskey, "Alpha Rye", { proof: 100 });
    strangers = await fx.mkBottle(other, theirs);
  });

  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  it("lists the shelf by default, by name then bottle id, with the facts the picker shows", async () => {
    const { rows, total } = await field.fieldCandidates(owner, filters());
    // killed is off the shelf; two Alpha Ryes (the plain one first by id, then the pick), Beta, Delta.
    expect(rows.map((r) => r.bottleId)).toEqual([owned, picked, opened, rum]);
    expect(total).toBe(4);
    const beta = rows.find((r) => r.bottleId === opened)!;
    expect(beta).toMatchObject({ category: expect.stringContaining("Test Bourbon"), categoryId: cat.whiskey, proof: 90, status: "open", isOpen: true, tastings: 2, avgRating: 8 });
    expect(rows.find((r) => r.bottleId === owned)).toMatchObject({ proof: 100, status: "owned", isOpen: false, tastings: 0, avgRating: null });
    expect(rows.every((r) => typeof r.expressionId === "number")).toBe(true);
  });

  it("never lists another owner's bottle, nor counts it", async () => {
    const all = await field.fieldCandidates(owner, filters({ statuses: [] }));
    expect(all.rows.map((r) => r.bottleId)).not.toContain(strangers);
    expect(all.total).toBe(5);
    const theirs = await field.fieldCandidates(other, filters());
    expect(theirs.rows.map((r) => r.bottleId)).toEqual([strangers]);
    expect((await field.labelCandidates(other, "Delta")).length).toBe(0);
  });

  it("filters by status; an empty list means every status", async () => {
    expect((await field.fieldCandidates(owner, filters({ statuses: ["killed"] }))).rows.map((r) => r.bottleId)).toEqual([killed]);
    expect((await field.fieldCandidates(owner, filters({ statuses: ["open"] }))).rows.map((r) => r.bottleId)).toEqual([opened]);
    expect((await field.fieldCandidates(owner, filters({ statuses: [] }))).total).toBe(5);
  });

  it("filters opened and sealed", async () => {
    expect((await field.fieldCandidates(owner, filters({ opened: "open" }))).rows.map((r) => r.bottleId)).toEqual([opened]);
    expect((await field.fieldCandidates(owner, filters({ opened: "sealed" }))).rows.map((r) => r.bottleId)).toEqual([owned, picked, rum]);
  });

  it("filters tasted and untasted", async () => {
    expect((await field.fieldCandidates(owner, filters({ tasted: "tasted" }))).rows.map((r) => r.bottleId)).toEqual([opened]);
    expect((await field.fieldCandidates(owner, filters({ tasted: "untasted" }))).rows.map((r) => r.bottleId)).toEqual([owned, picked, rum]);
  });

  it("filters by category, a parent including its children", async () => {
    expect((await field.fieldCandidates(owner, filters({ categoryIds: [cat.rum] }))).rows.map((r) => r.bottleId)).toEqual([rum]);
    expect((await field.fieldCandidates(owner, filters({ categoryIds: [cat.whiskey] }))).rows.map((r) => r.bottleId)).toEqual([owned, picked, opened, rum]);
  });

  it("searches by every word, on the brand, the label and the pick, and treats % and _ as letters", async () => {
    expect(await names({ q: "alpha" })).toHaveLength(2);
    expect(await names({ q: "rye store" })).toHaveLength(1);
    expect(await names({ q: "ALPHA PICK" })).toHaveLength(1);
    expect(await names({ q: "B Delta" })).toHaveLength(1); // the brand is "B <label>"
    expect(await names({ q: "zzz" })).toEqual([]);
    expect(await names({ q: "%" })).toEqual([]);
    expect(await names({ q: "_lpha" })).toEqual([]);
  });

  it("combines filters", async () => {
    expect((await field.fieldCandidates(owner, filters({ q: "rye", tasted: "untasted", opened: "sealed" }))).rows.map((r) => r.bottleId)).toEqual([owned, picked]);
  });

  it("limits the rows and still reports the whole match count", async () => {
    const page = await field.fieldCandidates(owner, filters(), 2);
    expect(page.rows.map((r) => r.bottleId)).toEqual([owned, picked]);
    expect(page.total).toBe(4);
    expect(await field.fieldCandidates(owner, filters({ q: "zzz" }), 2)).toEqual({ rows: [], total: 0 });
  });

  it("names a bottle exactly as a tournament made from it does", async () => {
    const { rows } = await field.fieldCandidates(owner, filters({ statuses: [] }));
    const made = (await m.life.createTournament(owner, settings(), rows.map((r) => ({ bottleId: r.bottleId })))) as { ok: true; id: number };
    expect(made.ok).toBe(true);
    const view = (await m.queries.getTournament(owner, made.id))!;
    const snapshot = new Map(view.entries.map((e) => [e.bottleId, e.name]));
    for (const row of rows) expect(snapshot.get(row.bottleId)).toBe(row.name);
    expect(rows.find((r) => r.bottleId === picked)!.name).toContain("Store Pick");
  });

  it("names a bottle with a barrel number, a batch and a release as the tournament does", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Zulu Barrel", { proof: 120 });
    const barrel = await fx.mkBottle(owner, label);
    const batch = await fx.mkBottle(owner, label);
    await m.sql(`UPDATE bottles SET barrel_number = '42' WHERE id = $1`, barrel);
    await m.sql(`UPDATE bottles SET batch = 'B7' WHERE id = $1`, batch);
    const { rows } = await field.fieldCandidates(owner, filters({ q: "zulu" }));
    const made = (await m.life.createTournament(owner, settings(), rows.map((r) => ({ bottleId: r.bottleId })))) as { ok: true; id: number };
    const view = (await m.queries.getTournament(owner, made.id))!;
    const snapshot = new Map(view.entries.map((e) => [e.bottleId, e.name]));
    expect(rows.map((r) => r.name)).toEqual(expect.arrayContaining([expect.stringContaining("(barrel 42)"), expect.stringContaining("(batch B7)")]));
    for (const row of rows) expect(snapshot.get(row.bottleId)).toBe(row.name);
  });

  it("finds the owner's labels by text, with a label that has no bottle", async () => {
    const found = await field.labelCandidates(owner, "epsilon");
    expect(found).toEqual([{ expressionId: lonely, name: expect.stringContaining("Epsilon Label"), category: expect.stringContaining("Test Bourbon"), proof: 95 }]);
    expect((await field.labelCandidates(owner, "")).length).toBe(6);
    expect((await field.labelCandidates(owner, "", 2)).length).toBe(2);
    expect((await field.labelCandidates(owner, "delta"))[0]!.expressionId).toBe(rumLabel);
    expect(await field.labelCandidates(owner, "zzz")).toEqual([]);
  });

  it("makes a label-only entry named as the tournament names it", async () => {
    const [label] = await field.labelCandidates(owner, "epsilon");
    const made = (await m.life.createTournament(owner, settings(), [{ expressionId: label!.expressionId }])) as { ok: true; id: number };
    const view = (await m.queries.getTournament(owner, made.id))!;
    expect(view.entries[0]!.name).toBe(label!.name);
  });

  it("parses the filters the way the query uses them", async () => {
    expect((await field.fieldCandidates(owner, parseFieldFilters({ q: "alpha", statuses: "all" }))).total).toBe(2);
  });
});
