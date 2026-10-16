import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, fixtures, settings, url, type Cat, type Db, type Fixtures } from "./fixtures";

describe.skipIf(!url)("the tournament ranking against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let other: number;
  let cat: Cat;

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    other = await fx.mkUser();
    cat = await fx.mkCategories();
  });

  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });


  it("ranks bottles across tournaments, leaves out outside entries, and audits the ratings against the ranking", async () => {
    const own = await fx.mkOwnerWithField(cat.whiskey);
    // Three tournaments over the same six bottles give each bottle three or more heats and every heat spans proof bands.
    for (let i = 0; i < 3; i++) {
      const field = [...own.bottles.map((bottleId) => ({ bottleId })), ...(i === 0 ? [{ name: "Joe's cask" }] : [])];
      const made = (await m.life.createTournament(own.user, settings({ name: `Rank ${i}`, heatSize: 3 }), field)) as { ok: true; id: number };
      await m.life.startTournament(own.user, made.id);
      await fx.finish(own.user, made.id);
    }
    // The tastings: bottle 0 wins every tournament but is rated worst; bottle 1 loses early but is rated best.
    for (const [i, rating] of [5, 9, 8, 7, 8.5, 6].entries()) {
      await m.sql(`INSERT INTO tasting_notes (owner_id, expression_id, bottle_id, rating) VALUES ($1, $2, $3, $4)`, own.user, own.labels[i]!, own.bottles[i]!, rating);
    }

    const result = await m.ranking.rankingFor(own.user, null);
    const byId = new Map(result.competitors.map((c) => [c.id, c]));
    expect(result.competitors).toHaveLength(6);
    expect(result.competitors.some((c) => c.name === "Joe's cask")).toBe(false);
    const champion = byId.get(`b:${own.bottles[0]}`)!;
    expect(champion.rank).toBe(1);
    expect(champion).toMatchObject({ provisional: false, singleBand: false, rating: 5, groupSize: 6 });
    expect(new Set(result.competitors.map((c) => c.group)).size).toBe(1);

    const gap = result.audit.find((row) => row.id === `b:${own.bottles[0]}`)!;
    expect(gap).toMatchObject({ rank: 1, expectedRank: 6, gap: -5 });
    expect(result.audit.every((row, i, all) => i === 0 || Math.abs(all[i - 1]!.gap) >= Math.abs(row.gap))).toBe(true);
  });

  it("ranks a label with no bottle by the tastings of the label, and filters by category", async () => {
    const own = await fx.mkOwnerWithField(cat.whiskey);
    const lonely = await fx.mkLabel(own.user, cat.rum, "Rum label", { proof: 80 });
    const rumBottle = await fx.mkBottle(own.user, await fx.mkLabel(own.user, cat.rum, "Rum bottle", { proof: 85 }));
    const field = [{ bottleId: own.bottles[0]! }, { bottleId: own.bottles[1]! }, { expressionId: lonely }, { bottleId: rumBottle }];
    const made = (await m.life.createTournament(own.user, settings({ name: "Mixed", heatSize: 4 }), field)) as { ok: true; id: number };
    await m.life.startTournament(own.user, made.id);
    await fx.finish(own.user, made.id);
    await m.sql(`INSERT INTO tasting_notes (owner_id, expression_id, rating) VALUES ($1, $2, 7.5)`, own.user, lonely);

    const all = await m.ranking.rankingFor(own.user, null);
    expect(all.competitors.find((c) => c.id === `e:${lonely}`)).toMatchObject({ expressionId: lonely, bottleId: null, rating: 7.5 });
    const rumOnly = await m.ranking.rankingFor(own.user, cat.rum);
    expect(rumOnly.competitors.map((c) => c.id).sort()).toEqual([`b:${rumBottle}`, `e:${lonely}`].sort());
    const whiskey = await m.ranking.rankingFor(own.user, cat.whiskey);
    expect(whiskey.competitors.map((c) => c.id).sort()).toEqual([`b:${own.bottles[0]}`, `b:${own.bottles[1]}`].sort());
    expect(await m.ranking.rankingFor(other, null)).toEqual({ competitors: [], audit: [] });
  });
});
