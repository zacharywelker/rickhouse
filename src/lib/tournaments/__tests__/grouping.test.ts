import { describe, expect, it } from "vitest";
import { autoLabel, groupIntoHeats, heatBand } from "../grouping";
import { DEFAULT_GROUP_ORDER, isGroupOrder, type Entrant, type MashbillInput } from "../types";

const generic = (style: string): MashbillInput => ({ kind: "generic", style });
const entrant = (id: number, name: string, over: Partial<Entrant> = {}): Entrant => ({
  id, name, proof: null, mashbill: null, distilleries: [], ageYears: null, finishes: [], ...over,
});
const names = (heats: Entrant[][]) => heats.map((h) => h.map((e) => e.name));

describe("isGroupOrder", () => {
  it("wants each of the five keys exactly once", () => {
    expect(isGroupOrder(["proof", "mashbill", "distillery", "age", "finish"])).toBe(true);
    expect(isGroupOrder(["distillery", "proof", "mashbill", "age", "finish"])).toBe(true);
    expect(isGroupOrder(["proof", "proof", "distillery", "age", "finish"])).toBe(false);
    expect(isGroupOrder(["proof", "mashbill"])).toBe(false);
    expect(isGroupOrder(["proof", "mashbill", "distillery", "age", "taste"])).toBe(false);
  });
});

describe("groupIntoHeats: the bottled-in-bond example", () => {
  // Ten at 100 proof (4 high rye, 3 rye whiskey, 3 wheated) plus two high ryes at 101 and 102. Heats of 4.
  const rye = (n: number) => entrant(4 + n, `R${n}`, { proof: 100, mashbill: { kind: "recipe", name: null, grains: [{ grain: "Rye", percent: 51 }, { grain: "Corn", percent: 39 }, { grain: "Malted Barley", percent: 10 }] } });
  const field: Entrant[] = [
    ...[1, 2, 3, 4].map((n) => entrant(n, `H${n}`, { proof: 100, mashbill: generic("High Rye") })),
    ...[1, 2, 3].map(rye),
    ...[1, 2, 3].map((n) => entrant(7 + n, `W${n}`, { proof: 100, mashbill: generic("Wheated") })),
    entrant(11, "H101", { proof: 101, mashbill: generic("High Rye") }),
    entrant(12, "H102", { proof: 102, mashbill: generic("High Rye") }),
  ];

  it("keeps 100, 101 and 102 together and lets mashbill order them", () => {
    expect(names(groupIntoHeats(field, ["proof", "mashbill", "distillery", "age", "finish"], 4))).toEqual([
      ["H1", "H2", "H3", "H4"],
      ["H101", "H102", "R1", "R2"],
      ["R3", "W1", "W2", "W3"],
    ]);
  });

  it("is the same whatever order the field arrives in", () => {
    const shuffled = [...field].reverse();
    expect(names(groupIntoHeats(shuffled, DEFAULT_GROUP_ORDER, 4))).toEqual(names(groupIntoHeats(field, DEFAULT_GROUP_ORDER, 4)));
  });
});

describe("groupIntoHeats: twelve bourbons", () => {
  const bottle = (id: number, name: string, proof: number, style: string, distillery: string, age: number | null, finish: string | null = null) =>
    entrant(id, name, { proof, mashbill: generic(style), distilleries: [distillery], ageYears: age, finishes: finish ? [finish] : [] });
  const field = [
    bottle(1, "Buffalo Trace", 90, "Low Rye", "Buffalo Trace", null),
    bottle(2, "Eagle Rare 10", 90, "Low Rye", "Buffalo Trace", 10),
    bottle(3, "Weller 12", 90, "Wheated", "Buffalo Trace", 12),
    bottle(4, "Russell's Reserve 10", 90, "Low Rye", "Wild Turkey", 10),
    bottle(5, "Blanton's", 93, "High Rye", "Buffalo Trace", null),
    bottle(6, "Maker's Mark 46", 94, "Wheated", "Maker's Mark", null, "Oak staves"),
    bottle(7, "Knob Creek 12", 100, "Low Rye", "Jim Beam", 12),
    bottle(8, "Four Roses Single Barrel", 100, "High Rye", "Four Roses", null),
    bottle(9, "Wild Turkey 101", 101, "High Rye", "Wild Turkey", null),
    bottle(10, "Old Forester 1920", 115, "Low Rye", "Old Forester", null),
    bottle(11, "Elijah Craig Barrel Proof", 124, "Low Rye", "Heaven Hill", 12),
    bottle(12, "Booker's", 126, "Low Rye", "Jim Beam", 7),
  ];

  it("matches by proof first", () => {
    expect(names(groupIntoHeats(field, DEFAULT_GROUP_ORDER, 4))).toEqual([
      ["Eagle Rare 10", "Buffalo Trace", "Russell's Reserve 10", "Blanton's"],
      ["Weller 12", "Maker's Mark 46", "Knob Creek 12", "Four Roses Single Barrel"],
      ["Wild Turkey 101", "Old Forester 1920", "Elijah Craig Barrel Proof", "Booker's"],
    ]);
  });

  it("matches by distillery first when asked, at the cost of mixing proofs", () => {
    const heats = groupIntoHeats(field, ["distillery", "proof", "mashbill", "age", "finish"], 4);
    expect(names(heats)).toEqual([
      ["Eagle Rare 10", "Buffalo Trace", "Blanton's", "Weller 12"],
      ["Four Roses Single Barrel", "Elijah Craig Barrel Proof", "Knob Creek 12", "Booker's"],
      ["Maker's Mark 46", "Old Forester 1920", "Russell's Reserve 10", "Wild Turkey 101"],
    ]);
    expect(heatBand(heats[1]!)).toBe("100 to 126 proof");
  });

  it("lets only the last heat be short, and a lone entrant is a bye", () => {
    const five = field.slice(0, 5);
    expect(groupIntoHeats(five, DEFAULT_GROUP_ORDER, 4).map((h) => h.length)).toEqual([4, 1]);
  });

  it("puts a bottle with no proof after every bottle that has one", () => {
    const withBlank = [...field.slice(0, 3), entrant(99, "Unknown", { mashbill: generic("Low Rye") })];
    expect(groupIntoHeats(withBlank, DEFAULT_GROUP_ORDER, 4)[0]!.at(-1)!.name).toBe("Unknown");
  });
});

