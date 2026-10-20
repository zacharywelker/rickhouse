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

  it("draws a flight once: asking again returns the same flight and letters until it is recorded", async () => {
    const made = (await m.life.createTournament(owner, settings({ blind: true, heatSize: 3 }), bottleEntries())) as { ok: true; id: number };
    await m.life.startTournament(owner, made.id);
    const first = (await m.heats.drawHeat(owner, made.id)) as { ok: true; heat: import("../heats").DrawnHeat };
    const again = (await m.heats.drawHeat(owner, made.id)) as { ok: true; heat: import("../heats").DrawnHeat };
    expect(again).toEqual(first);
    const glasses = first.heat.glasses.map((g) => g.glass);
    expect((await m.heats.recordHeat(owner, made.id, first.heat.heatId, { glasses }, owner)).ok).toBe(true);
    const next = (await m.heats.drawHeat(owner, made.id)) as { ok: true; heat: import("../heats").DrawnHeat };
    expect(next.ok).toBe(true);
    expect(next.heat.heatId).not.toBe(first.heat.heatId);
  });

  it("opens a chosen flight for pouring, keeping its letters, and refuses what cannot be opened", async () => {
    const made = (await m.life.createTournament(owner, settings({ blind: true, heatSize: 3 }), bottleEntries())) as { ok: true; id: number };
    const elsewhere = (await m.life.createTournament(owner, settings({ blind: true, heatSize: 3 }), bottleEntries())) as { ok: true; id: number };
    expect(await m.heats.drawHeat(owner, made.id, 1)).toMatchObject({ ok: false, status: 409 });
    await m.life.startTournament(owner, made.id);
    await m.life.startTournament(owner, elsewhere.id);
    const view = (await m.queries.getTournament(owner, made.id))!;
    const target = view.rounds[0]!.heats[1]!;
    const opened = (await m.heats.drawHeat(owner, made.id, target.id)) as { ok: true; heat: import("../heats").DrawnHeat };
    expect(opened.heat.heatId).toBe(target.id);
    const again = (await m.heats.drawHeat(owner, made.id, target.id)) as { ok: true; heat: import("../heats").DrawnHeat };
    expect(again).toEqual(opened);
    const seen = (await m.queries.getTournament(owner, made.id))!.rounds[0]!.heats.find((h) => h.id === target.id)!;
    expect(seen).toMatchObject({ hidden: true, glasses: opened.heat.glasses.map((g) => g.glass) });

    const foreign = (await m.queries.getTournament(owner, elsewhere.id))!.rounds[0]!.heats[0]!;
    expect(await m.heats.drawHeat(owner, made.id, foreign.id)).toMatchObject({ ok: false, status: 404 });
    expect(await m.heats.drawHeat(other, made.id, target.id)).toMatchObject({ ok: false, status: 404 });
    expect(await m.heats.drawHeat(owner, made.id, 2_000_000_000)).toMatchObject({ ok: false, status: 404 });

    const glasses = opened.heat.glasses.map((g) => g.glass);
    expect((await m.heats.recordHeat(owner, made.id, target.id, { glasses }, owner)).ok).toBe(true);
    expect(await m.heats.drawHeat(owner, made.id, target.id)).toMatchObject({ ok: false, status: 409 });
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

  it("removes a bottle from a draft: the flight shrinks to a bye or disappears, other flights keep their names, fewer than two clears the preview", async () => {
    type V = import("../view").TournamentView;
    const shape = (v: V) => v.rounds[0]!.heats.map((h) => [h.entries.length, h.status]);
    const made = (await m.life.createTournament(owner, settings({ heatSize: 3 }), bottles.slice(0, 4).map((bottleId) => ({ bottleId })))) as { ok: true; id: number };
    let view = (await m.queries.getTournament(owner, made.id))!;
    expect(shape(view)).toEqual([[3, "pending"], [1, "bye"]]);
    const [full] = view.rounds[0]!.heats;

    // Three become two, still pending; the entry is gone from the field too.
    const first = (await m.heats.removeDraftEntry(owner, made.id, full!.entries[0]!.entryId)) as { ok: true; view: V };
    expect(first.ok).toBe(true);
    expect(shape(first.view)).toEqual([[2, "pending"], [1, "bye"]]);
    expect(first.view.entries.map((e) => e.id)).not.toContain(full!.entries[0]!.entryId);
    expect(first.view.entries).toHaveLength(3);

    // Two become one: a bye.
    const second = (await m.heats.removeDraftEntry(owner, made.id, full!.entries[1]!.entryId)) as { ok: true; view: V };
    expect(shape(second.view)).toEqual([[1, "bye"], [1, "bye"]]);

    // Emptying a flight removes it (its slot is simply left empty): 3 bottles in 3,1 -> remove the bye's.
    const roomy = (await m.life.createTournament(owner, settings({ heatSize: 3 }), bottles.slice(0, 4).map((bottleId) => ({ bottleId })))) as { ok: true; id: number };
    const rv = (await m.queries.getTournament(owner, roomy.id))!;
    const emptied = (await m.heats.removeDraftEntry(owner, roomy.id, rv.rounds[0]!.heats[1]!.entries[0]!.entryId)) as { ok: true; view: V };
    expect(shape(emptied.view)).toEqual([[3, "pending"]]);
    expect(emptied.view.rounds[0]!.heats[0]!.id).toBe(rv.rounds[0]!.heats[0]!.id);

    // The last two: one removal leaves a single entry and no preview.
    const last = (await m.heats.removeDraftEntry(owner, made.id, full!.entries[2]!.entryId)) as { ok: true; view: V };
    expect(last.view.rounds).toEqual([]);
    expect(last.view.entries).toHaveLength(1);
    view = (await m.queries.getTournament(owner, made.id))!;
    expect(view.rounds).toEqual([]);

    // With six bottles in two flights, a name given to the other flight and its members survive a removal.
    const six = (await m.life.createTournament(owner, settings({ heatSize: 3 }), bottles.slice(0, 6).map((bottleId) => ({ bottleId })))) as { ok: true; id: number };
    view = (await m.queries.getTournament(owner, six.id))!;
    const [a, b] = view.rounds[0]!.heats;
    await m.heats.renameHeat(owner, six.id, a!.id, "My shelf");
    const kept = (await m.heats.removeDraftEntry(owner, six.id, b!.entries[0]!.entryId)) as { ok: true; view: V };
    expect(kept.view.rounds[0]!.heats.map((h) => [h.id, h.label, h.entries.map((e) => e.entryId)])).toEqual([
      [a!.id, "My shelf", a!.entries.map((e) => e.entryId)],
      [b!.id, null, b!.entries.slice(1).map((e) => e.entryId)],
    ]);

    // Refusals: a started tournament (409), a stranger (404), an entry of another tournament or none (404).
    await m.life.startTournament(owner, six.id);
    expect(await m.heats.removeDraftEntry(owner, six.id, a!.entries[0]!.entryId)).toMatchObject({ ok: false, status: 409 });
    const draft = (await m.life.createTournament(owner, settings({ heatSize: 3 }), bottles.slice(0, 3).map((bottleId) => ({ bottleId })))) as { ok: true; id: number };
    const dv = (await m.queries.getTournament(owner, draft.id))!;
    const mine = dv.rounds[0]!.heats[0]!.entries[0]!.entryId;
    expect(await m.heats.removeDraftEntry(other, draft.id, mine)).toMatchObject({ ok: false, status: 404 });
    expect(await m.heats.removeDraftEntry(owner, draft.id, a!.entries[0]!.entryId)).toMatchObject({ ok: false, status: 404 });
    expect(await m.heats.removeDraftEntry(owner, draft.id, 999999)).toMatchObject({ ok: false, status: 404 });
    expect(await m.heats.removeDraftEntry(owner, 999999, mine)).toMatchObject({ ok: false, status: 404 });
    expect((await m.queries.getTournament(owner, draft.id))!.entries).toHaveLength(3);
  });

  it("reorders the flights of a round: first, last, same slot, range, decided refused, stranger, blind, names travel", async () => {
    type V = import("../view").TournamentView;
    const order = (v: V) => v.rounds[0]!.heats.map((h) => h.id);
    const slots = (v: V) => v.rounds[0]!.heats.map((h) => h.slot);
    const made = (await m.life.createTournament(owner, settings({ heatSize: 2 }), bottleEntries())) as { ok: true; id: number };
    let view = (await m.queries.getTournament(owner, made.id))!;
    const [a, b, c] = order(view) as [number, number, number];
    expect(order(view)).toHaveLength(3);
    await m.heats.renameHeat(owner, made.id, b, "Kept name");
    const move = async (id: number, to: number) => (await m.heats.moveHeat(owner, made.id, id, to)) as { ok: true; view: V };

    // Last slot: the ones in between shift up; slots stay 1..3; the name and bottles travel with the flight.
    const entriesOf = (v: V, id: number) => v.rounds[0]!.heats.find((h) => h.id === id)!.entries.map((e) => e.entryId);
    const before = entriesOf(view, a);
    view = (await move(a, 3)).view;
    expect(order(view)).toEqual([b, c, a]);
    expect(slots(view)).toEqual([1, 2, 3]);
    expect(entriesOf(view, a)).toEqual(before);
    expect(view.rounds[0]!.heats[0]!.label).toBe("Kept name");
    // First slot.
    view = (await move(a, 1)).view;
    expect(order(view)).toEqual([a, b, c]);
    // Same slot: a no-op.
    view = (await move(b, 2)).view;
    expect(order(view)).toEqual([a, b, c]);
    expect(slots(view)).toEqual([1, 2, 3]);
    // Out of range or not an integer: 422, nothing changes.
    for (const bad of [0, 4, -1, 1.5, Number.NaN]) expect(await m.heats.moveHeat(owner, made.id, a, bad)).toMatchObject({ ok: false, status: 422 });
    expect(order((await m.queries.getTournament(owner, made.id))!)).toEqual([a, b, c]);
    // Stranger and unknown ids: 404.
    expect(await m.heats.moveHeat(other, made.id, a, 1)).toMatchObject({ ok: false, status: 404 });
    expect(await m.heats.moveHeat(owner, made.id, 999999, 1)).toMatchObject({ ok: false, status: 404 });
    expect(await m.heats.moveHeat(owner, 999999, a, 1)).toMatchObject({ ok: false, status: 404 });

    // Running: a decided flight cannot be moved, an undecided one can (the decided one shifts over, order preserved).
    await m.life.startTournament(owner, made.id);
    const first = (await m.queries.getTournament(owner, made.id))!.rounds[0]!.heats[0]!;
    expect((await m.heats.recordHeat(owner, made.id, first.id, { ranking: first.entries.map((e) => e.entryId) }, owner)).ok).toBe(true);
    expect(await m.heats.moveHeat(owner, made.id, first.id, 2)).toMatchObject({ ok: false, status: 409 });
    view = (await move(c, 1)).view;
    expect(order(view)).toEqual([c, a, b]);
    expect(slots(view)).toEqual([1, 2, 3]);
    expect(view.rounds[0]!.heats[1]!.status).toBe("decided");

    // A blind running tournament reorders too; a finished one does not.
    const blind = (await m.life.createTournament(owner, settings({ heatSize: 2, blind: true }), bottleEntries())) as { ok: true; id: number };
    await m.life.startTournament(owner, blind.id);
    const bv = (await m.queries.getTournament(owner, blind.id))!;
    const bids = bv.rounds[0]!.heats.map((h) => h.id);
    const moved = (await m.heats.moveHeat(owner, blind.id, bids[0]!, 3)) as { ok: true; view: V };
    expect(moved.ok).toBe(true);
    expect(moved.view.rounds[0]!.heats.map((h) => h.id)).toEqual([bids[1], bids[2], bids[0]]);
    await fx.finish(owner, made.id);
    expect(await m.heats.moveHeat(owner, made.id, c, 1)).toMatchObject({ ok: false, status: 409 });
  });

  it("reorders undecided flights of a running tournament around a decided one: it is never moved by the user, slots stay contiguous", async () => {
    type V = import("../view").TournamentView;
    const made = (await m.life.createTournament(owner, settings({ heatSize: 2 }), bottleEntries())) as { ok: true; id: number };
    await m.life.startTournament(owner, made.id);
    const get = async () => (await m.queries.getTournament(owner, made.id))!;
    const [a, b, c] = (await get()).rounds[0]!.heats.map((h) => h.id) as [number, number, number];
    const decided = (await get()).rounds[0]!.heats[1]!;
    expect((await m.heats.recordHeat(owner, made.id, b, { ranking: decided.entries.map((e) => e.entryId) }, owner)).ok).toBe(true);
    const order = (v: V) => v.rounds[0]!.heats.map((h) => h.id);
    const undecided = (v: V) => v.rounds[0]!.heats.filter((h) => h.status !== "decided").map((h) => h.id);

    // The decided flight itself is refused, and nothing changes.
    expect(await m.heats.moveHeat(owner, made.id, b, 1)).toMatchObject({ ok: false, status: 409 });
    expect(order(await get())).toEqual([a, b, c]);

    // Moving an undecided flight keeps the undecided ones in the order asked, and the decided flight's result untouched.
    const moved = (await m.heats.moveHeat(owner, made.id, c, 1)) as { ok: true; view: V };
    expect(moved.ok).toBe(true);
    expect(undecided(moved.view)).toEqual([c, a]);
    expect(moved.view.rounds[0]!.heats.map((h) => h.slot)).toEqual([1, 2, 3]);
    const after = moved.view.rounds[0]!.heats.find((h) => h.id === b)!;
    expect(after.status).toBe("decided");
    expect(after.entries.map((e) => [e.entryId, e.place])).toEqual(decided.entries.map((e, i) => [e.entryId, i + 1]));
  });

  it("swaps two entries between flights: in a draft, and in a running tournament with the glass letters staying with the places", async () => {
    type V = import("../view").TournamentView;
    const made = (await m.life.createTournament(owner, settings({ heatSize: 3 }), bottleEntries())) as { ok: true; id: number };
    let view = (await m.queries.getTournament(owner, made.id))!;
    const [a, b] = view.rounds[0]!.heats;
    const ids = (v: V) => v.rounds[0]!.heats.map((h) => h.entries.map((e) => e.entryId).sort((x, y) => x - y));
    const before = ids(view);
    const x = a!.entries[0]!.entryId;
    const y = b!.entries[0]!.entryId;

    // Every flight is full, so a move is refused but a swap works; sizes stay.
    expect(await m.heats.moveEntry(owner, made.id, x, b!.id)).toMatchObject({ ok: false, status: 409 });
    const swapped = (await m.heats.swapEntries(owner, made.id, x, y)) as { ok: true; view: V };
    expect(swapped.ok).toBe(true);
    expect(ids(swapped.view)).toEqual([[...before[0]!.filter((e) => e !== x), y].sort((p, q) => p - q), [...before[1]!.filter((e) => e !== y), x].sort((p, q) => p - q)]);

    // Same flight, an entry that is not there, a stranger: refused.
    const [x2, x3] = swapped.view.rounds[0]!.heats[0]!.entries.map((e) => e.entryId);
    expect(await m.heats.swapEntries(owner, made.id, x2!, x3!)).toMatchObject({ ok: false, status: 409 });
    expect(await m.heats.swapEntries(owner, made.id, x2!, 999999)).toMatchObject({ ok: false, status: 404 });
    expect(await m.heats.swapEntries(other, made.id, x2!, y)).toMatchObject({ ok: false, status: 404 });

    // Running, not blind: letters belong to the places.
    await m.life.startTournament(owner, made.id);
    view = (await m.queries.getTournament(owner, made.id))!;
    const [c, d] = view.rounds[0]!.heats;
    const [c1, c2, c3] = c!.entries.map((e) => e.entryId);
    const [d1, d2, d3] = d!.entries.map((e) => e.entryId);
    const letter = async (entry: number) => ((await m.sql(`SELECT glass FROM tournament_heat_entries WHERE entry_id = $1`, entry)) as unknown as { glass: string | null }[])[0]!.glass;
    await m.heats.setGlasses(owner, made.id, c!.id, [c1!, c2!, c3!].map((entryId, i) => ({ entryId, glass: "ABC"[i]! })));
    await m.heats.setGlasses(owner, made.id, d!.id, [d1!, d2!, d3!].map((entryId, i) => ({ entryId, glass: "CAB"[i]! })));
    expect((await m.heats.swapEntries(owner, made.id, c2!, d1!)).ok).toBe(true);
    expect([await letter(c2!), await letter(d1!)]).toEqual(["C", "B"]);
    // One flight lettered and the other not: neither keeps letters.
    await m.heats.setGlasses(owner, made.id, c!.id, [c1!, d1!, c3!].map((entryId, i) => ({ entryId, glass: "ABC"[i]! })));
    await m.sql(`UPDATE tournament_heat_entries SET glass = NULL WHERE heat_id = $1`, d!.id);
    expect((await m.heats.swapEntries(owner, made.id, c1!, d2!)).ok).toBe(true);
    expect([await letter(c1!), await letter(d2!), await letter(c3!)]).toEqual([null, null, null]);

    // A decided flight cannot take part.
    const now = (await m.queries.getTournament(owner, made.id))!.rounds[0]!.heats;
    await m.heats.recordHeat(owner, made.id, now[0]!.id, { ranking: now[0]!.entries.map((e) => e.entryId) }, owner);
    expect(await m.heats.swapEntries(owner, made.id, now[0]!.entries[0]!.entryId, now[1]!.entries[0]!.entryId)).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses a swap in a running blind tournament", async () => {
    const made = (await m.life.createTournament(owner, settings({ blind: true, heatSize: 3 }), bottleEntries())) as { ok: true; id: number };
    // A blind draft is not hidden, so it can be swapped before it starts.
    const draft = (await m.queries.getTournament(owner, made.id))!.rounds[0]!.heats;
    expect((await m.heats.swapEntries(owner, made.id, draft[0]!.entries[0]!.entryId, draft[1]!.entries[0]!.entryId)).ok).toBe(true);
    await m.life.startTournament(owner, made.id);
    const rows = (await m.sql(`SELECT entry_id FROM tournament_heat_entries WHERE tournament_id = $1 ORDER BY heat_id, entry_id`, made.id)) as unknown as { entry_id: number }[];
    expect(await m.heats.swapEntries(owner, made.id, rows[0]!.entry_id, rows[5]!.entry_id)).toMatchObject({ ok: false, status: 409 });
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

  type V = import("../view").TournamentView;
  const four = async (heatSize = 2) => {
    const made = (await m.life.createTournament(owner, settings({ heatSize }), bottles.slice(0, 4).map((bottleId) => ({ bottleId })))) as { ok: true; id: number };
    await m.life.startTournament(owner, made.id);
    return made.id;
  };

  it("changes the grouping priority of a running tournament without regrouping; Reset then uses it; nothing else can change", async () => {
    const made = (await m.life.createTournament(owner, settings({ heatSize: 2 }), bottleEntries())) as { ok: true; id: number };
    await m.life.startTournament(owner, made.id);
    const groups = (v: V) => v.rounds[0]!.heats.map((h) => h.entries.map((e) => e.entryId).sort((a, b) => a - b));
    const before = (await m.queries.getTournament(owner, made.id))!;
    const order = ["mashbill", "proof", "distillery", "age", "finish"];

    const res = (await m.life.updateDraft(owner, made.id, { groupOrder: order })) as { ok: true; view: V };
    expect(res.ok).toBe(true);
    expect(res.view.groupOrder).toEqual(order);
    expect(groups(res.view)).toEqual(groups(before));
    expect(res.view.rounds[0]!.heats.map((h) => h.id)).toEqual(before.rounds[0]!.heats.map((h) => h.id));

    const reset = (await m.life.resetRound(owner, made.id)) as { view: V };
    expect(groups(reset.view)).not.toEqual(groups(before));

    for (const patch of [{ name: "Nope" }, { heatSize: 3 }, { entries: [] }, { groupOrder: order, name: "Nope" }]) {
      expect(await m.life.updateDraft(owner, made.id, patch)).toMatchObject({ ok: false, status: 409, message: "Only a draft can be changed, except the grouping priority." });
    }
    await fx.finish(owner, made.id);
    expect(await m.life.updateDraft(owner, made.id, { groupOrder: order })).toMatchObject({ ok: false, status: 409 });
  });

  it("drops an entry withdrawn after its flight was decided when that result is taken back", async () => {
    // Four and two: the round stays open after the first flight is decided.
    const made = (await m.life.createTournament(owner, settings({ heatSize: 4 }), bottleEntries())) as { ok: true; id: number };
    await m.life.startTournament(owner, made.id);
    const view = (await m.queries.getTournament(owner, made.id))!;
    const [first] = view.rounds[0]!.heats;
    const ids = first!.entries.map((e) => e.entryId);
    await m.heats.recordHeat(owner, made.id, first!.id, { ranking: ids }, owner);
    expect((await m.heats.withdrawEntry(owner, made.id, ids[0]!)).ok).toBe(true);

    const undone = (await m.heats.undoHeat(owner, made.id, first!.id)) as { view: V };
    const heat = undone.view.rounds[0]!.heats.find((h) => h.id === first!.id)!;
    expect(heat.status).toBe("pending");
    expect(heat.entries.map((e) => e.entryId)).toEqual(ids.slice(1));
    expect((await m.heats.recordHeat(owner, made.id, first!.id, { ranking: ids.slice(1) }, owner)).ok).toBe(true);
  });

  it("makes a bye of a taken-back flight whose other entry withdrew", async () => {
    const id = await four(2);
    const view = (await m.queries.getTournament(owner, id))!;
    const [first] = view.rounds[0]!.heats;
    const ids = first!.entries.map((e) => e.entryId);
    await m.heats.recordHeat(owner, id, first!.id, { ranking: ids }, owner);
    await m.heats.withdrawEntry(owner, id, ids[1]!);
    const undone = (await m.heats.undoHeat(owner, id, first!.id)) as { view: V };
    const heat = undone.view.rounds[0]!.heats.find((h) => h.id === first!.id)!;
    expect(heat.status).toBe("bye");
    expect(heat.entries.map((e) => e.entryId)).toEqual([ids[0]]);
  });

  it("sets completedAt when the tournament completes and clears it when the final is taken back", async () => {
    const made = (await m.life.createTournament(owner, settings(), bottleEntries())) as { ok: true; id: number };
    await m.life.startTournament(owner, made.id);
    expect((await m.queries.getTournament(owner, made.id))!.completedAt).toBeNull();
    await fx.finish(owner, made.id);
    const done = (await m.queries.getTournament(owner, made.id))!;
    expect(done.completedAt).not.toBeNull();
    const undone = (await m.heats.undoHeat(owner, made.id, done.rounds[1]!.heats[0]!.id)) as { view: V };
    expect(undone.view.completedAt).toBeNull();
  });

  it("regroups only the undecided flights of the current round when a running tournament is reset", async () => {
    const id = await four(2);
    const view = (await m.queries.getTournament(owner, id))!;
    const [first, second] = view.rounds[0]!.heats;
    await m.heats.recordHeat(owner, id, first!.id, { ranking: first!.entries.map((e) => e.entryId) }, owner);
    const reset = (await m.life.resetRound(owner, id)) as { view: V };
    const heats = reset.view.rounds[0]!.heats;
    const kept = heats.find((h) => h.id === first!.id)!;
    expect(kept.status).toBe("decided");
    expect(kept.entries.map((e) => e.entryId)).toEqual(first!.entries.map((e) => e.entryId));
    const regrouped = heats.filter((h) => h.id !== first!.id);
    expect(regrouped).toHaveLength(1);
    expect(regrouped[0]!.status).toBe("pending");
    expect(regrouped[0]!.entries.map((e) => e.entryId).sort()).toEqual(second!.entries.map((e) => e.entryId).sort());
  });

  it("refuses a result for a flight outside the current round, and glasses that were never set", async () => {
    const id = await four(2);
    const view = (await m.queries.getTournament(owner, id))!;
    for (const h of view.rounds[0]!.heats) await m.heats.recordHeat(owner, id, h.id, { ranking: h.entries.map((e) => e.entryId) }, owner);
    expect((await m.queries.getTournament(owner, id))!.rounds).toHaveLength(2);
    // Force an earlier flight back to pending, which the rules never allow, to reach the guard.
    await m.sql(`UPDATE tournament_heats SET status = 'pending' WHERE id = $1`, view.rounds[0]!.heats[0]!.id);
    const old = view.rounds[0]!.heats[0]!;
    expect(await m.heats.recordHeat(owner, id, old.id, { ranking: old.entries.map((e) => e.entryId) }, owner)).toMatchObject({ ok: false, status: 409 });

    const blind = (await m.life.createTournament(owner, settings({ blind: true, heatSize: 3 }), bottleEntries())) as { ok: true; id: number };
    await m.life.startTournament(owner, blind.id);
    const h = (await m.queries.getTournament(owner, blind.id))!.rounds[0]!.heats[0]!;
    expect(await m.heats.recordHeat(owner, blind.id, h.id, { glasses: ["A", "B", "C"] }, owner)).toMatchObject({ ok: false, status: 422 });
  });

  it("matches an outside entry to a label, and refuses a bottle that belongs to someone else", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Shelf label", { proof: 97 });
    const theirs = (await fx.mkField(other, cat.whiskey, "Theirs")).bottles[0]!;
    const made = (await m.life.createTournament(owner, settings(), [{ bottleId: bottles[0]! }, { name: "Joe's pour" }])) as { ok: true; id: number };
    const adHoc = (await m.queries.getTournament(owner, made.id))!.entries.find((e) => e.kind === "adhoc")!;
    expect(await m.heats.promoteEntry(owner, made.id, adHoc.id, { bottleId: theirs })).toMatchObject({ ok: false, status: 422 });
    const res = await m.heats.promoteEntry(owner, made.id, adHoc.id, { expressionId: label });
    expect(res.ok).toBe(true);
    expect((res as { view: V }).view.entries.find((e) => e.id === adHoc.id)).toMatchObject({ bottleId: null, expressionId: label });
  });

  it("clears a flight's name with an empty string or null", async () => {
    const id = await four(2);
    const heat = (await m.queries.getTournament(owner, id))!.rounds[0]!.heats[0]!;
    for (const blank of ["", null, "   "]) {
      await m.heats.renameHeat(owner, id, heat.id, "Named");
      const res = (await m.heats.renameHeat(owner, id, heat.id, blank)) as { view: V };
      expect(res.view.rounds[0]!.heats[0]!.label).toBeNull();
    }
  });

  it("will not draw a flight unless the tournament is running", async () => {
    const made = (await m.life.createTournament(owner, settings(), bottleEntries())) as { ok: true; id: number };
    expect(await m.heats.drawHeat(owner, made.id)).toMatchObject({ ok: false, status: 409 });
    await m.life.startTournament(owner, made.id);
    await fx.finish(owner, made.id);
    expect(await m.heats.drawHeat(owner, made.id)).toMatchObject({ ok: false, status: 409 });
  });

  describe("flights of 6", () => {
    let thirteen: number[];
    beforeAll(async () => {
      thirteen = [];
      for (let i = 0; i < 13; i++) thirteen.push(await fx.mkBottle(owner, await fx.mkLabel(owner, cat.whiskey, `Six ${i}`, { proof: 90 + i })));
    });
    const entries = () => thirteen.map((bottleId) => ({ bottleId }));

    it("cuts 13 bottles into 6, 6, 1 and plays through to a champion", async () => {
      const made = (await m.life.createTournament(owner, settings({ heatSize: 6 }), entries())) as { ok: true; id: number };
      await m.life.startTournament(owner, made.id);
      let view = (await m.queries.getTournament(owner, made.id))!;
      expect(view.rounds[0]!.heats.map((h) => h.entries.length)).toEqual([6, 6, 1]);
      await fx.finish(owner, made.id);
      view = (await m.queries.getTournament(owner, made.id))!;
      expect(view.status).toBe("complete");
      // 6-way advances 3, 6-way advances 3, the bye advances 1: 7 bottles into round 2, a 6 and a 1; the final has 4.
      expect(view.rounds[1]!.heats.map((h) => h.entries.length)).toEqual([6, 1]);
      expect(view.champion).not.toBeNull();
    });

    it("draws a blind 6-glass flight with letters A to F and records a 6-way result by glass", async () => {
      const made = (await m.life.createTournament(owner, settings({ heatSize: 6, blind: true }), entries())) as { ok: true; id: number };
      await m.life.startTournament(owner, made.id);
      const drawn = (await m.heats.drawHeat(owner, made.id)) as { ok: true; heat: import("../heats").DrawnHeat };
      expect(drawn.heat.glasses).toHaveLength(6);
      expect(drawn.heat.glasses.map((g) => g.glass).sort()).toEqual(["A", "B", "C", "D", "E", "F"]);
      const order = ["F", "E", "D", "C", "B", "A"];
      const ranked = await m.heats.recordHeat(owner, made.id, drawn.heat.heatId, { glasses: order }, owner);
      expect(ranked.ok).toBe(true);
      const byGlass = new Map(drawn.heat.glasses.map((g) => [g.glass, g.entry.entryId]));
      const decided = (ranked as { view: import("../view").TournamentView }).view.rounds[0]!.heats.find((h) => h.id === drawn.heat.heatId)!;
      expect(decided.entries.map((e) => e.entryId)).toEqual(order.map((g) => byGlass.get(g)));
      expect(await m.heats.setGlasses(owner, made.id, decided.id, order.map((glass, i) => ({ entryId: decided.entries[i]!.entryId, glass })))).toMatchObject({ ok: false, status: 409 });
    });

    it("refuses a heat size of 7 and a glass past F", async () => {
      await expect(m.life.createTournament(owner, settings({ heatSize: 7 }), entries())).rejects.toThrow();
      await expect(m.sql(`INSERT INTO tournaments (owner_id, name, heat_size) VALUES ($1, 'T', 7)`, owner)).rejects.toThrow(/heat_size_check/);
      const made = (await m.life.createTournament(owner, settings({ heatSize: 6, blind: true }), entries())) as { ok: true; id: number };
      await m.life.startTournament(owner, made.id);
      const drawn = (await m.heats.drawHeat(owner, made.id)) as { ok: true; heat: import("../heats").DrawnHeat };
      const rows = drawn.heat.glasses.map((g, i) => ({ entryId: g.entry.entryId, glass: i === 0 ? "G" : g.glass }));
      expect(await m.heats.setGlasses(owner, made.id, drawn.heat.heatId, rows)).toMatchObject({ ok: false, status: 422 });
    });
  });

  it("carries each entry's category and finishes in the roster and in a flight, but never for a hidden flight", async () => {
    const own = await fx.mkUser();
    const cats = await fx.mkCategories();
    const finished = await fx.mkLabel(own, cats.whiskey, "Finished", { proof: 100, finishes: ["Tawny Port", "Madeira"] });
    const plain = await fx.mkLabel(own, cats.whiskey, "Plain", { proof: 101 });
    const entries = [{ bottleId: await fx.mkBottle(own, finished) }, { bottleId: await fx.mkBottle(own, plain) }, { name: "Joe's cask" }];
    const [catRow] = await m.sql<{ name: string }>(`SELECT name FROM categories WHERE id = $1`, cats.whiskey);

    const made = (await m.life.createTournament(own, settings(), entries)) as { ok: true; id: number };
    const view = (await m.queries.getTournament(own, made.id))!;
    const byName = (name: string) => view.entries.find((e) => e.name.includes(name))!;
    expect(byName("Finished")).toMatchObject({ category: catRow!.name, finishes: [expect.stringContaining("Tawny Port"), expect.stringContaining("Madeira")] });
    expect(byName("Plain")).toMatchObject({ category: catRow!.name, finishes: [] });
    expect(byName("Joe's cask")).toMatchObject({ category: null, finishes: [] });
    const inHeat = view.rounds[0]!.heats[0]!.entries.find((e) => e.name.includes("Finished"))!;
    expect(inHeat.category).toBe(catRow!.name);
    expect(inHeat.finishes).toHaveLength(2);

    const blind = (await m.life.createTournament(own, settings({ blind: true }), entries)) as { ok: true; id: number };
    await m.life.startTournament(own, blind.id);
    const hidden = (await m.queries.getTournament(own, blind.id))!;
    expect(hidden.rounds[0]!.heats.every((h) => h.hidden && h.entries.length === 0)).toBe(true);
    const { entries: _roster, ...rest } = hidden;
    expect(JSON.stringify(rest)).not.toMatch(/Tawny Port|Madeira|"category"/);
  });
});
