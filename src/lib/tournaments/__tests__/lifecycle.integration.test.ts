import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The label merge imports server-only, which refuses to load outside the server build.
vi.mock("server-only", () => ({}));

import { connect, fixtures, settings, url, type Cat, type Db, type Fixtures } from "./fixtures";

describe.skipIf(!url)("tournament set-up and lifecycle against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let owner: number;
  let other: number;
  let cat: Cat;
  let bottles: number[];

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    owner = await fx.mkUser();
    other = await fx.mkUser();
    cat = await fx.mkCategories();
    ({ bottles } = await fx.mkField(owner, cat.whiskey, "Label"));
  });

  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  const bottleEntries = () => bottles.map((bottleId) => ({ bottleId }));

  it("makes a draft with bottles, a label and an outside entry, and refuses a stranger's bottle or a repeat", async () => {
    const stranger = await fx.mkBottle(other, await fx.mkLabel(other, cat.whiskey, "Theirs", { proof: 90 }));
    const bad = await m.life.createTournament(owner, settings(), [{ bottleId: stranger }]);
    expect(bad).toMatchObject({ ok: false, status: 422 });
    const twice = await m.life.createTournament(owner, settings(), [{ bottleId: bottles[0]! }, { bottleId: bottles[0]! }]);
    expect(twice).toMatchObject({ ok: false, status: 422 });

    const label = await fx.mkLabel(owner, cat.whiskey, "Friend's", { proof: 95 });
    const made = await m.life.createTournament(owner, settings(), [{ bottleId: bottles[0]! }, { expressionId: label }, { name: "Joe's cask sample" }]);
    expect(made.ok).toBe(true);
    const view = (await m.queries.getTournament(owner, (made as { id: number }).id))!;
    expect(view.status).toBe("draft");
    expect(view.entries.map((e) => [e.kind, e.name])).toEqual([
      ["bottle", "B Label 0 Label 0"],
      ["label", "B Friend's Friend's"],
      ["adhoc", "Joe's cask sample"],
    ]);
    expect(await m.queries.getTournament(other, view.id)).toBeNull();
  });

  it("previews round 1 matched by proof, and a stranger cannot reach it", async () => {
    const made = (await m.life.createTournament(owner, settings({ heatSize: 3 }), bottleEntries())) as { ok: true; id: number };
    const reset = await m.transitions.resetRound(owner, made.id);
    expect(reset.ok).toBe(true);
    const view = (reset as { view: import("../view").TournamentView }).view;
    expect(view.rounds[0]!.heats.map((h) => h.entries.map((e) => e.proof))).toEqual([[90, 92, 100], [101, 115, 125]]);
    expect(view.plan).toEqual([2, 1]);
    expect(await m.transitions.resetRound(other, made.id)).toMatchObject({ ok: false, status: 404 });
  });

  it("keeps the round 1 preview in step with the field: made on create, removed below two entries, made again at two or more", async () => {
    const flights = async (id: number) => (await m.queries.getTournament(owner, id))!.rounds.flatMap((r) => r.heats);
    const made = (await m.life.createTournament(owner, settings({ heatSize: 3 }), bottles.slice(0, 3).map((bottleId) => ({ bottleId })))) as { ok: true; id: number };
    expect(await flights(made.id)).toHaveLength(1);
    const lonely = (await m.life.createTournament(owner, settings(), [{ bottleId: bottles[0]! }])) as { ok: true; id: number };
    expect(await flights(lonely.id)).toHaveLength(0);

    await m.life.updateDraft(owner, made.id, { entries: [{ bottleId: bottles[0]! }] });
    expect(await flights(made.id)).toHaveLength(0);
    await m.life.updateDraft(owner, made.id, { entries: bottles.slice(0, 3).map((bottleId) => ({ bottleId })) });
    expect(await flights(made.id)).toHaveLength(1);
    // A settings change on a draft that somehow has no preview also makes one.
    await m.sql(`DELETE FROM tournament_heats WHERE tournament_id = $1`, made.id);
    await m.life.updateDraft(owner, made.id, { heatSize: 2 });
    expect((await flights(made.id)).map((h) => h.entries.length)).toEqual([2, 1]);
    // Starting keeps the preview it finds, and still works without one.
    const before = (await flights(made.id)).map((h) => h.id);
    await m.transitions.startTournament(owner, made.id);
    expect((await flights(made.id)).map((h) => h.id)).toEqual(before);
    const bare = (await m.life.createTournament(owner, settings(), bottleEntries())) as { ok: true; id: number };
    await m.sql(`DELETE FROM tournament_heats WHERE tournament_id = $1`, bare.id);
    expect(await m.transitions.startTournament(owner, bare.id)).toMatchObject({ ok: true });
    expect(await flights(bare.id)).not.toHaveLength(0);
  });

  it("refuses to start with fewer than two entries, and lists tournaments with their progress", async () => {
    const one = (await m.life.createTournament(owner, settings({ name: "Lonely" }), [{ bottleId: bottles[0]! }])) as { ok: true; id: number };
    expect(await m.transitions.startTournament(owner, one.id)).toMatchObject({ ok: false, status: 422 });
    expect(await m.transitions.resetRound(owner, one.id)).toMatchObject({ ok: false, status: 422 });
    const list = await m.queries.listTournaments(owner);
    const row = list.find((t) => t.id === one.id)!;
    expect(row).toMatchObject({ name: "Lonely", status: "draft", entryCount: 1, currentRound: null, totalRounds: 0, progress: { done: 0, total: 0 } });
    const running = (await m.life.createTournament(owner, settings({ name: "Running" }), bottleEntries())) as { ok: true; id: number };
    await m.transitions.startTournament(owner, running.id);
    expect((await m.queries.listTournaments(owner)).find((t) => t.id === running.id)).toMatchObject({ status: "active", currentRound: 1, totalRounds: 2, progress: { done: 0, total: 2 } });
    expect(await m.queries.listTournaments(other)).toEqual([]);
  });

  it("shuffles instead of matching when seeding is random", async () => {
    const made = (await m.life.createTournament(owner, settings({ seeding: "random", heatSize: 3 }), bottleEntries())) as { ok: true; id: number };
    const res = await m.transitions.resetRound(owner, made.id);
    const view = (res as { view: import("../view").TournamentView }).view;
    expect(view.rounds[0]!.heats.map((h) => h.entries.length)).toEqual([3, 3]);
    expect(view.rounds[0]!.heats.flatMap((h) => h.entries).map((e) => e.entryId).sort((x, y) => x - y)).toEqual(view.entries.map((e) => e.id).sort((x, y) => x - y));
  });

  it("follows a label that is merged into another: the entries of its bottles and of the label itself move with it", async () => {
    const source = await fx.mkLabel(owner, cat.whiskey, "Merged away", { proof: 90 });
    const survivor = await fx.mkLabel(owner, cat.whiskey, "Survivor", { proof: 90 });
    const bottle = await fx.mkBottle(owner, source);
    const made = (await m.life.createTournament(owner, settings(), [{ bottleId: bottle }, { expressionId: source }, { bottleId: bottles[0]! }])) as { ok: true; id: number };

    const { mergeLabels } = await import("../../expressions/merge");
    await mergeLabels(owner, source, survivor, []);

    const view = (await m.queries.getTournament(owner, made.id))!;
    expect(view.entries.map((e) => [e.kind, e.bottleId, e.expressionId]).slice(0, 2)).toEqual([
      ["bottle", bottle, survivor],
      ["label", null, survivor],
    ]);
  });

  it("keeps the history when a bottle is deleted: its entry stays on the label, and the same bottle cannot enter twice", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Doomed", { proof: 88 });
    const bottle = await fx.mkBottle(owner, label);
    const made = (await m.life.createTournament(owner, settings(), [{ bottleId: bottle }, { bottleId: bottles[0]! }])) as { ok: true; id: number };
    await expect(m.sql(`INSERT INTO tournament_entries (tournament_id, owner_id, bottle_id, expression_id, display_name) VALUES ($1, $2, $3, $4, 'dup')`, made.id, owner, bottle, label)).rejects.toThrow();
    await m.sql(`DELETE FROM bottles WHERE id = $1`, bottle);
    const entry = (await m.queries.getTournament(owner, made.id))!.entries.find((e) => e.name.includes("Doomed"))!;
    expect(entry).toMatchObject({ kind: "label", bottleId: null, expressionId: label });
    await m.sql(`DELETE FROM expressions WHERE id = $1`, label);
    const orphan = (await m.queries.getTournament(owner, made.id))!.entries.find((e) => e.name.includes("Doomed"))!;
    expect(orphan).toMatchObject({ kind: "adhoc", expressionId: null });
  });
});
