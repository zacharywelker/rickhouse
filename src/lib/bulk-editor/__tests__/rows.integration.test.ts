import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** Opt-in, like the tournament integration tests: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("bulk editor rows against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let stranger: number;
  let rows: typeof import("../rows");

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    owner = await fx.mkUser();
    stranger = await fx.mkUser();
    rows = await import("../rows");
  });

  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  const count = async (table: string, where: string, ...params: unknown[]) =>
    Number((await m.sql<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`, ...params))[0]!.n);
  const one = async <T extends Record<string, unknown>>(query: string, ...params: unknown[]) => (await m.sql<T>(query, ...params))[0]!;
  const ids = async (user: number, brand: string, label: string) =>
    one<{ brand: number; label: number }>(
      `SELECT b.id AS brand, e.id AS label FROM brands b JOIN expressions e ON e.brand_id = b.id WHERE b.owner_id = $1 AND b.name = $2 AND e.name = $3`,
      user, brand, label,
    );

  describe("createRow", () => {
    it("creates the brand, the label and the bottle in one request", async () => {
      const out = await rows.createRow(owner, {
        brand: { name: "Four Roses" },
        label: { name: "Single Barrel", categoryId: cat.whiskey, facts: { proof: "100" } },
        bottle: { pricePaid: "47" },
      });
      expect(out).toMatchObject({ ok: true, created: { brand: true, label: true, bottle: true } });
      if (!out.ok) return;
      expect(Number((await one<{ proof: string }>(`SELECT proof FROM expressions WHERE id = $1`, out.labelId)).proof)).toBe(100);
      const bottle = await one<{ expression_id: number; owner_id: number; price_paid: string; status: string; acquisition: string }>(
        `SELECT expression_id, owner_id, price_paid, status, acquisition FROM bottles WHERE id = $1`, out.bottleId,
      );
      expect(bottle).toMatchObject({ expression_id: out.labelId, owner_id: owner, status: "owned", acquisition: "purchase" });
      expect(Number(bottle.price_paid)).toBe(47);
    });

    it("makes a label without a bottle when none is sent", async () => {
      const out = await rows.createRow(owner, { brand: { name: "Label Only Brand" }, label: { name: "Lonely", categoryId: cat.rum } });
      expect(out).toMatchObject({ ok: true, bottleId: null, created: { brand: true, label: true, bottle: false } });
    });

    it("puts two simultaneous saves of the same new brand and label on one label", async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          rows.createRow(owner, {
            // Cases differ on purpose: the brand and label match without regard to case.
            brand: { name: i % 2 ? "race brand" : "Race Brand" },
            label: { name: i % 2 ? "RACE LABEL" : "Race Label", categoryId: cat.whiskey },
            bottle: {},
          }),
        ),
      );
      expect(results.map((r) => r.ok)).toEqual(Array(6).fill(true));
      expect(await count("brands", `owner_id = $1 AND lower(name) = 'race brand'`, owner)).toBe(1);
      const { label } = await ids(owner, "Race Brand", "Race Label");
      expect(await count("expressions", `owner_id = $1 AND lower(name) = 'race label'`, owner)).toBe(1);
      expect(await count("bottles", `expression_id = $1`, label)).toBe(6);
      const made = results.flatMap((r) => (r.ok ? [r.created] : []));
      expect(made.filter((c) => c.brand)).toHaveLength(1);
      expect(made.filter((c) => c.label)).toHaveLength(1);
    });

    it("puts two simultaneous saves of the same new label under a brand that already exists on one label", async () => {
      // With the brand already there nothing makes the saves wait for each other until the label's own unique key does.
      expect(await rows.createRow(owner, { brand: { name: "Existing Race Brand" }, label: { name: "Seed", categoryId: cat.whiskey } })).toMatchObject({ ok: true });
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          rows.createRow(owner, { brand: { name: "Existing Race Brand" }, label: { name: "New Race Label", categoryId: cat.whiskey }, bottle: {} }),
        ),
      );
      expect(results.map((r) => r.ok)).toEqual(Array(6).fill(true));
      const { label } = await ids(owner, "Existing Race Brand", "New Race Label");
      expect(await count("expressions", `owner_id = $1 AND name = 'New Race Label'`, owner)).toBe(1);
      expect(await count("bottles", `expression_id = $1`, label)).toBe(6);
      expect(results.flatMap((r) => (r.ok ? [r.created.label] : [])).filter(Boolean)).toHaveLength(1);
    });

    it("uses the label that already exists and ignores the facts sent for it", async () => {
      const first = await rows.createRow(owner, { brand: { name: "Dup Brand" }, label: { name: "Dup Label", categoryId: cat.whiskey, facts: { proof: "90" } } });
      expect(first.ok).toBe(true);
      const second = await rows.createRow(owner, { brand: { name: "dup brand" }, label: { name: "dup label", categoryId: cat.whiskey, facts: { proof: "123" } }, bottle: {} });
      expect(second).toMatchObject({ ok: true, created: { brand: false, label: false, bottle: true }, labelFactsIgnored: true });
      const { label } = await ids(owner, "Dup Brand", "Dup Label");
      expect(Number((await one<{ proof: string }>(`SELECT proof FROM expressions WHERE id = $1`, label)).proof)).toBe(90);
    });

    it("refuses label facts for a label that is chosen by id, and a label under another brand", async () => {
      const a = await fx.mkLabel(owner, cat.whiskey, "Chosen A");
      const b = await fx.mkLabel(owner, cat.whiskey, "Chosen B");
      const brandA = (await one<{ brand_id: number }>(`SELECT brand_id FROM expressions WHERE id = $1`, a)).brand_id;
      const withFacts = await rows.createRow(owner, { brand: { id: brandA }, label: { id: a, facts: { proof: "1" } } } as never);
      expect(withFacts).toMatchObject({ ok: false, kind: "invalid" });
      const wrongBrand = await rows.createRow(owner, { brand: { id: brandA }, label: { id: b } });
      expect(wrongBrand).toMatchObject({ ok: false, kind: "invalid" });
    });

    it("refuses another account's brand, label and store, and leaves nothing behind", async () => {
      const theirLabel = await fx.mkLabel(stranger, cat.whiskey, "Theirs");
      const theirBrand = (await one<{ brand_id: number }>(`SELECT brand_id FROM expressions WHERE id = $1`, theirLabel)).brand_id;
      expect(await rows.createRow(owner, { brand: { id: theirBrand }, label: { id: theirLabel } })).toMatchObject({ ok: false });
      expect(await rows.createRow(owner, { brand: { id: theirBrand }, label: { name: "Sneaky", categoryId: cat.whiskey } })).toMatchObject({ ok: false });
      const [store] = await m.sql<{ id: number }>(`INSERT INTO stores (name, slug, owner_id) VALUES ('Theirs Store', $1, $2) RETURNING id`, `s-${stranger}-${Date.now()}`, stranger);
      const theirStore = await rows.createRow(owner, { brand: { name: "Store Test Brand" }, label: { name: "Store Test", categoryId: cat.whiskey }, bottle: { storeId: store!.id } });
      expect(theirStore).toMatchObject({ ok: false, kind: "invalid", fieldErrors: { storeId: expect.any(String) } });
      // The brand and label created before the bottle failed are rolled back with it.
      expect(await count("brands", `owner_id = $1 AND name = 'Store Test Brand'`, owner)).toBe(0);
    });

    it("reports a bad value on its own field and creates nothing", async () => {
      const bad = await rows.createRow(owner, { brand: { name: "Bad Facts Brand" }, label: { name: "Bad Facts", categoryId: cat.whiskey, facts: { proof: "abc" } } });
      expect(bad).toMatchObject({ ok: false, kind: "invalid", fieldErrors: { proof: expect.any(String) } });
      expect(await count("brands", `owner_id = $1 AND name = 'Bad Facts Brand'`, owner)).toBe(0);
      const noName = await rows.createRow(owner, { brand: { name: "No Name Brand" }, label: { name: "  ", categoryId: cat.whiskey } });
      expect(noName).toMatchObject({ ok: false, kind: "invalid", fieldErrors: { label: expect.any(String) } });
    });
  });

  describe("patchBottleRow", () => {
    it("changes only the fields sent, so a stale sheet cannot undo edits made elsewhere", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Patch Bottle");
      const bottle = await fx.mkBottle(owner, label);
      await m.sql(`UPDATE bottles SET notes = 'written on the phone' WHERE id = $1`, bottle);
      expect(await rows.patchBottleRow(owner, bottle, { pricePaid: "50" })).toMatchObject({ ok: true });
      const after = await one<{ notes: string; price_paid: string }>(`SELECT notes, price_paid FROM bottles WHERE id = $1`, bottle);
      expect(after.notes).toBe("written on the phone");
      expect(Number(after.price_paid)).toBe(50);
    });

    it("refuses label fields, so a bottle request cannot change a label", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Locked Label");
      const bottle = await fx.mkBottle(owner, label);
      for (const body of [{ name: "Renamed" }, { categoryId: cat.rum }, { brandId: 1 }, { msrp: "5" }, { brand: "X" }]) {
        expect(await rows.patchBottleRow(owner, bottle, body)).toMatchObject({ ok: false, kind: "invalid" });
      }
      expect((await one<{ name: string }>(`SELECT name FROM expressions WHERE id = $1`, label)).name).toBe("Locked Label");
    });

    it("moves a bottle to another label and takes its tastings along", async () => {
      const from = await fx.mkLabel(owner, cat.whiskey, "Move From");
      const to = await fx.mkLabel(owner, cat.whiskey, "Move To");
      const bottle = await fx.mkBottle(owner, from);
      const [tasting] = await m.sql<{ id: number }>(`INSERT INTO tasting_notes (owner_id, expression_id, bottle_id) VALUES ($1, $2, $3) RETURNING id`, owner, from, bottle);
      expect(await rows.patchBottleRow(owner, bottle, { expressionId: to })).toMatchObject({ ok: true });
      expect((await one<{ expression_id: number }>(`SELECT expression_id FROM bottles WHERE id = $1`, bottle)).expression_id).toBe(to);
      expect((await one<{ expression_id: number }>(`SELECT expression_id FROM tasting_notes WHERE id = $1`, tasting!.id)).expression_id).toBe(to);
    });

    it("treats an id that is not a whole number as gone", async () => {
      for (const id of [0, -1, 1.5, Number.NaN]) {
        expect(await rows.patchBottleRow(owner, id, { pricePaid: "1" })).toMatchObject({ ok: false, kind: "gone" });
        expect(await rows.patchLabelRow(owner, id, { proof: "1" })).toMatchObject({ ok: false, kind: "gone" });
      }
    });

    it("treats another account's bottle as gone, and refuses their label and store", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Mine Only");
      const mine = await fx.mkBottle(owner, label);
      const theirLabel = await fx.mkLabel(stranger, cat.whiskey, "Theirs Only");
      const theirs = await fx.mkBottle(stranger, theirLabel);
      expect(await rows.patchBottleRow(owner, theirs, { pricePaid: "1" })).toMatchObject({ ok: false, kind: "gone" });
      expect(await rows.patchBottleRow(owner, mine, { expressionId: theirLabel })).toMatchObject({ ok: false, kind: "invalid" });
      const [store] = await m.sql<{ id: number }>(`INSERT INTO stores (name, slug, owner_id) VALUES ('Theirs Store 2', $1, $2) RETURNING id`, `s2-${stranger}-${Date.now()}`, stranger);
      expect(await rows.patchBottleRow(owner, mine, { storeId: store!.id })).toMatchObject({ ok: false, kind: "invalid" });
      expect((await one<{ expression_id: number }>(`SELECT expression_id FROM bottles WHERE id = $1`, mine)).expression_id).toBe(label);
    });
  });

  describe("patchLabelRow", () => {
    it("changes only the fields sent", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Patch Label");
      await m.sql(`UPDATE expressions SET description = 'written elsewhere' WHERE id = $1`, label);
      expect(await rows.patchLabelRow(owner, label, { proof: "95" })).toMatchObject({ ok: true });
      const after = await one<{ description: string; proof: string }>(`SELECT description, proof FROM expressions WHERE id = $1`, label);
      expect(after.description).toBe("written elsewhere");
      expect(Number(after.proof)).toBe(95);
    });

    it("renames a label to fix a misspelling, and moves it to another brand by name", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Mispelled");
      expect(await rows.patchLabelRow(owner, label, { name: "Misspelled" })).toMatchObject({ ok: true });
      expect((await one<{ name: string }>(`SELECT name FROM expressions WHERE id = $1`, label)).name).toBe("Misspelled");
      expect(await rows.patchLabelRow(owner, label, { brand: "Brand Made By A Move" })).toMatchObject({ ok: true });
      expect(await count("brands", `owner_id = $1 AND name = 'Brand Made By A Move'`, owner)).toBe(1);
    });

    it("stops a rename that collides with another label and says which", async () => {
      const a = await fx.mkLabel(owner, cat.whiskey, "Collide A");
      const b = await fx.mkLabel(owner, cat.whiskey, "Collide B");
      await m.sql(`UPDATE expressions SET brand_id = (SELECT brand_id FROM expressions WHERE id = $1) WHERE id = $2`, a, b);
      expect(await rows.patchLabelRow(owner, b, { name: "collide a" })).toMatchObject({ ok: false, kind: "name_taken", existing: { id: a } });
    });

    it("treats another account's label as gone and refuses fields it does not know", async () => {
      const theirs = await fx.mkLabel(stranger, cat.whiskey, "Not Yours");
      expect(await rows.patchLabelRow(owner, theirs, { proof: "1" })).toMatchObject({ ok: false, kind: "gone" });
      const mine = await fx.mkLabel(owner, cat.whiskey, "Mine Label");
      expect(await rows.patchLabelRow(owner, mine, { ownerId: stranger })).toMatchObject({ ok: false, kind: "invalid" });
    });

    it("keeps stored facts when the category changes (nothing is cleared)", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Category Switch");
      await m.sql(`UPDATE expressions SET is_bottled_in_bond = true WHERE id = $1`, label);
      expect(await rows.patchLabelRow(owner, label, { categoryId: cat.rum })).toMatchObject({ ok: true });
      expect((await one<{ is_bottled_in_bond: boolean; category_id: number }>(`SELECT is_bottled_in_bond, category_id FROM expressions WHERE id = $1`, label))).toEqual({
        is_bottled_in_bond: true,
        category_id: cat.rum,
      });
    });
  });

  describe("deleteImpact", () => {
    it("counts what a delete takes with it, and only the caller's", async () => {
      const a = await fx.mkLabel(owner, cat.whiskey, "Impact A");
      const b = await fx.mkLabel(owner, cat.whiskey, "Impact B");
      await fx.mkBottle(owner, a);
      await fx.mkBottle(owner, a);
      const lone = await fx.mkBottle(owner, b);
      const theirLabel = await fx.mkLabel(stranger, cat.whiskey, "Impact Theirs");
      await fx.mkBottle(stranger, theirLabel);
      expect(await rows.deleteImpact(owner, { labelIds: [a], bottleIds: [] })).toEqual({ labels: 1, bottlesOnLabels: 2, bottles: 0 });
      expect(await rows.deleteImpact(owner, { labelIds: [a, b], bottleIds: [lone] })).toEqual({ labels: 2, bottlesOnLabels: 3, bottles: 0 });
      expect(await rows.deleteImpact(owner, { labelIds: [theirLabel], bottleIds: [] })).toEqual({ labels: 0, bottlesOnLabels: 0, bottles: 0 });
      expect(await rows.deleteImpact(owner, { labelIds: [], bottleIds: [lone] })).toEqual({ labels: 0, bottlesOnLabels: 0, bottles: 1 });
    });
  });

  describe("deleteRows", () => {
    it("deletes a label with every bottle on it, whatever the bottle's status, and nothing else", async () => {
      const a = await fx.mkLabel(owner, cat.whiskey, "Del A");
      const keep = await fx.mkLabel(owner, cat.whiskey, "Del Keep");
      const shelf = await fx.mkBottle(owner, a);
      const sold = await fx.mkBottle(owner, a);
      await m.sql(`UPDATE bottles SET status = 'sold' WHERE id = $1`, sold);
      const kept = await fx.mkBottle(owner, keep);
      const out = await rows.deleteRows(owner, { labelIds: [a], bottleIds: [] });
      expect(out).toEqual({ deletedLabels: 1, deletedBottles: 2, failed: [] });
      expect(await count("expressions", "id = $1", a)).toBe(0);
      expect(await count("bottles", "id = ANY($1)", [shelf, sold])).toBe(0);
      expect(await count("expressions", "id = $1", keep)).toBe(1);
      expect(await count("bottles", "id = $1", kept)).toBe(1);
    });

    it("deletes a bottle alone and leaves its label, even when it was the label's last bottle", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Del Last");
      const only = await fx.mkBottle(owner, label);
      expect(await rows.deleteRows(owner, { labelIds: [], bottleIds: [only] })).toEqual({ deletedLabels: 0, deletedBottles: 1, failed: [] });
      expect(await count("bottles", "id = $1", only)).toBe(0);
      expect(await count("expressions", "id = $1", label)).toBe(1);
    });

    it("counts a bottle on a label that is also being deleted once, with the label", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Del Both");
      const b1 = await fx.mkBottle(owner, label);
      const b2 = await fx.mkBottle(owner, label);
      const out = await rows.deleteRows(owner, { labelIds: [label], bottleIds: [b1, b2] });
      expect(out).toEqual({ deletedLabels: 1, deletedBottles: 2, failed: [] });
    });

    it("touches nothing of another account's, and says it is gone", async () => {
      const theirs = await fx.mkLabel(stranger, cat.whiskey, "Del Theirs");
      const theirBottle = await fx.mkBottle(stranger, theirs);
      const out = await rows.deleteRows(owner, { labelIds: [theirs], bottleIds: [theirBottle] });
      expect(out.deletedLabels + out.deletedBottles).toBe(0);
      expect(out.failed.map((f) => [f.kind, f.error])).toEqual([["label", "That label is gone."], ["bottle", "That bottle is gone."]]);
      expect(await count("expressions", "id = $1", theirs)).toBe(1);
      expect(await count("bottles", "id = $1", theirBottle)).toBe(1);
    });

    it("carries on past a row that cannot be deleted", async () => {
      const ok = await fx.mkLabel(owner, cat.whiskey, "Del Fine");
      const out = await rows.deleteRows(owner, { labelIds: [999_999_999, ok], bottleIds: [999_999_998] });
      expect(out.deletedLabels).toBe(1);
      expect(out.failed.map((f) => f.id).sort()).toEqual([999_999_998, 999_999_999]);
      expect(await count("expressions", "id = $1", ok)).toBe(0);
    });

    it("ignores ids that are not positive whole numbers, and repeats", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Del Repeat");
      const out = await rows.deleteRows(owner, { labelIds: [label, label, -1, 0, 1.5], bottleIds: [NaN] });
      expect(out).toEqual({ deletedLabels: 1, deletedBottles: 0, failed: [] });
    });

    it("agrees with deleteImpact about what it takes", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Del Impact");
      await fx.mkBottle(owner, label);
      await fx.mkBottle(owner, label);
      const lone = await fx.mkBottle(owner, await fx.mkLabel(owner, cat.whiskey, "Del Impact Lone"));
      const impact = await rows.deleteImpact(owner, { labelIds: [label], bottleIds: [lone] });
      const out = await rows.deleteRows(owner, { labelIds: [label], bottleIds: [lone] });
      expect(out.deletedLabels).toBe(impact.labels);
      expect(out.deletedBottles).toBe(impact.bottlesOnLabels + impact.bottles);
    });
  });
});
