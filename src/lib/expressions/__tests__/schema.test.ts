import { describe, expect, it } from "vitest";
import { bottleGridEditSchema, bottleSchema, bottleStateSchema, expressionGridEditSchema, tastingEditSchema, tastingSchema } from "../schema";

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

describe("tastingSchema", () => {
  it("takes a label alone, with the owned source and no flavors by default", () => {
    const parsed = tastingSchema.parse({ expressionId: 4 });
    expect(parsed).toMatchObject({ expressionId: 4, bottleId: null, source: "owned", tastedAt: null, tags: [], rating: null });
    expect(parsed.tastedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reads a pour from elsewhere: source, place, rating, flavors and the texts", () => {
    const parsed = tastingSchema.parse({
      expressionId: 4,
      source: "bottle_share",
      tastedAt: "  Dave's place ",
      tastedOn: "2026-10-06",
      rating: 8.5,
      tags: ["bourbon/fruity/citrus/lemon"],
      overall: " Bright ",
    });
    expect(parsed).toMatchObject({ source: "bottle_share", tastedAt: "Dave's place", rating: "8.5", overall: "Bright" });
    expect(parsed.tags).toEqual(["bourbon/fruity/citrus/lemon"]);
  });

  it("keeps a repeated flavor once, in order", () => {
    expect(tastingSchema.parse({ expressionId: 1, tags: ["a/b", "c/d", "a/b"] }).tags).toEqual(["a/b", "c/d"]);
  });

  it("names the field that is wrong", () => {
    const fields = (body: object) => {
      const result = tastingSchema.safeParse(body);
      return result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    };
    expect(fields({})).toContain("expressionId");
    expect(fields({ expressionId: 0 })).toContain("expressionId");
    expect(fields({ expressionId: 1, source: "tavern" })).toContain("source");
    expect(fields({ expressionId: 1, rating: 11 })).toContain("rating");
    expect(fields({ expressionId: 1, tastedOn: "yesterday" })).toContain("tastedOn");
    expect(fields({ expressionId: 1, tags: [""] })).toContain("tags");
    expect(fields({ expressionId: 1, bottleId: 1.5 })).toContain("bottleId");
  });

  it("allows a missing bottle either way it is sent", () => {
    expect(tastingSchema.parse({ expressionId: 1, bottleId: null }).bottleId).toBeNull();
    expect(tastingSchema.parse({ expressionId: 1, bottleId: 7 }).bottleId).toBe(7);
  });
});

describe("tastingEditSchema", () => {
  it("cannot move a tasting to another label or bottle", () => {
    const parsed = tastingEditSchema.parse({ expressionId: 9, bottleId: 9, overall: "x" });
    expect(parsed).not.toHaveProperty("expressionId");
    expect(parsed).not.toHaveProperty("bottleId");
  });

  it("clears what is left out, as a note does", () => {
    expect(tastingEditSchema.parse({})).toMatchObject({ rating: null, nose: null, tastedAt: null, tags: [], source: "owned" });
  });
});
