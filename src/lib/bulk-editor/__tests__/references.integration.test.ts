import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** Opt-in, like the other integration tests: a throwaway migrated database. */
describe.skipIf(!url)("the picking cells save, against a real database", () => {
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

  const count = async (table: string, where: string, ...params: unknown[]) => Number((await m.sql<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`, ...params))[0]!.n);
  const one = async <T extends Record<string, unknown>>(query: string, ...params: unknown[]) => (await m.sql<T>(query, ...params))[0]!;
  async function bottleOn(brand: string, label: string, facts: Record<string, unknown> = {}) {
    const out = await rows.createRow(owner, { brand: { name: brand }, label: { name: label, categoryId: cat.whiskey, facts }, bottle: {} });
    if (!out.ok) throw new Error(out.error);
    return { labelId: out.labelId, bottleId: out.bottleId! };
  }

  describe("a store", () => {
    it("is made by name with a new bottle, and the next bottle of the name uses it", async () => {
      const a = await rows.createRow(owner, { brand: { name: "S Brand" }, label: { name: "S One", categoryId: cat.whiskey }, bottle: { storeName: "Binny's" } });
      const b = await rows.createRow(owner, { brand: { name: "S Brand" }, label: { name: "S One", categoryId: cat.whiskey }, bottle: { storeName: "binny's" } });
      expect(a.ok && b.ok).toBe(true);
      expect(await count("stores", `owner_id = $1 AND name = 'Binny''s'`, owner)).toBe(1);
      const bottles = await m.sql<{ store_id: number }>(`SELECT store_id FROM bottles WHERE id = ANY($1)`, [a.ok ? a.bottleId : 0, b.ok ? b.bottleId : 0]);
      expect(new Set(bottles.map((r) => r.store_id)).size).toBe(1);
    });

    it("is made by name when a saved bottle is changed, and cleared with null", async () => {
      const { bottleId } = await bottleOn("S Brand", "S Two");
      expect(await rows.patchBottleRow(owner, bottleId, { storeName: "Total Wine" })).toEqual({ ok: true });
      expect(await one(`SELECT s.name FROM bottles b JOIN stores s ON s.id = b.store_id WHERE b.id = $1`, bottleId)).toEqual({ name: "Total Wine" });
      expect(await rows.patchBottleRow(owner, bottleId, { storeId: null })).toEqual({ ok: true });
      expect((await one<{ store_id: number | null }>(`SELECT store_id FROM bottles WHERE id = $1`, bottleId)).store_id).toBeNull();
      // The store stays: it is the account's, not the bottle's.
      expect(await count("stores", `owner_id = $1 AND name = 'Total Wine'`, owner)).toBe(1);
    });

    it("is one store when many bottles name a new one at once", async () => {
      const made = await Promise.all(Array.from({ length: 5 }, (_, i) => bottleOn("S Brand", `S Race ${i}`)));
      const results = await Promise.all(made.map((b) => rows.patchBottleRow(owner, b.bottleId, { storeName: "Race Store" })));
      expect(results.every((r) => r.ok)).toBe(true);
      expect(await count("stores", `owner_id = $1 AND name = 'Race Store'`, owner)).toBe(1);
    });

    it("leaves no store behind when the change fails, and does not take back one that already existed", async () => {
      const { bottleId } = await bottleOn("S Brand", "S Three");
      const failed = await rows.patchBottleRow(owner, bottleId, { storeName: "Ghost Store", releaseId: 999999 });
      expect(failed).toMatchObject({ ok: false, kind: "invalid" });
      expect(await count("stores", `owner_id = $1 AND name = 'Ghost Store'`, owner)).toBe(0);
      await rows.patchBottleRow(owner, bottleId, { storeName: "Kept Store" });
      expect(await rows.patchBottleRow(owner, bottleId, { storeName: "Kept Store", releaseId: 999999 })).toMatchObject({ ok: false });
      expect(await count("stores", `owner_id = $1 AND name = 'Kept Store'`, owner)).toBe(1);
    });

    it("refuses a name next to an id, a blank name, and another account's store", async () => {
      const { bottleId } = await bottleOn("S Brand", "S Four");
      expect(await rows.patchBottleRow(owner, bottleId, { storeId: 1, storeName: "X" })).toMatchObject({ ok: false, fieldErrors: { storeName: expect.any(String) } });
      expect(await rows.patchBottleRow(owner, bottleId, { storeName: "   " })).toMatchObject({ ok: false });
      const theirs = (await m.sql<{ id: number }>(`INSERT INTO stores (owner_id, name, slug) VALUES ($1, 'Theirs', 'theirs') RETURNING id`, stranger))[0]!.id;
      expect(await rows.patchBottleRow(owner, bottleId, { storeId: theirs })).toMatchObject({ ok: false, fieldErrors: { storeId: expect.any(String) } });
    });
  });

  describe("a cooperage", () => {
    it("is made by name with a new label, and by name when a saved label is changed", async () => {
      const made = await rows.createRow(owner, { brand: { name: "C Brand" }, label: { name: "C One", categoryId: cat.whiskey, facts: { cooperageName: "Independent Stave" } } });
      expect(made.ok).toBe(true);
      if (!made.ok) return;
      expect(await one(`SELECT c.name FROM expressions e JOIN cooperages c ON c.id = e.cooperage_id WHERE e.id = $1`, made.labelId)).toEqual({ name: "Independent Stave" });
      const { labelId } = await bottleOn("C Brand", "C Two");
      expect(await rows.patchLabelRow(owner, labelId, { cooperageName: "independent stave" })).toEqual({ ok: true });
      expect(await count("cooperages", `owner_id = $1 AND name = 'Independent Stave'`, owner)).toBe(1);
      expect((await one<{ cooperage_id: number }>(`SELECT cooperage_id FROM expressions WHERE id = $1`, labelId)).cooperage_id).toBeGreaterThan(0);
      expect(await rows.patchLabelRow(owner, labelId, { cooperageId: null })).toEqual({ ok: true });
      expect((await one<{ cooperage_id: number | null }>(`SELECT cooperage_id FROM expressions WHERE id = $1`, labelId)).cooperage_id).toBeNull();
    });

    it("leaves no cooperage behind when the label change fails", async () => {
      const { labelId } = await bottleOn("C Brand", "C Three");
      const failed = await rows.patchLabelRow(owner, labelId, { cooperageName: "Ghost Cooperage", proof: "abc" });
      expect(failed).toMatchObject({ ok: false });
      expect(await count("cooperages", `owner_id = $1 AND name = 'Ghost Cooperage'`, owner)).toBe(0);
    });
  });

  describe("a release and a label name", () => {
    async function labelWith(name: string) {
      const { labelId, bottleId } = await bottleOn("R Brand", name);
      const release = (await m.sql<{ id: number }>(`INSERT INTO expression_releases (expression_id, name) VALUES ($1, '2024 Release') RETURNING id`, labelId))[0]!.id;
      const version = (await m.sql<{ id: number }>(`INSERT INTO expression_names (expression_id, name) VALUES ($1, 'Old Name') RETURNING id`, labelId))[0]!.id;
      return { labelId, bottleId, release, version };
    }

    it("are picked from the bottle's own label, and cleared with null", async () => {
      const { bottleId, release, version } = await labelWith("R One");
      expect(await rows.patchBottleRow(owner, bottleId, { releaseId: release, expressionNameId: version })).toEqual({ ok: true });
      expect(await one(`SELECT release_id, expression_name_id FROM bottles WHERE id = $1`, bottleId)).toEqual({ release_id: release, expression_name_id: version });
      expect(await rows.patchBottleRow(owner, bottleId, { expressionNameId: null })).toEqual({ ok: true });
      expect((await one<{ expression_name_id: number | null }>(`SELECT expression_name_id FROM bottles WHERE id = $1`, bottleId)).expression_name_id).toBeNull();
      expect(await rows.patchBottleRow(owner, bottleId, { releaseId: null })).toEqual({ ok: true });
    });

    it("refuse another label's", async () => {
      const mine = await labelWith("R Two");
      const other = await labelWith("R Three");
      expect(await rows.patchBottleRow(owner, mine.bottleId, { releaseId: other.release })).toMatchObject({ ok: false, fieldErrors: { releaseId: expect.any(String) } });
      expect(await rows.patchBottleRow(owner, mine.bottleId, { expressionNameId: other.version })).toMatchObject({ ok: false, fieldErrors: { expressionNameId: expect.any(String) } });
      expect(await rows.patchBottleRow(owner, mine.bottleId, { expressionNameId: "nope" })).toMatchObject({ ok: false });
    });

    it("do not follow a bottle that moves, unless the request says one of the new label's", async () => {
      const mine = await labelWith("R Four");
      const other = await labelWith("R Five");
      await rows.patchBottleRow(owner, mine.bottleId, { releaseId: mine.release, expressionNameId: mine.version });
      expect(await rows.patchBottleRow(owner, mine.bottleId, { expressionId: other.labelId })).toEqual({ ok: true });
      expect(await one(`SELECT release_id, expression_name_id FROM bottles WHERE id = $1`, mine.bottleId)).toEqual({ release_id: null, expression_name_id: null });
      expect(await rows.patchBottleRow(owner, mine.bottleId, { expressionId: mine.labelId, expressionNameId: mine.version })).toEqual({ ok: true });
      expect((await one<{ expression_name_id: number }>(`SELECT expression_name_id FROM bottles WHERE id = $1`, mine.bottleId)).expression_name_id).toBe(mine.version);
    });
  });
});
