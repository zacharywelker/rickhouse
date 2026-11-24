import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";

vi.mock("server-only", () => ({}));

/** Opt-in, like the other integration tests: needs TOURNAMENT_TEST_DATABASE_URL (and DATABASE_URL) naming a throwaway migrated database. */
describe.skipIf(!url)("the nav search loader, against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let a: number;
  let b: number;
  let owned: number;
  let ownedLabel: number;
  let bareLabel: number;
  let load: typeof import("../load");

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    const cat = await fx.mkCategories();
    a = await fx.mkUser();
    b = await fx.mkUser();

    ownedLabel = await fx.mkLabel(a, cat.whiskey, "Loader Owned", { distillery: "Loader Alpha" });
    bareLabel = await fx.mkLabel(a, cat.whiskey, "Loader Bare", { distillery: "Loader Alpha" });
    owned = await fx.mkBottle(a, ownedLabel, { proof: 125.6 });
    await m.sql(`INSERT INTO groups (owner_id, name, slug) VALUES ($1, 'Loader Shelf', $2)`, a, `loader-shelf-${a}`);

    // Another account's data must never appear.
    const theirs = await fx.mkLabel(b, cat.whiskey, "Loader Theirs", { distillery: "Loader Beta" });
    await fx.mkBottle(b, theirs);
    await m.sql(`INSERT INTO groups (owner_id, name, slug) VALUES ($1, 'Loader Theirs Shelf', $2)`, b, `loader-theirs-${b}`);

    load = await import("../load");
  });

  afterAll(async () => {
    if (m) {
      await m.sql(`DELETE FROM groups WHERE owner_id IN ($1, $2)`, a, b);
      await fx.cleanup();
      await m.end();
    }
  });

  it("returns exactly the account's own labels, bottles, brands, distilleries and groups", async () => {
    const data = await load.loadNavSearchData(a);

    expect(data.labels.map((l) => l.id).sort()).toEqual([ownedLabel, bareLabel].sort());
    expect(data.ownedBottles.map((x) => x.id)).toEqual([owned]);
    expect(data.ownedBottles[0]).toMatchObject({ expressionId: ownedLabel, isOpen: false, fillPct: 100 });
    expect(data.groups.map((g) => g.name)).toEqual(["Loader Shelf"]);
    expect(data.groups[0]?.filterQuery).toBeNull();

    // Counts. (The fixture makes a distillery per label, so there are two "Loader Alpha" distilleries.)
    expect(data.brands.map((x) => x.name).sort()).toEqual(["B Loader Bare", "B Loader Owned"]);
    expect(data.brands.find((x) => x.name === "B Loader Owned")).toMatchObject({ labels: 1, bottles: 1 });
    expect(data.brands.find((x) => x.name === "B Loader Bare")).toMatchObject({ labels: 1, bottles: 0 });
    const alphas = data.distilleries.filter((x) => x.name.startsWith("Loader Alpha"));
    expect(alphas.map((x) => [x.labels, x.bottles]).sort()).toEqual([[1, 0], [1, 1]]);
    expect(alphas.every((x) => x.place === null)).toBe(true);
  });

  it("gives the other account only its own rows", async () => {
    const data = await load.loadNavSearchData(b);
    expect(data.labels).toHaveLength(1);
    expect(data.groups.map((g) => g.name)).toEqual(["Loader Theirs Shelf"]);
    expect(data.distilleries.map((x) => x.name.startsWith("Loader Beta"))).toEqual([true]);
  });
});
