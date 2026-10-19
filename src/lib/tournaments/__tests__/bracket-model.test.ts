import { describe, expect, it } from "vitest";
import { advanceNote, buildBracketModel, flightTitle, formatAge, plannedRounds, type RoundColumn } from "../bracket-model";
import { planRounds } from "../rounds";
import type { ViewHeat, ViewHeatEntry } from "../view";

const entry = (id: number, name: string, proof: number | null, extra: Partial<ViewHeatEntry> = {}): ViewHeatEntry => ({
  entryId: id,
  name,
  place: null,
  glass: null,
  proof,
  mashbill: null,
  ageYears: null,
  distilleries: [], category: null, finishes: [],
  ...extra,
});

const heat = (id: number, round: number, slot: number, entries: ViewHeatEntry[], extra: Partial<ViewHeat> = {}): ViewHeat => ({
  id,
  round,
  slot,
  status: "pending",
  label: null,
  autoLabel: null,
  band: "",
  hidden: false,
  entryCount: entries.length,
  glasses: [],
  entries,
  ...extra,
});

const settings = { heatSize: 4, seeding: "similar" as const, groupOrder: ["proof", "mashbill", "distillery", "age", "finish"] };

describe("flightTitle", () => {
  it("puts your own name first and marks it yours", () => {
    expect(flightTitle(heat(1, 1, 1, [], { label: "  High rye shelf ", autoLabel: "Low rye", band: "90 proof" }), 1)).toEqual({ text: "High rye shelf", yours: true });
  });
  it("falls back from the generated name to the flight number, never to the band", () => {
    expect(flightTitle(heat(1, 1, 1, [], { autoLabel: "High rye bourbons", band: "90 proof" }), 2)).toEqual({ text: "High rye bourbons", yours: false });
    expect(flightTitle(heat(1, 1, 1, [], { band: "90 to 94 proof" }), 2)).toEqual({ text: "Flight 2", yours: false });
    expect(flightTitle(heat(1, 1, 1, []), 2)).toEqual({ text: "Flight 2", yours: false });
  });
  it("shows only the band on a hidden flight, even if a label is somehow present", () => {
    expect(flightTitle(heat(1, 2, 1, [], { hidden: true, label: "Secret pick", band: "90 to 100 proof", entryCount: 4 }), 1)).toEqual({ text: "90 to 100 proof", yours: false });
    expect(flightTitle(heat(1, 2, 1, [], { hidden: true, band: "90 to 100 proof", entryCount: 4 }), 1)).toEqual({ text: "90 to 100 proof", yours: false });
  });
});

describe("formatAge", () => {
  it("reads years, trims decimals, and shows a dash when unknown", () => {
    expect(formatAge(12)).toBe("12 yr");
    expect(formatAge(4.5)).toBe("4.5 yr");
    expect(formatAge(null)).toBe("—");
  });
});

describe("advanceNote and plannedRounds", () => {
  it("states the cut for even and mixed flight sizes", () => {
    expect(advanceNote([4, 4, 4], false)).toBe("Top 2 of each flight advance");
    expect(advanceNote([3, 3, 2], true)).toBe("Top 1 of each flight advanced");
    expect(advanceNote([4, 4, 3], false)).toBe("Flights of 4 advance 2, flights of 3 advance 1");
  });
  it("matches the engine's plan for a preview", () => {
    for (const [n, size] of [[12, 4], [60, 4], [7, 3], [10, 2], [3, 4]] as const) {
      const sizes: number[] = [];
      for (let left = n; left > 0; left -= size) sizes.push(Math.min(size, left));
      const plan = planRounds(n, size);
      expect([plan[0], ...plannedRounds(sizes, size).map((p) => p.flights)]).toEqual(plan);
    }
  });
});