describe("groupIntoHeats: edges", () => {
  it("returns no heats for no entrants", () => {
    expect(groupIntoHeats([], DEFAULT_GROUP_ORDER, 4)).toEqual([]);
  });

  it("splits 99.9 proof from 100 proof, because bands are fixed", () => {
    const field = [entrant(1, "a", { proof: 99.9 }), entrant(2, "b", { proof: 100 }), entrant(3, "c", { proof: 104.9 }), entrant(4, "d", { proof: 105 })];
    // 99.9 is in the 95 band, 100 and 104.9 share the 100 band, 105 starts the next: the order is by band, then exact proof.
    expect(names(groupIntoHeats(field, DEFAULT_GROUP_ORDER, 2))).toEqual([["a", "b"], ["c", "d"]]);
    expect(groupIntoHeats(field, DEFAULT_GROUP_ORDER, 1).map((h) => h[0]!.name)).toEqual(["a", "b", "c", "d"]);
  });

  it("falls back to entry id when nothing separates two entrants", () => {
    const field = [entrant(5, "later"), entrant(2, "earlier")];
    expect(names(groupIntoHeats(field, DEFAULT_GROUP_ORDER, 2))).toEqual([["earlier", "later"]]);
  });
});

describe("heatBand", () => {
  it("reads as a span, a single proof, or nothing when a proof is unknown", () => {
    expect(heatBand([entrant(1, "a", { proof: 90 }), entrant(2, "b", { proof: 94 })])).toBe("90 to 94 proof");
    expect(heatBand([entrant(1, "a", { proof: 100 }), entrant(2, "b", { proof: 100 })])).toBe("100 proof");
    expect(heatBand([entrant(1, "a", { proof: 90 }), entrant(2, "b")])).toBe("");
  });
});

describe("autoLabel", () => {
  const recipe = (name: string | null, grains: [string, number][]): MashbillInput => ({
    kind: "recipe", name, grains: grains.map(([grain, percent]) => ({ grain, percent })),
  });

  it("names a shared secret mashbill, without repeating its distillery", () => {
    const m = recipe("Buffalo Trace High Rye", [["Corn", 75]]);
    const heat = [1, 2].map((id) => entrant(id, `b${id}`, { mashbill: m, distilleries: ["Buffalo Trace"] }));
    expect(autoLabel(heat)).toBe("Buffalo Trace High Rye");
  });

  it("puts a shared distillery in front of a shared recipe", () => {
    const m = recipe(null, [["Rye", 95], ["Malted Barley", 5]]);
    const heat = [1, 2].map((id) => entrant(id, `b${id}`, { mashbill: m, distilleries: ["MGP"] }));
    expect(autoLabel(heat)).toBe("MGP 95/5");
  });

  it("falls back to whichever of the two is shared, and to null when neither is", () => {
    const high = generic("High Rye");
    expect(autoLabel([entrant(1, "a", { mashbill: high, distilleries: ["X"] }), entrant(2, "b", { mashbill: high, distilleries: ["Y"] })])).toBe("High Rye");
    expect(autoLabel([entrant(1, "a", { distilleries: ["X"] }), entrant(2, "b", { distilleries: ["X"] })])).toBe("X");
    expect(autoLabel([entrant(1, "a", { mashbill: high }), entrant(2, "b", { mashbill: generic("Wheated") })])).toBeNull();
  });

  it("calls a heat of several-distillery labels a blend, and is null when anything is unknown", () => {
    expect(autoLabel([entrant(1, "a", { distilleries: ["X", "Y"] }), entrant(2, "b", { distilleries: ["Z", "W"] })])).toBe("Blend");
    expect(autoLabel([entrant(1, "a", { distilleries: ["X"] }), entrant(2, "b")])).toBeNull();
  });
});
