import { describe, expect, it } from "vitest";
import { audit, comparableGroups, fitStrengths, rankCompetitors, type RankedHeat } from "../ranking";

const heat = (ids: string[], proof: number | null = 100): RankedHeat => ({ ranking: ids.map((id) => ({ id, proof })) });

/** The penalized log-likelihood the fit maximizes, written out independently of the fit. */
function logLikelihood(heats: string[][], theta: Map<string, number>, prior: number): number {
  let total = 0;
  for (const ranking of heats) {
    for (let stage = 0; stage < ranking.length - 1; stage++) {
      const rest = ranking.slice(stage).reduce((sum, id) => sum + Math.exp(theta.get(id)!), 0);
      total += theta.get(ranking[stage]!)! - Math.log(rest);
    }
  }
  for (const value of theta.values()) total += prior * (value - 2 * Math.log(1 + Math.exp(value)));
  return total;
}

describe("fitStrengths", () => {
  it("gives equal strength to two bottles that beat each other once", () => {
    const theta = fitStrengths([["a", "b"], ["b", "a"]]);
    expect(theta.get("a")).toBeCloseTo(theta.get("b")!, 9);
  });

  it("keeps a bottle that has only ever won finite", () => {
    const theta = fitStrengths([["a", "b"], ["a", "c"], ["a", "d"]]);
    expect(Number.isFinite(theta.get("a")!)).toBe(true);
    expect(theta.get("a")!).toBeGreaterThan(theta.get("b")!);
  });

  it("orders strengths by place in a four-way heat", () => {
    const theta = fitStrengths([["a", "b", "c", "d"]]);
    const t = (id: string) => theta.get(id)!;
    expect(t("a")).toBeGreaterThan(t("b"));
    expect(t("b")).toBeGreaterThan(t("c"));
    expect(t("c")).toBeGreaterThan(t("d"));
  });

  it("does not depend on the order the heats are given in", () => {
    const heats = [["a", "b", "c"], ["c", "d"], ["b", "d", "a"], ["d", "a"]];
    const one = fitStrengths(heats);
    const two = fitStrengths([...heats].reverse());
    for (const id of one.keys()) expect(one.get(id)!).toBeCloseTo(two.get(id)!, 9);
  });

  it("lands on a maximum: nudging any strength either way lowers the likelihood", () => {
    const heats = [["a", "b", "c", "d"], ["b", "e"], ["e", "c", "a"], ["d", "b"], ["a", "e"]];
    const theta = fitStrengths(heats, 0.5);
    const base = logLikelihood(heats, theta, 0.5);
    for (const id of theta.keys()) {
      for (const nudge of [-1e-3, 1e-3]) {
        const moved = new Map(theta).set(id, theta.get(id)! + nudge);
        expect(logLikelihood(heats, moved, 0.5)).toBeLessThan(base);
      }
    }
  });
});

describe("comparableGroups", () => {
  it("links competitors who share heats, directly or through others", () => {
    const groups = comparableGroups([["a", "b"], ["b", "c"], ["x", "y"]]);
    expect(groups.get("a")).toBe(groups.get("c"));
    expect(groups.get("a")).not.toBe(groups.get("x"));
  });

  it("breaks a size tie by plain code-unit order, so B comes before a on every host", () => {
    const groups = comparableGroups([["a", "b"], ["B", "C"]]);
    expect(groups.get("B")).toBe(0);
    expect(groups.get("a")).toBe(1);
  });

  it("numbers the largest group 0", () => {
    const groups = comparableGroups([["x", "y"], ["a", "b"], ["b", "c"]]);
    expect(groups.get("a")).toBe(0);
    expect(groups.get("x")).toBe(1);
  });
});

