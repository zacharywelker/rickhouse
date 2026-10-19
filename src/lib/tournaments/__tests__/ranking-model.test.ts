import { describe, expect, it } from "vitest";
import { FIRM_HEATS } from "../ranking";
import type { RankingResult } from "../ranking-query";
import { auditLines, auditNote, ordinal, parseRankingParams, rankingEmpty, rankingSections } from "../ranking-model";

const c = (id: string, over: Partial<RankingResult["competitors"][number]> = {}): RankingResult["competitors"][number] => ({
  id, theta: 0, rank: 1, heats: FIRM_HEATS, provisional: false, singleBand: false, group: 1, groupSize: 2,
  name: id, bottleId: null, expressionId: null, rating: null, ...over,
});
const result = (competitors: RankingResult["competitors"], audit: RankingResult["audit"] = []): RankingResult => ({ competitors, audit });

describe("ordinal", () => {
  it("handles the teens and the endings", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });
});

describe("parseRankingParams", () => {
  it("defaults, and ignores junk", () => {
    expect(parseRankingParams({})).toEqual({ categoryId: null, view: "ranking" });
    expect(parseRankingParams({ categoryId: "abc", view: "x" })).toEqual({ categoryId: null, view: "ranking" });
    expect(parseRankingParams({ categoryId: "-3" }).categoryId).toBeNull();
    expect(parseRankingParams({ categoryId: "2.5" }).categoryId).toBeNull();
    expect(parseRankingParams({ categoryId: ["4", "5"], view: ["audit"] })).toEqual({ categoryId: 4, view: "audit" });
    expect(parseRankingParams({ categoryId: "7", view: "audit" })).toEqual({ categoryId: 7, view: "audit" });
  });
});

describe("rankingSections", () => {
  it("is empty with no competitors", () => {
    expect(rankingSections(result([]))).toEqual([]);
  });

  it("tags provisional and single-band rows, shows the rating, and links a label", () => {
    const [section] = rankingSections(result([
      c("e:1", { name: "A", expressionId: 1, rating: 9, heats: 2, provisional: true }),
      c("b:2", { name: "B", rank: 2, singleBand: true }),
    ]));
    expect(section!.title).toBeNull();
    expect(section!.rows[0]).toMatchObject({ rankText: "1st", name: "A", heats: 2, tags: ["Provisional"], rating: "9.0", href: "/expressions/1" });
    expect(section!.rows[1]).toMatchObject({ rankText: "2nd", tags: ["Single band"], rating: null, href: null });
  });

  it("marks a shared rank with =", () => {
    const [section] = rankingSections(result([c("a", { rank: 1 }), c("b", { rank: 1 }), c("c", { rank: 3 })]));
    expect(section!.rows.map((r) => r.rankText)).toEqual(["1st=", "1st=", "3rd"]);
  });

  it("keeps unlinked groups as separate labelled sections, never merged", () => {
    const sections = rankingSections(result([c("a", { group: 1, groupSize: 2 }), c("b", { group: 1, rank: 2, groupSize: 2 }), c("x", { group: 2, groupSize: 1 })]));
    expect(sections.map((s) => [s.title, s.size, s.rows.length])).toEqual([["Group 1 of 2", 2, 2], ["Group 2 of 2", 1, 1]]);
    expect(sections[1]!.note).toMatch(/not comparable/i);
  });
});

describe("auditLines", () => {
  const row = (id: string, rating: number, rank: number, gap: number) => ({ id, rating, rank, groupSize: 40, expectedRank: rank - gap, gap, name: id });
  it("drops zero gaps and says which way it disagrees", () => {
    const lines = auditLines(result([], [row("a", 9, 14, 12), row("b", 5, 3, -7), row("c", 7, 5, 0)]));
    expect(lines.map((l) => l.id)).toEqual(["a", "b"]);
    expect(lines[0]).toMatchObject({ text: "Rated 9.0, ranks 14th of 40", direction: "lower", verdict: "Ranks lower than your rating suggests", gap: 12 });
    expect(lines[1]).toMatchObject({ direction: "higher", verdict: "Ranks higher than your rating suggests", gap: 7 });
  });
});

describe("auditNote and rankingEmpty", () => {
  it("counts what is left out of the audit", () => {
    const r = result([c("a", { provisional: true, rating: 8 }), c("b", { provisional: true }), c("d", { singleBand: true, rating: 7 }), c("e", { rating: 6 }), c("f")]);
    expect(auditNote(r)).toBe("1 is provisional (fewer than 3 flights), 1 only met one proof band, and 2 have no rating, so they are not audited.");
  });
  it("uses the singular for a single left-out competitor", () => {
    expect(auditNote(result([c("a", { rating: 8 }), c("b", { provisional: true, rating: 7 })]))).toBe("1 is provisional (fewer than 3 flights), so it is not audited.");
  });
  it("is null when everything was audited", () => {
    expect(auditNote(result([c("a", { rating: 8 })]))).toBeNull();
  });
  it("tells nothing decided from nothing rated from nothing to compare", () => {
    expect(rankingEmpty(result([]))).toBe("no-flights");
    expect(rankingEmpty(result([c("a")]))).toBe("no-ratings");
    expect(rankingEmpty(result([c("a", { rating: 8 })]))).toBe("no-gaps");
  });
});
