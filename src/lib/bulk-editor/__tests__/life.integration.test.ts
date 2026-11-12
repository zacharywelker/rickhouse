import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";
import { bottlePatchBody } from "../save";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** Opt-in, like the other integration tests: a throwaway migrated database. */
describe.skipIf(!url)("where a bottle is in its life, against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let rows: typeof import("../rows");

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    owner = await fx.mkUser();
    rows = await import("../rows");
  });
  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  const today = new Date().toISOString().slice(0, 10);
  const bottleRow = async (id: number) => (await m.sql<Record<string, unknown>>(`SELECT status, fill_pct, is_open, date_opened::text AS date_opened, date_killed::text AS date_killed, is_favorite FROM bottles WHERE id = $1`, id))[0]!;
  async function fresh(name: string) {
    const out = await rows.createRow(owner, { brand: { name: "Life Brand" }, label: { name, categoryId: cat.whiskey }, bottle: {} });
    if (!out.ok) throw new Error(out.error);
    return out.bottleId!;
  }
  const patch = (id: number, cells: Record<string, string>) => rows.patchBottleRow(owner, id, bottlePatchBody(cells, undefined));

  it("sets the level, which opens a sealed bottle and stamps the date", async () => {
    const id = await fresh("Life One");
    expect(await patch(id, { fillPct: "50" })).toEqual({ ok: true });
    expect(await bottleRow(id)).toMatchObject({ fill_pct: 50, is_open: true, status: "open", date_opened: today });
  });

  it("ticks and unticks Opened: unticking a full bottle seals it, one under full is refused with the reason", async () => {
    const id = await fresh("Life Two");
    expect(await patch(id, { isOpen: "true" })).toEqual({ ok: true });
    expect(await bottleRow(id)).toMatchObject({ is_open: true, status: "open", date_opened: today, fill_pct: 100 });
    expect(await patch(id, { isOpen: "false" })).toEqual({ ok: true });
    expect(await bottleRow(id)).toMatchObject({ is_open: false, status: "owned", date_opened: null });
    await patch(id, { fillPct: "25" });
    const refused = await patch(id, { isOpen: "false" });
    expect(refused).toMatchObject({ ok: false, kind: "invalid", fieldErrors: { isOpen: expect.stringMatching(/full/i) } });
    expect(await bottleRow(id)).toMatchObject({ fill_pct: 25, is_open: true });
  });

  it("sets and clears the opened date; clearing keeps an open bottle open and leaves its level", async () => {
    const id = await fresh("Life Three");
    expect(await patch(id, { dateOpened: "2026-01-02" })).toEqual({ ok: true });
    expect(await bottleRow(id)).toMatchObject({ date_opened: "2026-01-02", is_open: true, status: "open" });
    expect(await patch(id, { dateOpened: "" })).toEqual({ ok: true });
    expect(await bottleRow(id)).toMatchObject({ date_opened: null, is_open: true, status: "open" });
    expect(await patch(id, { dateOpened: "2999-01-01" })).toMatchObject({ ok: false });
  });

  it("types a status against the bottle's state: killed empties it, owned is refused for an opened bottle", async () => {
    const id = await fresh("Life Four");
    await patch(id, { fillPct: "60" });
    expect(await patch(id, { status: "owned" })).toMatchObject({ ok: false, fieldErrors: { status: expect.any(String) } });
    expect(await patch(id, { status: "sold" })).toEqual({ ok: true });
    expect(await bottleRow(id)).toMatchObject({ status: "sold", fill_pct: 60 });
    expect(await patch(id, { status: "killed" })).toEqual({ ok: true });
    expect(await bottleRow(id)).toMatchObject({ status: "killed", fill_pct: 0, date_killed: today });
    // Back to sold: the killed date goes with it.
    expect(await patch(id, { status: "traded" })).toEqual({ ok: true });
    expect(await bottleRow(id)).toMatchObject({ status: "traded", date_killed: null });
    expect(await patch(id, { status: "lost" })).toMatchObject({ ok: false });
  });

  it("judges a status against the same request's level and date: a level and a status together", async () => {
    const id = await fresh("Life Five");
    expect(await patch(id, { fillPct: "40", status: "owned" })).toMatchObject({ ok: false, fieldErrors: { status: expect.any(String) } });
    expect(await bottleRow(id)).toMatchObject({ fill_pct: 100, status: "owned" }); // nothing partly saved
    expect(await patch(id, { fillPct: "40", status: "sold" })).toEqual({ ok: true });
    expect(await bottleRow(id)).toMatchObject({ fill_pct: 40, status: "sold" });
  });

  it("sets the killed date (not in the future, not before it was opened) and the favourite", async () => {
    const id = await fresh("Life Six");
    await patch(id, { dateOpened: "2026-03-01" });
    expect(await patch(id, { dateKilled: "2026-02-01" })).toMatchObject({ ok: false, fieldErrors: { dateKilled: expect.any(String) } });
    expect(await patch(id, { dateKilled: "2999-01-01" })).toMatchObject({ ok: false });
    expect(await patch(id, { dateKilled: "2026-04-01", isFavorite: "true" })).toEqual({ ok: true });
    expect(await bottleRow(id)).toMatchObject({ date_killed: "2026-04-01", is_favorite: true });
    expect(await patch(id, { dateKilled: "", isFavorite: "false" })).toEqual({ ok: true });
    expect(await bottleRow(id)).toMatchObject({ date_killed: null, is_favorite: false });
  });

  describe("a new row", () => {
    const make = (name: string, bottle: Record<string, unknown>) => rows.createRow(owner, { brand: { name: "Life Brand" }, label: { name, categoryId: cat.whiskey }, bottle });
    it("takes its level, opened flag, dates and favourite", async () => {
      const out = await make("Life New One", { fillPct: 30, isFavorite: true });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(await bottleRow(out.bottleId!)).toMatchObject({ fill_pct: 30, is_open: true, status: "open", date_opened: today, is_favorite: true });
    });
    it("holds a typed status to what it means: killed is empty and dated, sold keeps the level, an opened wishlist bottle is refused", async () => {
      const killed = await make("Life New Two", { status: "killed" });
      expect(killed.ok && (await bottleRow(killed.bottleId!))).toMatchObject({ status: "killed", fill_pct: 0, date_killed: today });
      const sold = await make("Life New Three", { status: "sold", fillPct: 70 });
      expect(sold.ok && (await bottleRow(sold.bottleId!))).toMatchObject({ status: "sold", fill_pct: 70 });
      const wish = await make("Life New Four", { status: "wishlist", fillPct: 70 });
      expect(wish).toMatchObject({ ok: false, fieldErrors: { status: expect.any(String) } });
      expect(await m.sql(`SELECT 1 FROM expressions WHERE name = 'Life New Four'`)).toHaveLength(0); // the label was not made either
    });
  });
});
