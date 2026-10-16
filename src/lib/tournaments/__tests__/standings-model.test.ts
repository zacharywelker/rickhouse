import { describe, expect, it } from "vitest";
import { standingRows } from "../standings-model";
import type { TournamentView } from "../view";

const s = (entryId: number, name: string, rank: number, round: number, place: number | null) => ({ entryId, name, rank, round, place });
const rounds = (n: number) => Array.from({ length: n }, (_, i) => ({ round: i + 1, heats: [] }));
type In = Pick<TournamentView, "standings" | "champion" | "rounds" | "status">;

describe("standingRows", () => {
  it("is empty before any flight is decided", () => {
    expect(standingRows({ status: "active", standings: [], champion: null, rounds: rounds(1) })).toEqual([]);
  });

  it("marks shared places with = and keeps the engine's skip", () => {
    const view: In = { standings: [s(1, "A", 1, 2, 1), s(2, "B", 2, 2, 2), s(3, "C", 3, 1, 3), s(4, "D", 3, 1, 3), s(5, "E", 5, 1, 4)], champion: null, rounds: rounds(2), status: "active" };
    expect(standingRows(view).map((r) => [r.place, r.name])).toEqual([["1", "A"], ["2", "B"], ["3=", "C"], ["3=", "D"], ["5", "E"]]);
  });

  it("says where each left, and names the champion once finished", () => {
    const view: In = { standings: [s(1, "A", 1, 2, 1), s(2, "B", 2, 2, 2), s(3, "C", 3, 1, 3)], champion: { entryId: 1, name: "A" }, rounds: rounds(2), status: "complete" };
    expect(standingRows(view).map((r) => [r.left, r.champion])).toEqual([["Champion", true], ["Out in the final", false], ["Out in round 1", false]]);
  });

  it("while running, nobody is out yet: it says where each last poured", () => {
    const view: In = { standings: [s(1, "A", 1, 1, 1), s(2, "B", 2, 1, 2)], champion: null, rounds: rounds(2), status: "active" };
    expect(standingRows(view).every((r) => !r.champion)).toBe(true);
    expect(standingRows(view)[0]!.left).toBe("Last flight: round 1");
  });
});
