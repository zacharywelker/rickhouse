import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const execute = vi.fn();
vi.mock("@/db", () => ({ db: { execute: (...a: unknown[]) => execute(...a) } }));
const getExpression = vi.fn();
const bottlesOfLabel = vi.fn();
vi.mock("@/lib/expressions/queries", () => ({ getExpression: (...a: unknown[]) => getExpression(...a), bottlesOfLabel: (...a: unknown[]) => bottlesOfLabel(...a) }));
const rankingFor = vi.fn();
vi.mock("../ranking-query", () => ({ rankingFor: (...a: unknown[]) => rankingFor(...a) }));

import { labelRank } from "../label-rank-query";

beforeEach(() => {
  execute.mockReset();
  getExpression.mockReset();
  bottlesOfLabel.mockReset();
  rankingFor.mockReset();
});

describe("labelRank", () => {
  it("returns null without fitting anything when the owner has no decided flight", async () => {
    execute.mockResolvedValue([{ has: false }]);
    expect(await labelRank(1, 5)).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(getExpression).not.toHaveBeenCalled();
    expect(rankingFor).not.toHaveBeenCalled();
  });

  it("fits the ranking when there is a decided flight", async () => {
    execute.mockResolvedValue([{ has: true }]);
    rankingFor.mockResolvedValue({ competitors: [{ id: "b:7", theta: 0, rank: 2, heats: 3, provisional: false, singleBand: false, group: 1, groupSize: 5, name: "x", bottleId: 7, expressionId: null, rating: null }], audit: [] });
    const out = await labelRank(1, 5, { categoryId: 9, categoryName: "Bourbon", bottleIds: [7] });
    expect(rankingFor).toHaveBeenCalledWith(1, 9);
    expect(out).toMatchObject({ rank: 2, of: 5, categoryId: 9 });
  });

  it("never throws: a failing check yields null", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    execute.mockRejectedValue(new Error("db down"));
    expect(await labelRank(1, 5)).toBeNull();
    log.mockRestore();
  });
});
