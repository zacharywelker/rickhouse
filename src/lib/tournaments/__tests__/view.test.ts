import { describe, expect, it } from "vitest";
import { buildView, type EntryRow, type HeatEntryRow, type HeatRow, type TournamentRow } from "../view";
import type { Entrant } from "../types";

const tournament = (over: Partial<TournamentRow> = {}): TournamentRow => ({
  id: 1, name: "Spring", status: "active", heatSize: 4, seeding: "similar",
  groupOrder: ["proof", "mashbill", "distillery", "age", "finish"], blind: false, fieldNote: null,
  createdAt: new Date("2026-10-13T00:00:00Z"), startedAt: new Date("2026-10-13T01:00:00Z"), completedAt: null, ...over,
});
const names = ["Buffalo Trace", "Eagle Rare", "Weller 12", "Blanton's", "Booker's", "Elijah Craig"];
const entries: EntryRow[] = names.map((displayName, i) => ({ id: i + 1, displayName, status: "active", bottleId: i + 1, expressionId: i + 1, seed: i }));
const entrants = new Map<number, Entrant>(
  entries.map((e, i) => [e.id, { id: e.id, name: e.displayName, proof: 90 + i * 2, mashbill: { kind: "generic", style: "High Rye" }, distilleries: ["Buffalo Trace"], ageYears: null, finishes: [] }]),
);
const input = (t: TournamentRow, heats: HeatRow[], heatEntries: HeatEntryRow[]) => buildView({ tournament: t, entries, heats, heatEntries, entrants });

// Round 1: heat 10 decided (1st 2, 2nd 1, 3rd 4, 4th 3); round 2: heat 20 pending with entries 2, 1.
const heats: HeatRow[] = [
  { id: 10, round: 1, slot: 1, label: null, status: "decided" },
  { id: 20, round: 2, slot: 1, label: "My pour", status: "pending" },
];
const heatEntries: HeatEntryRow[] = [
  { heatId: 10, entryId: 1, place: 2, glass: null }, { heatId: 10, entryId: 2, place: 1, glass: null },
  { heatId: 10, entryId: 3, place: 4, glass: null }, { heatId: 10, entryId: 4, place: 3, glass: null },
  { heatId: 20, entryId: 2, place: null, glass: "B" }, { heatId: 20, entryId: 1, place: null, glass: "A" },
];

describe("buildView", () => {
  it("shows an open tournament in full, decided and pending heats alike", () => {
    const v = input(tournament(), heats, heatEntries);
    expect(v.rounds.map((r) => [r.round, r.heats.length])).toEqual([[1, 1], [2, 1]]);
    const pending = v.rounds[1]!.heats[0]!;
    expect(pending.hidden).toBe(false);
    expect(pending.entries.map((e) => e.name)).toEqual(["Buffalo Trace", "Eagle Rare"]);
    expect(pending.autoLabel).toBe("Buffalo Trace High Rye");
    expect(pending.label).toBe("My pour");
    expect(v.currentRound).toBe(2);
    expect(v.progress).toEqual({ done: 0, total: 1 });
  });

  it("hides a pending heat of an active blind tournament: no names, ids, facts or generated label, only the band and glasses", () => {
    const v = input(tournament({ blind: true }), heats, heatEntries);
    const hidden = v.rounds[1]!.heats[0]!;
    expect(hidden).toMatchObject({ hidden: true, entries: [], autoLabel: null, entryCount: 2, glasses: ["A", "B"], band: "90 to 92 proof", label: "My pour" });
    expect(JSON.stringify(hidden)).not.toMatch(/Buffalo|Eagle|"entryId"/);
  });

  it("reveals a decided heat of a blind tournament", () => {
    const decided = input(tournament({ blind: true }), heats, heatEntries).rounds[0]!.heats[0]!;
    expect(decided.hidden).toBe(false);
    expect(decided.entries.map((e) => [e.name, e.place])).toEqual([["Eagle Rare", 1], ["Buffalo Trace", 2], ["Blanton's", 3], ["Weller 12", 4]]);
  });

  it("does not hide anything in a draft, where the owner is setting the field up", () => {
    const draftHeats: HeatRow[] = [{ id: 10, round: 1, slot: 1, label: null, status: "pending" }];
    const v = input(tournament({ status: "draft", blind: true, startedAt: null }), draftHeats, heatEntries.filter((h) => h.heatId === 10));
    expect(v.rounds[0]!.heats[0]!.hidden).toBe(false);
  });

  it("plans the rounds from the active entries and ranks standings from decided heats", () => {
    const v = input(tournament(), heats, heatEntries);
    expect(v.plan).toEqual([2, 1]);
    expect(v.standings.slice(0, 2).map((s) => [s.name, s.rank])).toEqual([["Eagle Rare", 1], ["Buffalo Trace", 2]]);
    expect(v.champion).toBeNull();
  });

  it("names the champion of a complete tournament", () => {
    const v = input(tournament({ status: "complete", completedAt: new Date() }), [heats[0]!], heatEntries.filter((h) => h.heatId === 10));
    expect(v.champion).toEqual({ entryId: 2, name: "Eagle Rare" });
  });

  it("has no standings before any heat is decided, and an empty plan under two entrants", () => {
    const v = buildView({ tournament: tournament({ status: "draft" }), entries: [entries[0]!], heats: [], heatEntries: [], entrants });
    expect(v).toMatchObject({ standings: [], plan: [], currentRound: null, progress: { done: 0, total: 0 }, rounds: [] });
  });

  it("counts a bye as done and tells the kind of each entry", () => {
    const withAdHoc: EntryRow[] = [...entries.slice(0, 2), { id: 9, displayName: "Joe's cask", status: "active", bottleId: null, expressionId: null, seed: 9 }, { id: 8, displayName: "Friend's", status: "active", bottleId: null, expressionId: 5, seed: 8 }];
    const v = buildView({
      tournament: tournament(), entries: withAdHoc,
      heats: [{ id: 30, round: 1, slot: 1, label: null, status: "bye" }, { id: 31, round: 1, slot: 2, label: null, status: "pending" }],
      heatEntries: [{ heatId: 30, entryId: 9, place: null, glass: null }, { heatId: 31, entryId: 1, place: null, glass: null }, { heatId: 31, entryId: 2, place: null, glass: null }],
      entrants,
    });
    expect(v.progress).toEqual({ done: 1, total: 2 });
    expect(v.entries.map((e) => [e.name, e.kind])).toEqual([["Buffalo Trace", "bottle"], ["Eagle Rare", "bottle"], ["Friend's", "label"], ["Joe's cask", "adhoc"]]);
  });
});
