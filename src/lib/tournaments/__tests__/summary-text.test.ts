import { describe, expect, it } from "vitest";
import { entriesLabel, heatSizeLabel, statusLine } from "../summary-text";

const base = { currentRound: null, totalRounds: 0, progress: { done: 0, total: 0 } };

describe("statusLine", () => {
  it("says Draft before the start", () => {
    expect(statusLine({ ...base, status: "draft" })).toBe("Draft");
  });

  it("says the round and how many flights are decided while running", () => {
    expect(statusLine({ status: "active", currentRound: 2, totalRounds: 4, progress: { done: 3, total: 6 } })).toBe("Round 2 of 4 · 3 of 6 flights decided");
  });

  it("says flight, not flights, for a round of one", () => {
    expect(statusLine({ status: "active", currentRound: 3, totalRounds: 3, progress: { done: 0, total: 1 } })).toBe("Round 3 of 3 · 0 of 1 flight decided");
  });

  it("leaves out the round total when withdrawals made it smaller than the round", () => {
    expect(statusLine({ status: "active", currentRound: 3, totalRounds: 2, progress: { done: 1, total: 2 } })).toBe("Round 3 · 1 of 2 flights decided");
    expect(statusLine({ status: "active", currentRound: 1, totalRounds: 0, progress: { done: 0, total: 1 } })).toBe("Round 1 · 0 of 1 flight decided");
  });

  it("does not invent a round for a running tournament that has none", () => {
    expect(statusLine({ ...base, status: "active" })).toBe("Running");
  });

  it("says Complete when finished, whatever the last round was", () => {
    expect(statusLine({ status: "complete", currentRound: 3, totalRounds: 3, progress: { done: 1, total: 1 } })).toBe("Complete");
  });
});

describe("labels", () => {
  it("counts entries", () => {
    expect(entriesLabel(1)).toBe("1 entry");
    expect(entriesLabel(0)).toBe("0 entries");
    expect(entriesLabel(12)).toBe("12 entries");
  });

  it("names the flight size", () => {
    expect(heatSizeLabel(3)).toBe("flights of 3");
  });
});
