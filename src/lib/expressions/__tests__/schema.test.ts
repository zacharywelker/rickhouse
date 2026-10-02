import { describe, expect, it } from "vitest";
import { bottleGridEditSchema, bottleSchema, bottleStateSchema, expressionGridEditSchema } from "../schema";

describe("expressionGridEditSchema", () => {
  it("leaves out what was not sent, rather than clearing it", () => {
    // A grid row sends only its edited fields; anything absent must stay
    // absent, or saving one cell would blank the rest of the label.
    const parsed = expressionGridEditSchema.parse({ msrp: "59.99" });
    expect(parsed).toEqual({ msrp: "59.99" });
  });

  it("clears what was sent blank", () => {
    expect(expressionGridEditSchema.parse({ upc: "", ageYears: "" })).toEqual({ upc: null, ageYears: null });
  });

  it("validates what it is sent", () => {
    expect(expressionGridEditSchema.safeParse({ upc: "12ab" }).success).toBe(false);
    expect(expressionGridEditSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("reads yes/no/unknown and checkboxes as the form does", () => {
    expect(expressionGridEditSchema.parse({ isSolera: "true", colorAdded: "", isNas: true })).toEqual({
      isSolera: true,
      colorAdded: null,
      isNas: true,
    });
  });
});

describe("bottleStateSchema", () => {
  it("defaults to a full, closed bottle", () => {
    expect(bottleStateSchema.parse({})).toEqual({
      fillPct: 100,
      isOpen: false,
      dateOpened: null,
      dateKilled: null,
      isFavorite: false,
    });
  });

  it("keeps the fill between 0 and 100", () => {
    expect(bottleStateSchema.safeParse({ fillPct: "101" }).success).toBe(false);
    expect(bottleStateSchema.parse({ fillPct: "35" }).fillPct).toBe(35);
  });

  it("refuses a bottle killed before it was opened", () => {
    const result = bottleStateSchema.safeParse({ dateOpened: "2025-06-01", dateKilled: "2025-05-01" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["dateKilled"]);
  });

  it("refuses a date in the future", () => {
    const result = bottleStateSchema.safeParse({ dateOpened: "2999-01-01" });
    expect(result.success).toBe(false);
  });
});

describe("bottle dates", () => {
  const futureIssue = (result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) =>
    result.error?.issues.find((i) => i.message === "That date is in the future.")?.path;

  it("refuses a bottle bought in the future", () => {
    expect(futureIssue(bottleSchema.safeParse({ expressionId: "1", dateAcquired: "2099-01-01" }))).toEqual(["dateAcquired"]);
    expect(futureIssue(bottleGridEditSchema.safeParse({ expressionId: "1", dateAcquired: "2099-01-01" }))).toEqual([
      "dateAcquired",
    ]);
  });

  it("refuses a barrel bottled in the future, and accepts one bottled in the past", () => {
    expect(futureIssue(bottleSchema.safeParse({ expressionId: "1", bottledOn: "2999-06-01" }))).toEqual(["bottledOn"]);
    expect(futureIssue(bottleSchema.safeParse({ expressionId: "1", bottledOn: "2020-06-01" }))).toBeUndefined();
  });
});