describe("buildBracketModel: a draft preview", () => {
  const view = {
    status: "draft" as const,
    currentRound: 1,
    ...settings,
    rounds: [
      {
        round: 1,
        heats: [
          heat(1, 1, 1, [entry(1, "Weller 12", 100, { ageYears: 12, mashbill: "Wheated" }), entry(2, "Buffalo Trace", 90), entry(3, "Mystery", null), entry(4, "Booker's", 126)], { band: "" }),
          heat(2, 1, 3, [entry(5, "Eagle Rare", 90), entry(6, "Blanton's", 93)], { band: "90 to 93 proof", autoLabel: "Buffalo Trace", label: "Mine" }),
        ],
      },
    ],
  };
  const model = buildBracketModel(view);
  const first = model.columns[0] as RoundColumn;

  it("lists open flights lowest proof first with unknown last", () => {
    expect(first.flights[0]!.rows.map((r) => r.name)).toEqual(["Buffalo Trace", "Weller 12", "Booker's", "Mystery"]);
  });
  it("formats the fixed columns and dashes what is unknown", () => {
    const weller = first.flights[0]!.rows.find((r) => r.name === "Weller 12")!;
    expect([weller.proof, weller.mashbill, weller.age]).toEqual(["100", "Wheated", "12 yr"]);
    const mystery = first.flights[0]!.rows.find((r) => r.name === "Mystery")!;
    expect([mystery.proof, mystery.mashbill, mystery.age]).toEqual(["—", "—", "—"]);
  });
  it("numbers flights by position, not slot, and marks yours", () => {
    expect(first.flights[1]!.number).toBe(2);
    expect(first.flights[1]!.title).toEqual({ text: "Mine", yours: true });
    expect(first.flights[1]!.meta).toBe("Flight 2 · 90 to 93 proof");
    expect(first.flights[1]!.subtitle).toBe("90 to 93 proof");
    expect(first.flights[0]!.subtitle).toBe("");
    expect(model.renamed).toBe(1);
    // no band because one proof is unknown, and nothing shared to name it: the number is the title, so it is not said twice
    expect(first.flights[0]!.title.text).toBe("Flight 1");
    expect(first.flights[0]!.meta).toBe("Proof unknown for some");
  });
  it("counts bottles without a proof and adds the later rounds as counts", () => {
    expect(model.unknownProof).toBe(1);
    expect(first.heading).toBe("Round 1");
    expect(first.state).toBeNull();
    expect(first.count).toBe("6 bottles");
    expect(first.note).toBe("Flights of 4 advance 2, flights of 2 advance 1");
    const later = model.columns.slice(1);
    expect(later.map((c) => [c.kind, c.heading, c.count])).toEqual([["planned", "Final", "3 bottles"]]);
    expect(later[0]).toMatchObject({ title: "Final flight", fill: "Fills after round 1" });
  });
  it("makes a single flight the final with no later rounds", () => {
    const one = buildBracketModel({ ...view, rounds: [{ round: 1, heats: [view.rounds[0]!.heats[0]!] }] });
    expect(one.columns).toHaveLength(1);
    expect((one.columns[0] as RoundColumn).heading).toBe("Final");
  });
});

describe("buildBracketModel: a running tournament", () => {
  const decided = heat(
    1,
    1,
    1,
    [entry(1, "Eagle Rare", 90, { place: 1 }), entry(2, "Maker's", 92, { place: 2 }), entry(3, "Russell's", 91, { place: 3 }), entry(4, "Buffalo Trace", 90, { place: 4 })],
    { status: "decided", band: "90 to 92 proof", autoLabel: "Low rye" },
  );
  const bye = heat(2, 1, 2, [entry(9, "Lone bottle", 100)], { status: "bye", band: "100 proof" });
  const hidden = heat(3, 2, 1, [], { hidden: true, band: "90 to 100 proof", label: null, entryCount: 4, glasses: ["A", "B"] });
  const view = {
    status: "active" as const,
    currentRound: 2,
    ...settings,
    rounds: [
      { round: 1, heats: [decided, bye] },
      { round: 2, heats: [hidden, heat(4, 2, 2, [], { hidden: true, band: "124 to 126 proof", entryCount: 2 })] },
    ],
  };
  const model = buildBracketModel(view);
  const [one, two] = model.columns as RoundColumn[];

  it("shows places in order and marks who advanced", () => {
    expect(one!.flights[0]!.rows.map((r) => [r.name, r.place, r.advanced])).toEqual([
      ["Eagle Rare", 1, true],
      ["Maker's", 2, true],
      ["Russell's", 3, false],
      ["Buffalo Trace", 4, false],
    ]);
    expect(one!.flights[1]!.rows.map((r) => r.advanced)).toEqual([true]);
    expect(one!.flights[1]!.meta).toBe("100 proof · Bye");
    expect([one!.state, two!.state]).toEqual(["decided", "now"]);
    expect(one!.note).toBe("Flights of 4 advanced 2, byes advanced 1");
  });
  it("shows a hidden flight as its band only, never a bottle name or a custom label", () => {
    const flight = two!.flights[0]!;
    expect(flight.hidden).toBe(true);
    expect(flight.rows).toEqual([]);
    expect(flight.count).toBe(4);
    expect(flight.glassesSet).toBe(2);
    expect(flight.title).toEqual({ text: "90 to 100 proof", yours: false });
    expect(flight.meta).toBe("Flight 1");
    const plain = two!.flights[1]!;
    expect(plain.title).toEqual({ text: "124 to 126 proof", yours: false });
    expect(plain.meta).toBe("Flight 2");
    expect(model.renamed).toBe(0);
  });
  it("marks nobody as advancing out of a decided final", () => {
    const final = heat(9, 3, 1, [entry(1, "Eagle Rare", 90, { place: 1 }), entry(2, "Maker's", 92, { place: 2 })], { status: "decided", band: "90 to 92 proof" });
    const col = buildBracketModel({ ...settings, status: "complete" as const, currentRound: 3, rounds: [{ round: 3, heats: [final] }] }).columns[0] as RoundColumn;
    expect(col.heading).toBe("Final");
    expect(col.flights[0]!.rows.map((r) => r.advanced)).toEqual([false, false]);
  });
  it("plans the rounds still to come", () => {
    expect(model.columns.map((c) => c.heading)).toEqual(["Round 1", "Round 2", "Final"]);
    expect(model.columns[2]).toMatchObject({ kind: "planned", count: "3 bottles" });
  });
});
