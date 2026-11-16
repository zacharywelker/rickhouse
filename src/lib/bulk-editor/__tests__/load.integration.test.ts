import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";

vi.mock("server-only", () => ({}));

/** Opt-in, like the other integration tests: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("what the bulk editor loads, against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let stranger: number;
  let load: typeof import("../load");
  let bottlesGrid: typeof import("@/lib/bottles/grid");
  let bottleFilters: typeof import("@/lib/bottles/filters");
  let labelQueries: typeof import("@/lib/expressions/queries");
  let labelFilters: typeof import("@/lib/expressions/filters");

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    owner = await fx.mkUser();
    stranger = await fx.mkUser();
    load = await import("../load");
    bottlesGrid = await import("@/lib/bottles/grid");
    bottleFilters = await import("@/lib/bottles/filters");
    labelQueries = await import("@/lib/expressions/queries");
    labelFilters = await import("@/lib/expressions/filters");
  });

  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  it("lists the same labels and bottles the Labels and Collection pages list, and nothing of another account's", async () => {
    const a = await fx.mkLabel(owner, cat.whiskey, "Sheet A");
    const b = await fx.mkLabel(owner, cat.rum, "Sheet B");
    await fx.mkLabel(owner, cat.whiskey, "Sheet No Bottles");
    const theirs = await fx.mkLabel(stranger, cat.whiskey, "Sheet Theirs");
    await fx.mkBottle(stranger, theirs);
    const shelf = [await fx.mkBottle(owner, a), await fx.mkBottle(owner, a), await fx.mkBottle(owner, b)];
    // Off the shelf: the Collection hides these until you ask for them, so the editor does too.
    const sold = await fx.mkBottle(owner, a);
    const wishlist = await fx.mkBottle(owner, b);
    await m.sql(`UPDATE bottles SET status = 'sold' WHERE id = $1`, sold);
    await m.sql(`UPDATE bottles SET status = 'wishlist' WHERE id = $1`, wishlist);
    await m.sql(`UPDATE bottles SET status = 'open' WHERE id = $1`, shelf[2]);

    const sheet = await load.loadSheet(owner);

    const collection = await bottlesGrid.queryBottles({ ...bottleFilters.parseFilters({}), pageSize: 1000 }, owner);
    expect(sheet.bottles.map((x) => x.id).sort()).toEqual(collection.rows.map((x) => x.id).sort());
    expect(sheet.bottles.map((x) => x.id).sort()).toEqual([...shelf].sort());

    const labelsPage = await labelQueries.queryExpressions({ ...labelFilters.parseLabelFilters({}), pageSize: 1000 }, owner);
    expect(sheet.labels.map((x) => x.id).sort()).toEqual(labelsPage.rows.map((x) => x.id).sort());
    expect(sheet.labels.map((x) => x.name)).toEqual(expect.arrayContaining(["Sheet A", "Sheet B", "Sheet No Bottles"]));
    expect(sheet.labels.map((x) => x.name)).not.toContain("Sheet Theirs");
  });

  it("offers the account's own brands and the categories, and no one else's brands", async () => {
    const mine = await fx.mkLabel(owner, cat.whiskey, "Sheet Brand Mine");
    const theirs = await fx.mkLabel(stranger, cat.whiskey, "Sheet Brand Theirs");
    const sheet = await load.loadSheet(owner);
    const brandOf = async (label: number) => (await m.sql<{ brand_id: number }>(`SELECT brand_id FROM expressions WHERE id = $1`, label))[0]!.brand_id;
    expect(sheet.brands.map((b) => b.id)).toContain(await brandOf(mine));
    expect(sheet.brands.map((b) => b.id)).not.toContain(await brandOf(theirs));
    expect(sheet.categories.map((c) => c.id)).toEqual(expect.arrayContaining([cat.whiskey, cat.rum]));
    expect(sheet.groups[cat.whiskey]).toBe("whiskey");
  });

  it("keeps a bottle's own proof, age and size apart from its label's", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Sheet Own", { proof: 100 });
    const bottle = await fx.mkBottle(owner, label, { proof: 104.2 });
    await m.sql(`UPDATE bottles SET size_ml = 375 WHERE id = $1`, bottle);
    const plain = await fx.mkBottle(owner, label);

    const sheet = await load.loadSheet(owner);
    const own = sheet.bottles.find((x) => x.id === bottle)!;
    const inherits = sheet.bottles.find((x) => x.id === plain)!;
    expect(Number(own.proof)).toBeCloseTo(104.2);
    expect(own.sizeMl).toBe(375);
    expect(inherits.proof).toBeNull();
    expect(inherits.sizeMl).toBeNull();
    expect(Number(sheet.labels.find((x) => x.id === label)!.proof)).toBe(100);
  });

  it("loads the thumbnails the rail shows: a label's own, and a bottle's (its own, else its label's), and only for those that have one", async () => {
    const withPhoto = await fx.mkLabel(owner, cat.whiskey, "Sheet Photo");
    const without = await fx.mkLabel(owner, cat.whiskey, "Sheet No Photo");
    const theirs = await fx.mkLabel(stranger, cat.whiskey, "Sheet Photo Theirs");
    await m.sql(`UPDATE expressions SET photo_thumb_path = 'labels/t.jpg', photo_path = 'labels/f.jpg', photo_is_cutout = true WHERE id = $1`, withPhoto);
    await m.sql(`UPDATE expressions SET photo_path = 'labels/theirs.jpg' WHERE id = $1`, theirs);
    const onPhoto = await fx.mkBottle(owner, withPhoto);
    const onNone = await fx.mkBottle(owner, without);

    const { photos } = await load.loadSheet(owner);
    expect(photos.labels[withPhoto]).toEqual({ path: "labels/t.jpg", isCutout: true });
    expect(photos.labels[without]).toBeUndefined();
    expect(photos.labels[theirs]).toBeUndefined();
    // The Collection's own rule: a bottle with no photo of its own shows its label's.
    expect(photos.bottles[onPhoto]).toMatchObject({ path: "labels/t.jpg" });
    expect(photos.bottles[onNone]).toBeUndefined();
  });
});
