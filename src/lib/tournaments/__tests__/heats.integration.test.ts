import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, fixtures, settings, url, type Cat, type Db, type Fixtures } from "./fixtures";

describe.skipIf(!url)("tournament flights against a real database", () => {
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

  it("runs a tournament to its champion: round 1, the next round made from the advancers, then the final", async () => {
    const made = (await m.life.createTournament(owner, settings(), bottleEntries())) as { ok: true; id: number };
    expect(await m.life.startTournament(owner, made.id)).toMatchObject({ ok: true });
    let view = (await m.queries.getTournament(owner, made.id))!;
    expect(view.status).toBe("active");
    expect(view.rounds[0]!.heats.map((h) => h.entries.length)).toEqual([4, 2]);

    await fx.finish(owner, made.id);
    view = (await m.queries.getTournament(owner, made.id))!;
    expect(view.status).toBe("complete");
    expect(view.rounds.map((r) => r.heats.length)).toEqual([2, 1]);
    // Round 2 holds the top two of the four-way heat and the winner of the two-way heat.
    expect(view.rounds[1]!.heats[0]!.entries).toHaveLength(3);
    expect(view.champion).not.toBeNull();
    expect(view.standings[0]).toMatchObject({ rank: 1 });
  });

  it("takes a result back until the next round has one, and a finished tournament runs again", async () => {
    const made = (await m.life.createTournament(owner, settings(), bottleEntries())) as { ok: true; id: number };
    await m.life.startTournament(owner, made.id);
    await fx.finish(owner, made.id);
    const done = (await m.queries.getTournament(owner, made.id))!;
    const final = done.rounds[1]!.heats[0]!;
    const round1 = done.rounds[0]!.heats[0]!;

    expect(await m.heats.undoHeat(owner, made.id, round1.id)).toMatchObject({ ok: false, status: 409 });
    const undone = await m.heats.undoHeat(owner, made.id, final.id);
    expect(undone).toMatchObject({ ok: true });
    let view = (undone as { view: import("../view").TournamentView }).view;
    expect(view.status).toBe("active");
    expect(view.champion).toBeNull();
    expect(view.rounds[1]!.heats[0]!.status).toBe("pending");

    // Now round 2's only heat has no result, so round 1 can be taken back, which discards round 2.
    const again = await m.heats.undoHeat(owner, made.id, round1.id);
    expect(again).toMatchObject({ ok: true });
    view = (again as { view: import("../view").TournamentView }).view;
    expect(view.rounds).toHaveLength(1);
    expect(view.rounds[0]!.heats[0]!.status).toBe("pending");
  });

  it("finishes after a final of four, which advances two, without playing another round", async () => {
    const more: number[] = [...bottles];
    for (const proof of [102, 104]) more.push(await fx.mkBottle(owner, await fx.mkLabel(owner, cat.whiskey, `Extra ${proof}`, { proof })));
    const made = (await m.life.createTournament(owner, settings({ heatSize: 4 }), more.map((bottleId) => ({ bottleId })))) as { ok: true; id: number };
    await m.life.startTournament(owner, made.id);
    await fx.finish(owner, made.id);
    const view = (await m.queries.getTournament(owner, made.id))!;
    expect(view.rounds.map((r) => r.heats.map((h) => h.entries.length))).toEqual([[4, 4], [4]]);
    expect(view.status).toBe("complete");
    expect(view.champion).not.toBeNull();
  });

  it("completes with the one entry left standing when the others withdraw", async () => {
    const made = (await m.life.createTournament(owner, settings({ heatSize: 2 }), bottles.slice(0, 2).map((bottleId) => ({ bottleId })))) as { ok: true; id: number };
    await m.life.startTournament(owner, made.id);
    const view = (await m.queries.getTournament(owner, made.id))!;
    const res = await m.heats.withdrawEntry(owner, made.id, view.entries[1]!.id);
    const after = (res as { view: import("../view").TournamentView }).view;
    expect(after.status).toBe("complete");
    expect(after.rounds[0]!.heats[0]!.status).toBe("bye");
  });

  it("withdraws an entry: its flight shrinks, becomes a bye at one, and the round moves on when nothing is left pending", async () => {
    const made = (await m.life.createTournament(owner, settings({ heatSize: 2 }), bottles.slice(0, 4).map((bottleId) => ({ bottleId })))) as { ok: true; id: number };
    await m.life.startTournament(owner, made.id);
    let view = (await m.queries.getTournament(owner, made.id))!;
    const [first, second] = view.rounds[0]!.heats;
    expect(view.rounds[0]!.heats.map((h) => h.entries.length)).toEqual([2, 2]);

    // Decide the first flight, then withdraw one of the second: the second becomes a bye and the round is done.
    await m.heats.recordHeat(owner, made.id, first!.id, { ranking: first!.entries.map((e) => e.entryId) }, owner);
    const gone = second!.entries[0]!.entryId;
    const res = await m.heats.withdrawEntry(owner, made.id, gone);
    expect(res.ok).toBe(true);
    view = (res as { view: import("../view").TournamentView }).view;
    expect(view.rounds[0]!.heats[1]!.status).toBe("bye");
    expect(view.entries.find((e) => e.id === gone)!.status).toBe("withdrawn");
    // The winner of flight one and the survivor of the bye meet in the final.
    expect(view.rounds).toHaveLength(2);
    expect(view.rounds[1]!.heats[0]!.entries).toHaveLength(2);
    expect(await m.heats.withdrawEntry(owner, made.id, gone)).toMatchObject({ ok: false, status: 409 });
    expect(await m.heats.withdrawEntry(other, made.id, gone)).toMatchObject({ ok: false, status: 404 });
  });

  it("hides a blind tournament's pending flights, draws a flight for the pourer, and takes the ranking by glass", async () => {
    const made = (await m.life.createTournament(owner, settings({ blind: true, heatSize: 3 }), bottleEntries())) as { ok: true; id: number };
    const started = await m.life.startTournament(owner, made.id);
    const view = (started as { view: import("../view").TournamentView }).view;
    for (const heat of view.rounds[0]!.heats) {
      expect(heat).toMatchObject({ hidden: true, entries: [], autoLabel: null });
      expect(heat.band).not.toBe("");
    }
    expect(JSON.stringify(view.rounds)).not.toMatch(/Label \d/);

    const drawn = await m.heats.drawHeat(owner, made.id);
    expect(drawn.ok).toBe(true);
    const heat = (drawn as { heat: import("../heats").DrawnHeat }).heat;
    expect(heat.glasses.map((g) => g.glass)).toEqual(["A", "B", "C"]);
    expect(heat.glasses.every((g) => /Label \d/.test(g.entry.name))).toBe(true);

    // The taster still sees only letters, now set; ranking them reveals the heat.
    const seen = (await m.queries.getTournament(owner, made.id))!.rounds[0]!.heats.find((h) => h.id === heat.heatId)!;
    expect(seen).toMatchObject({ hidden: true, glasses: ["A", "B", "C"], entries: [] });
    expect(await m.heats.recordHeat(owner, made.id, heat.heatId, { glasses: ["A", "A", "B"] }, owner)).toMatchObject({ ok: false, status: 422 });
    const ranked = await m.heats.recordHeat(owner, made.id, heat.heatId, { glasses: ["B", "C", "A"] }, owner);
    expect(ranked.ok).toBe(true);
    const decided = (ranked as { view: import("../view").TournamentView }).view.rounds[0]!.heats.find((h) => h.id === heat.heatId)!;
    expect(decided.hidden).toBe(false);
    const byGlass = new Map(heat.glasses.map((g) => [g.glass, g.entry.entryId]));
    expect(decided.entries.map((e) => e.entryId)).toEqual([byGlass.get("B"), byGlass.get("C"), byGlass.get("A")]);

    // A blind running tournament cannot have its hidden flights edited by hand.
    const other = (ranked as { view: import("../view").TournamentView }).view.rounds[0]!.heats.find((h) => h.status === "pending")!;
    expect(await m.heats.moveEntry(owner, made.id, decided.entries[0]!.entryId, other.id)).toMatchObject({ ok: false, status: 409 });
  });

  it("sets glasses by hand for a solo heat and refuses a bad assignment", async () => {
    const made = (await m.life.createTournament(owner, settings({ blind: true }), bottleEntries())) as { ok: true; id: number };
    await m.life.startTournament(owner, made.id);
    const drawn = (await m.heats.drawHeat(owner, made.id)) as { ok: true; heat: import("../heats").DrawnHeat };
    const ids = drawn.heat.glasses.map((g) => g.entry.entryId);
    expect(await m.heats.setGlasses(owner, made.id, drawn.heat.heatId, ids.map((entryId) => ({ entryId, glass: "A" })))).toMatchObject({ ok: false, status: 422 });
    expect(await m.heats.setGlasses(owner, made.id, drawn.heat.heatId, ids.map((entryId, i) => ({ entryId, glass: "ABCD"[i]! })))).toMatchObject({ ok: true });
    const res = await m.heats.recordHeat(owner, made.id, drawn.heat.heatId, { glasses: ["D", "C", "B", "A"].filter((g) => "ABCD".slice(0, ids.length).includes(g)) }, owner);
    expect(res.ok).toBe(true);
  });

  it("moves bottles between flights in a draft, renames a flight, and resets to the automatic grouping (clearing names)", async () => {
    const made = (await m.life.createTournament(owner, settings({ heatSize: 3 }), bottleEntries())) as { ok: true; id: number };
    await m.life.resetRound(owner, made.id);
    let view = (await m.queries.getTournament(owner, made.id))!;
    const [a, b] = view.rounds[0]!.heats;
    const original = view.rounds[0]!.heats.map((h) => h.entries.map((e) => e.entryId));

    // Both flights are full (three of three), so neither takes another bottle.
    expect(await m.heats.moveEntry(owner, made.id, b!.entries[0]!.entryId, a!.id)).toMatchObject({ ok: false, status: 409 });
    expect(await m.heats.moveEntry(owner, made.id, a!.entries[2]!.entryId, b!.id)).toMatchObject({ ok: false, status: 409 });

    const named = await m.heats.renameHeat(owner, made.id, a!.id, "  My shelf  ");
    expect(named.ok).toBe(true);
    view = (named as { view: import("../view").TournamentView }).view;
    expect(view.rounds[0]!.heats[0]!.label).toBe("My shelf");
    expect(await m.heats.renameHeat(owner, made.id, a!.id, "x".repeat(81))).toMatchObject({ ok: false, status: 422 });

    const reset = await m.life.resetRound(owner, made.id);
    view = (reset as { view: import("../view").TournamentView }).view;
    expect(view.rounds[0]!.heats.map((h) => h.entries.map((e) => e.entryId))).toEqual(original);
    expect(view.rounds[0]!.heats.every((h) => h.label === null)).toBe(true);
  });

  it("moves an entry into a flight with room; a flight left with one becomes a bye, and one left with none disappears", async () => {
    const made = (await m.life.createTournament(owner, settings({ heatSize: 3 }), bottles.slice(0, 4).map((bottleId) => ({ bottleId })))) as { ok: true; id: number };
    await m.life.resetRound(owner, made.id);
    let view = (await m.queries.getTournament(owner, made.id))!;
    expect(view.rounds[0]!.heats.map((h) => [h.entries.length, h.status])).toEqual([[3, "pending"], [1, "bye"]]);
    const [full, lone] = view.rounds[0]!.heats;

    // The bye has room, so a third bottle can join it; the first flight is left with two.
    const joined = await m.heats.moveEntry(owner, made.id, full!.entries[0]!.entryId, lone!.id);
    view = (joined as { view: import("../view").TournamentView }).view;
    expect(view.rounds[0]!.heats.map((h) => [h.entries.length, h.status])).toEqual([[2, "pending"], [2, "pending"]]);

    // Moving the bye's only bottle out removes the flight it leaves.
    const [a, b] = view.rounds[0]!.heats;
    await m.heats.moveEntry(owner, made.id, b!.entries[0]!.entryId, a!.id);
    view = (await m.queries.getTournament(owner, made.id))!;
    expect(view.rounds[0]!.heats.map((h) => [h.entries.length, h.status])).toEqual([[3, "pending"], [1, "bye"]]);
    expect(await m.heats.moveEntry(owner, made.id, view.rounds[0]!.heats[0]!.entries[0]!.entryId, view.rounds[0]!.heats[0]!.id)).toMatchObject({ ok: false, status: 409 });
    expect(await m.heats.moveEntry(owner, made.id, 999999, view.rounds[0]!.heats[0]!.id)).toMatchObject({ ok: false, status: 404 });
  });

  it("matches an outside entry to a bottle, once, and not an entry that already has one", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Outside", { proof: 99 });
    const bottle = await fx.mkBottle(owner, label);
    const made = (await m.life.createTournament(owner, settings(), [{ bottleId: bottles[0]! }, { name: "Joe's pour" }])) as { ok: true; id: number };
    const view = (await m.queries.getTournament(owner, made.id))!;
    const adHoc = view.entries.find((e) => e.kind === "adhoc")!;
    const bottled = view.entries.find((e) => e.kind === "bottle")!;
    expect(await m.heats.promoteEntry(owner, made.id, bottled.id, { bottleId: bottle })).toMatchObject({ ok: false, status: 409 });
    expect(await m.heats.promoteEntry(owner, made.id, adHoc.id, { bottleId: 987654321 })).toMatchObject({ ok: false, status: 422 });
    const res = await m.heats.promoteEntry(owner, made.id, adHoc.id, { bottleId: bottle });
    expect(res.ok).toBe(true);
    const promoted = (res as { view: import("../view").TournamentView }).view.entries.find((e) => e.id === adHoc.id)!;
    expect(promoted).toMatchObject({ kind: "bottle", bottleId: bottle, expressionId: label, name: "Joe's pour" });
    // The same bottle cannot be matched twice.
    const second = await m.life.createTournament(owner, settings(), [{ bottleId: bottle }, { name: "Again" }]);
    const again = (await m.queries.getTournament(owner, (second as { id: number }).id))!;
    expect(await m.heats.promoteEntry(owner, again.id, again.entries.find((e) => e.kind === "adhoc")!.id, { bottleId: bottle })).toMatchObject({ ok: false, status: 409 });
  });

  it("records a flight once even when two requests arrive together", async () => {
    const made = (await m.life.createTournament(owner, settings(), bottleEntries())) as { ok: true; id: number };
    await m.life.startTournament(owner, made.id);
    const heat = (await m.queries.getTournament(owner, made.id))!.rounds[0]!.heats[0]!;
    const ids = heat.entries.map((e) => e.entryId);
    const reversed = [...ids].reverse();
    const both = await Promise.all([
      m.heats.recordHeat(owner, made.id, heat.id, { ranking: ids }, owner),
      m.heats.recordHeat(owner, made.id, heat.id, { ranking: reversed }, owner),
    ]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.find((r) => !r.ok)).toMatchObject({ ok: false, status: 409 });
    const decided = (await m.queries.getTournament(owner, made.id))!.rounds[0]!.heats[0]!;
    expect(decided.entries.map((e) => e.place)).toEqual([1, 2, 3, 4]);
  });

  it("does not find a flight or an entry that belongs to another tournament", async () => {
    const one = (await m.life.createTournament(owner, settings(), bottleEntries())) as { ok: true; id: number };
    const two = (await m.life.createTournament(owner, settings(), bottleEntries())) as { ok: true; id: number };
    await m.life.startTournament(owner, one.id);
    await m.life.startTournament(owner, two.id);
    const heatOfTwo = (await m.queries.getTournament(owner, two.id))!.rounds[0]!.heats[0]!;
    const entryOfTwo = heatOfTwo.entries[0]!.entryId;
    expect(await m.heats.recordHeat(owner, one.id, heatOfTwo.id, { ranking: heatOfTwo.entries.map((e) => e.entryId) }, owner)).toMatchObject({ ok: false, status: 404 });
    expect(await m.heats.renameHeat(owner, one.id, heatOfTwo.id, "x")).toMatchObject({ ok: false, status: 404 });
    expect(await m.heats.withdrawEntry(owner, one.id, entryOfTwo)).toMatchObject({ ok: false, status: 404 });
    expect(await m.heats.moveEntry(owner, one.id, entryOfTwo, heatOfTwo.id)).toMatchObject({ ok: false, status: 404 });
  });

  it("plays a field of 60 to its end", { timeout: 60000 }, async () => {
    const many: number[] = [];
    for (let i = 0; i < 60; i++) many.push(await fx.mkBottle(owner, await fx.mkLabel(owner, cat.whiskey, `Crowd ${i}`, { proof: 80 + (i % 50), style: i % 3 === 0 ? "High Rye" : "Low Rye" })));
    const made = (await m.life.createTournament(owner, settings({ heatSize: 3 }), many.map((bottleId) => ({ bottleId })))) as { ok: true; id: number };
    const started = Date.now();
    await m.life.startTournament(owner, made.id);
    await fx.finish(owner, made.id);
    const view = (await m.queries.getTournament(owner, made.id))!;
    expect(view.status).toBe("complete");
    expect(view.rounds.map((r) => r.heats.length)).toEqual(view.plan);
    expect(Date.now() - started).toBeLessThan(40000);
  });

  it("edits a draft: settings and the whole field, and the preview follows; a started tournament cannot be edited or deleted", async () => {
    const made = (await m.life.createTournament(owner, settings({ heatSize: 4 }), bottleEntries())) as { ok: true; id: number };
    await m.life.resetRound(owner, made.id);
    const res = await m.life.updateDraft(owner, made.id, { heatSize: 2, name: "Renamed" });
    const view = (res as { view: import("../view").TournamentView }).view;
    expect(view).toMatchObject({ name: "Renamed", heatSize: 2 });
    expect(view.rounds[0]!.heats.map((h) => h.entries.length)).toEqual([2, 2, 2]);
    const fewer = await m.life.updateDraft(owner, made.id, { entries: bottles.slice(0, 3).map((bottleId) => ({ bottleId })) });
    expect((fewer as { view: import("../view").TournamentView }).view.rounds[0]!.heats.map((h) => h.entries.length)).toEqual([2, 1]);

    expect(await m.life.startTournament(owner, made.id)).toMatchObject({ ok: true });
    expect(await m.life.updateDraft(owner, made.id, { name: "Nope" })).toMatchObject({ ok: false, status: 409 });
    expect(await m.life.deleteTournament(owner, made.id)).toMatchObject({ ok: false, status: 409 });
    await fx.finish(owner, made.id);
    expect(await m.life.deleteTournament(other, made.id)).toMatchObject({ ok: false, status: 404 });
    expect(await m.life.deleteTournament(owner, made.id)).toMatchObject({ ok: true });
    expect(await m.queries.getTournament(owner, made.id)).toBeNull();
  });

  it("refuses a result that does not rank every bottle once", async () => {
    const made = (await m.life.createTournament(owner, settings(), bottleEntries())) as { ok: true; id: number };
    await m.life.startTournament(owner, made.id);
    const heat = (await m.queries.getTournament(owner, made.id))!.rounds[0]!.heats[0]!;
    const ids = heat.entries.map((e) => e.entryId);
    expect(await m.heats.recordHeat(owner, made.id, heat.id, { ranking: ids.slice(1) }, owner)).toMatchObject({ ok: false, status: 422 });
    expect(await m.heats.recordHeat(owner, made.id, heat.id, { ranking: [ids[0]!, ids[0]!, ids[2]!, ids[3]!] }, owner)).toMatchObject({ ok: false, status: 422 });
    expect(await m.heats.recordHeat(owner, made.id, heat.id, { ranking: [...ids, 999999] }, owner)).toMatchObject({ ok: false, status: 422 });
    expect(await m.heats.recordHeat(other, made.id, heat.id, { ranking: ids }, other)).toMatchObject({ ok: false, status: 404 });
  });
});