describe("rankCompetitors", () => {
  it("ranks within a group, and shares a rank for equal strength", () => {
    const rows = rankCompetitors([heat(["a", "b"]), heat(["b", "a"])]);
    expect(rows.map((r) => [r.id, r.rank])).toEqual([["a", 1], ["b", 1]]);
  });

  it("orders equal strengths by plain code-unit order of id, so B comes before a", () => {
    const rows = rankCompetitors([heat(["a", "B"]), heat(["B", "a"])]);
    expect(rows.map((r) => r.id)).toEqual(["B", "a"]);
  });

  it("marks a competitor provisional until it has three heats", () => {
    const rows = rankCompetitors([heat(["a", "b"]), heat(["a", "c"]), heat(["a", "d"])]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.a!.provisional).toBe(false);
    expect(byId.b!.provisional).toBe(true);
  });

  it("marks single band when every heat sat in one proof band, and not when a heat spans bands", () => {
    const rows = rankCompetitors([heat(["a", "b"], 100), heat(["a", "c"], 102), heat(["a", "d"], 101), {
      ranking: [{ id: "e", proof: 90 }, { id: "f", proof: 120 }],
    }]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.a!.singleBand).toBe(true);
    expect(byId.e!.singleBand).toBe(false);
  });

  it("does not call a bottle single band when a proof is unknown", () => {
    const rows = rankCompetitors([heat(["a", "b"], null)]);
    expect(rows.every((r) => !r.singleBand)).toBe(true);
  });

  it("keeps separate tournaments in separate groups", () => {
    const rows = rankCompetitors([heat(["a", "b"]), heat(["x", "y"])]);
    expect(new Set(rows.map((r) => r.group)).size).toBe(2);
  });

  it("counts a competitor once in a heat that lists it twice, at its best place", () => {
    const doubled = rankCompetitors([heat(["a", "a", "b"])]);
    const single = rankCompetitors([heat(["a", "b"])]);
    expect(doubled).toEqual(single);
    expect(doubled.every((r) => r.heats === 1)).toBe(true);
  });

  it("skips a heat that is one competitor listed twice", () => {
    expect(rankCompetitors([heat(["a", "a"])])).toEqual([]);
  });

  it("ignores heats of fewer than two", () => {
    expect(rankCompetitors([heat(["solo"])])).toEqual([]);
  });
});

describe("audit", () => {
  // Six bottles that met across bands, ranked a to f, each with three or more heats.
  const heats: RankedHeat[] = [];
  const ids = ["a", "b", "c", "d", "e", "f"];
  const proof: Record<string, number> = { a: 90, b: 100, c: 110, d: 120, e: 95, f: 105 };
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) heats.push({ ranking: [{ id: ids[i]!, proof: proof[ids[i]!]! }, { id: ids[j]!, proof: proof[ids[j]!]! }] });
  }
  const strengths = rankCompetitors(heats);

  it("lists the biggest disagreements between rank and rating first", () => {
    // a ranks first but is rated worst; f ranks last but is rated best.
    const ratings = new Map<string, number | null>([["a", 5], ["b", 7], ["c", 7.5], ["d", 8], ["e", 8.5], ["f", 9]]);
    const rows = audit(strengths, ratings);
    expect(rows[0]!.id === "a" || rows[0]!.id === "f").toBe(true);
    const a = rows.find((r) => r.id === "a")!;
    expect(a.rank).toBe(1);
    expect(a.expectedRank).toBe(6);
    expect(a.gap).toBe(-5);
    const f = rows.find((r) => r.id === "f")!;
    expect(f.gap).toBe(5);
  });

  it("skips unrated and provisional competitors, and never compares fewer than two rated", () => {
    const ratings = new Map<string, number | null>([["a", 8], ["b", null], ["c", null], ["d", null], ["e", null], ["f", null]]);
    expect(audit(strengths, ratings)).toEqual([]);
    const few = rankCompetitors([heat(["a", "b"]), heat(["b", "c"])]);
    expect(audit(few, new Map([["a", 8], ["b", 7], ["c", 6]]))).toEqual([]);
  });
});
