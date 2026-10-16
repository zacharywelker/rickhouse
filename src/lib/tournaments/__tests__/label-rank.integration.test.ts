import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// The label queries import server-only, which refuses to load outside the server build.
vi.mock("server-only", () => ({}));
import { connect, fixtures, settings, url, type Cat, type Db, type Fixtures } from "./fixtures";

describe.skipIf(!url)("the label-page tournament rank against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let labelRank: typeof import("../label-rank-query").labelRank;

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    labelRank = (await import("../label-rank-query")).labelRank;
  });

  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  async function play(user: number, field: ({ bottleId: number } | { expressionId: number })[], name: string) {
    const made = (await m.life.createTournament(user, settings({ name, heatSize: 3 }), field)) as { ok: true; id: number };
    await m.life.startTournament(user, made.id);
    await fx.finish(user, made.id);
  }

  it("gives a bottle's label and a label-only competitor their firm rank, and nothing otherwise", async () => {
    const own = await fx.mkOwnerWithField(cat.whiskey);
    const lonely = await fx.mkLabel(own.user, cat.whiskey, "Lonely label", { proof: 95 });
    const untouched = await fx.mkLabel(own.user, cat.whiskey, "Never poured", { proof: 95 });
    const field = [...own.bottles.map((bottleId) => ({ bottleId })), { expressionId: lonely }];
    for (let i = 0; i < 3; i++) await play(own.user, field, `Rank ${i}`);

    const first = await labelRank(own.user, own.labels[0]!);
    expect(first).toMatchObject({ of: 7, categoryId: cat.whiskey });
    expect(first!.rank).toBeGreaterThanOrEqual(1);
    expect(first!.text).toMatch(new RegExp(`^Tournament rank: ${first!.rank} of 7 in test bourbon`));
    expect(await labelRank(own.user, lonely)).toMatchObject({ of: 7 });
    expect(await labelRank(own.user, untouched)).toBeNull();
    // handing the row's facts over gives the same answer without reading them again
    const again = await labelRank(own.user, own.labels[0]!, { categoryId: cat.whiskey, categoryName: first!.text.split(" in ")[1]!, bottleIds: [own.bottles[0]!] });
    expect(again).toMatchObject({ rank: first!.rank, of: 7 });
  });

  it("is null while the rank is provisional", async () => {
    const own = await fx.mkOwnerWithField(cat.whiskey);
    await play(own.user, own.bottles.map((bottleId) => ({ bottleId })), "Once");
    expect(await labelRank(own.user, own.labels[0]!)).toBeNull();
  });

  it("never counts another account's tournaments, and is null for another account's label", async () => {
    const own = await fx.mkOwnerWithField(cat.whiskey);
    const stranger = await fx.mkOwnerWithField(cat.whiskey);
    for (let i = 0; i < 3; i++) await play(stranger.user, stranger.bottles.map((bottleId) => ({ bottleId })), `Theirs ${i}`);
    expect(await labelRank(own.user, own.labels[0]!)).toBeNull();
    expect(await labelRank(own.user, stranger.labels[0]!)).toBeNull();
    expect(await labelRank(stranger.user, stranger.labels[0]!)).not.toBeNull();
  });
});
