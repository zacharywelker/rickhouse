import { describe, expect, it } from "vitest";
import { labelRankLine } from "../label-rank";
import type { RankingResult } from "../ranking-query";

const c = (id: string, rank: number, over: Partial<RankingResult["competitors"][number]> = {}): RankingResult["competitors"][number] => ({
  id, theta: 0, rank, heats: 3, provisional: false, singleBand: false, group: 1, groupSize: 41,
  name: id, bottleId: null, expressionId: null, rating: null, ...over,
});
const ranking = (...competitors: RankingResult["competitors"]): RankingResult => ({ competitors, audit: [] });

describe("labelRankLine", () => {
  it("names the rank of a bottle of the label", () => {
    expect(labelRankLine(ranking(c("b:7", 3)), 1, [7, 8], "Bourbon")).toEqual({ rank: 3, of: 41, text: "Tournament rank: 3 of 41 bourbons" });
  });
  it("uses the singular for a group of one", () => {
    expect(labelRankLine(ranking(c("b:7", 1, { groupSize: 1 })), 1, [7], "Bourbon")?.text).toBe("Tournament rank: 1 of 1 bourbon");
  });
  it("takes the best firm rank among the label and its bottles", () => {
    expect(labelRankLine(ranking(c("e:1", 9), c("b:7", 4), c("b:8", 6)), 1, [7, 8], "Rye")?.rank).toBe(4);
  });
  it("ignores provisional ranks, even a better one", () => {
    expect(labelRankLine(ranking(c("b:7", 1, { provisional: true }), c("b:8", 5)), 1, [7, 8], "Rye")?.rank).toBe(5);
    expect(labelRankLine(ranking(c("b:7", 1, { provisional: true })), 1, [7], "Rye")).toBeNull();
  });
  it("uses the rank and size of the competitor's own comparable group", () => {
    expect(labelRankLine(ranking(c("b:7", 2, { group: 2, groupSize: 5 }), c("b:8", 2, { group: 1, groupSize: 20 })), 1, [7, 8], "Rum")).toMatchObject({ rank: 2, of: 20 });
  });
  it("is null for a label with no competitor, and ignores other labels' bottles", () => {
    expect(labelRankLine(ranking(c("b:9", 1), c("e:2", 1)), 1, [7], "Rum")).toBeNull();
    expect(labelRankLine(ranking(), 1, [], "Rum")).toBeNull();
  });
});
