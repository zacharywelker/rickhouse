import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";

vi.mock("server-only", () => ({}));

/** Opt-in: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("finish and mashbill pairs against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let save: typeof import("../save");
  let dbModule: typeof import("@/db");

  const mkMashbill = async () => (await m.sql<{ id: number }>(`INSERT INTO mashbills (owner_id) VALUES ($1) RETURNING id`, owner))[0]!.id;
  let finishSeq = 0;
  const mkFinish = async (name: string) =>
    (await m.sql<{ id: number }>(`INSERT INTO finishes (name, slug, owner_id) VALUES ($1, $2, $3) RETURNING id`, `${name} ${process.pid}-${finishSeq++}`, `f-${process.pid}-${finishSeq}`, owner))[0]!.id;
  const saveLinks = (label: number, links: { mashbillLinks: unknown[]; finishLinks: unknown[] }) =>
    dbModule.db.transaction((tx) =>
      save.replaceLinks(tx, owner, label, save.linksFrom({ mashbillLinks: JSON.stringify(links.mashbillLinks), finishLinks: JSON.stringify(links.finishLinks) })));
  const pairsOf = (label: number) =>
    m.sql<{ mashbill_id: number; finish_id: number | null; share_pct: string | null }>(
      `SELECT mashbill_id, finish_id, share_pct FROM expression_finish_mashbills WHERE expression_id = $1 ORDER BY position`, label);
  const mashbillShares = async (label: number) =>
    Object.fromEntries((await m.sql<{ mashbill_id: number; share_pct: string | null }>(`SELECT mashbill_id, share_pct FROM expression_mashbills WHERE expression_id = $1`, label)).map((r) => [r.mashbill_id, r.share_pct === null ? null : Number(r.share_pct)]));
  const finishShares = async (label: number) =>
    Object.fromEntries((await m.sql<{ finish_id: number; share_pct: string | null }>(`SELECT finish_id, share_pct FROM expression_finishes WHERE expression_id = $1`, label)).map((r) => [r.finish_id, r.share_pct === null ? null : Number(r.share_pct)]));

  /** The 2026 Blue Note Special Reserve, as the label form would send it. */
  async function blueNote() {
    const [b1, b2, b3] = [await mkMashbill(), await mkMashbill(), await mkMashbill()] as [number, number, number];
    const f = {
      cognac: await mkFinish("Cognac"), madeira: await mkFinish("Madeira"), sherry: await mkFinish("Sherry"), port: await mkFinish("Port"),
      vino: await mkFinish("Vino de Naranja"), vanilla: await mkFinish("Vanilla Cognac"), apricot: await mkFinish("Apricot Brandy"), bock: await mkFinish("Winter Bock"),
    };
    const label = await fx.mkLabel(owner, cat.whiskey, `Blue Note ${finishSeq}`);
    const one = (finish: number, mashbill: number, share: number) => ({ id: finish, amount: "", share, mashbills: [{ id: mashbill, share }] });
    const finishLinks = [
      { id: f.cognac, amount: "", mashbills: [{ id: b1, share: 3 }, { id: b3, share: 12 }] },
      one(f.madeira, b3, 2), one(f.sherry, b2, 3), one(f.port, b1, 3), one(f.vino, b3, 41), one(f.vanilla, b3, 15), one(f.apricot, b3, 11), one(f.bock, b3, 10),
    ];
    const mashbillLinks = [b1, b2, b3].map((id) => ({ id, amount: "" }));
    await saveLinks(label, { mashbillLinks, finishLinks });
    return { label, b: { b1, b2, b3 }, f, mashbillLinks, finishLinks };
  }

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    owner = await fx.mkUser();
    save = await import("../save");
    dbModule = await import("@/db");
  });
  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  it("saves the Blue Note label with every pair and total", async () => {
    const { label, b, f } = await blueNote();
    const pairs = await pairsOf(label);
    expect(pairs).toHaveLength(9);
    expect(pairs.filter((p) => p.finish_id === f.cognac).map((p) => [p.mashbill_id, Number(p.share_pct)])).toEqual([[b.b1, 3], [b.b3, 12]]);
    expect(await mashbillShares(label)).toEqual({ [b.b1]: 6, [b.b2]: 3, [b.b3]: 91 });
    expect(await finishShares(label)).toMatchObject({ [f.cognac]: 15, [f.vino]: 41, [f.bock]: 10 });
    const months = await m.sql<{ months: number | null }>(`SELECT months FROM expression_finishes WHERE expression_id = $1`, label);
    expect(months.every((r) => r.months === null)).toBe(true);
  });

  it("refuses shares that do not add to 100 and writes nothing", async () => {
    const { label, mashbillLinks, finishLinks } = await blueNote();
    const broken = finishLinks.map((row, i) => (i === 4 ? { ...row, share: 40, mashbills: [{ ...row.mashbills![0]!, share: 40 }] } : row));
    await expect(saveLinks(label, { mashbillLinks, finishLinks: broken })).rejects.toThrow(/99%: 1 under/);
    expect(await pairsOf(label)).toHaveLength(9);
  });

  it("keeps the pairs when a caller sends finish rows without pairs, and takes a removed mashbill's pairs with it", async () => {
    const { label, b, f, mashbillLinks } = await blueNote();
    const unaware = Object.values(f).map((id) => ({ id, amount: "" }));
    await saveLinks(label, { mashbillLinks, finishLinks: unaware });
    expect(await pairsOf(label)).toHaveLength(9);
    expect(await finishShares(label)).toMatchObject({ [f.cognac]: 15, [f.vino]: 41 });

    // The phone drops 70/22/8 (b2): its Sherry pair goes, the rest keep their association, and
    // the shares can no longer claim to add up, so they are cleared rather than refused.
    await saveLinks(label, { mashbillLinks: mashbillLinks.filter((r) => r.id !== b.b2), finishLinks: unaware });
    const after = await pairsOf(label);
    expect(after.some((p) => p.mashbill_id === b.b2)).toBe(false);
    expect(after).toHaveLength(8);
    expect(after.every((p) => p.share_pct === null)).toBe(true);
    expect(Object.values(await finishShares(label)).every((s) => s === null)).toBe(true);
  });

  it("stores an unfinished portion as a pair with no finish and counts it toward the mashbill", async () => {
    const b = await mkMashbill();
    const sherry = await mkFinish("Sherry");
    const label = await fx.mkLabel(owner, cat.whiskey, `Partly finished ${finishSeq}`);
    await saveLinks(label, {
      mashbillLinks: [{ id: b, amount: "" }],
      finishLinks: [{ id: sherry, amount: 9, share: 40 }, { id: 0, amount: "", unfinished: true, share: 60 }],
    });
    const pairs = await pairsOf(label);
    expect(pairs.map((p) => [p.finish_id, Number(p.share_pct)])).toEqual([[sherry, 40], [null, 60]]);
    expect((await mashbillShares(label))[b]).toBe(100);
  });

  it("refuses the same pair twice at the database even if the app check were skipped", async () => {
    const { label, b, f } = await blueNote();
    await expect(m.sql(`INSERT INTO expression_finish_mashbills (expression_id, mashbill_id, finish_id, position) VALUES ($1, $2, $3, 99)`, label, b.b1, f.port)).rejects.toThrow(/unique/i);
  });
});
