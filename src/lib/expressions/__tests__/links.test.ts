import { describe, expect, it } from "vitest";
import { describeLinks, linksPayload, shareText } from "../links";
import { parseLinks } from "../schema";

describe("inferred distillery links", () => {
  const rows = [
    { id: 1, label: "MGP of Indiana", amount: "", inferred: true },
    { id: 2, label: "Bardstown", amount: "40" },
  ];

  it("round-trips through the JSON the form submits", () => {
    const parsed = parseLinks(linksPayload(rows));
    expect(parsed.map((row) => [row.id, row.inferred])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it("reads a row that never mentions it as not inferred", () => {
    expect(parseLinks(JSON.stringify([{ id: 5, amount: "" }]))[0]?.inferred).toBeUndefined();
  });

  it("leaves the flag out of the one-line description, which the labels table shows", () => {
    expect(describeLinks("distilleries", rows)).toBe("MGP of Indiana, Bardstown (40%)");
  });

  it("makes flipping the flag count as a change", () => {
    expect(linksPayload(rows)).not.toBe(linksPayload([{ ...rows[0]!, inferred: false }, rows[1]!]));
  });
});

describe("an undisclosed place that has no row yet", () => {
  const place = { city: "", state: "ny", country: "USA" };
  const pending = { id: -1, label: "Undisclosed (New York)", amount: "", undisclosed: true, place };

  it("travels with its place and comes back through parseLinks", () => {
    const parsed = parseLinks(linksPayload([pending]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ id: -1, place: { state: "ny", country: "USA" } });
  });

  it("is not sent for an ordinary row", () => {
    expect(linksPayload([{ id: 5, label: "Bardstown", amount: "" }])).not.toContain("place");
  });

  it("needs its place: a negative id on its own is dropped with the rest, not saved as a row", () => {
    expect(parseLinks(JSON.stringify([{ id: -1, amount: "" }]))).toEqual([]);
    expect(parseLinks(JSON.stringify([{ id: 0, amount: "" }]))).toEqual([]);
  });

  it("lets a mashbill name it by its temporary id", () => {
    const parsed = parseLinks(JSON.stringify([{ id: 3, amount: "", distilleryId: -1 }]));
    expect(parsed[0]?.distilleryId).toBe(-1);
  });

  it("makes changing the place count as a change", () => {
    expect(linksPayload([pending])).not.toBe(linksPayload([{ ...pending, place: { ...place, state: "tn" } }]));
  });
});

describe("shareText", () => {
  it("shows a share as a whole percentage, rounding any saved with decimals", () => {
    expect(shareText("60.00")).toBe("60");
    expect(shareText("33.33")).toBe("33");
    expect(shareText("66.67")).toBe("67");
    expect(shareText("100.00")).toBe("100");
  });

  it("leaves no share blank", () => {
    expect(shareText(null)).toBe("");
    expect(shareText("")).toBe("");
  });
});

describe("finish pairs on the wire", () => {
  const rows = [
    { id: 10, label: "Cognac", amount: "6", share: "15", mashbills: [{ id: 1, share: "3" }, { id: 3, share: "12" }] },
    { id: 0, label: "No finish", amount: "", unfinished: true, share: "5", mashbills: [{ id: 1, share: "5" }] },
  ];

  it("round-trips pairs and the unfinished row through the JSON the form submits", () => {
    const parsed = parseLinks(linksPayload(rows));
    expect(parsed[0]).toMatchObject({ id: 10, amount: 6, share: 15, mashbills: [{ id: 1, share: 3 }, { id: 3, share: 12 }] });
    expect(parsed[1]).toMatchObject({ id: 0, unfinished: true, mashbills: [{ id: 1, share: 5 }] });
  });

  it("refuses an id of 0 on anything but the unfinished row, and the unfinished row on any other id", () => {
    expect(parseLinks(JSON.stringify([{ id: 0, amount: "" }]))).toEqual([]);
    expect(parseLinks(JSON.stringify([{ id: 4, amount: "", unfinished: true }]))).toEqual([]);
  });

  it("sends a grid's finishes without pairs, so the saved pairs are carried over", async () => {
    const { finishesWithoutPairs } = await import("../links");
    const sent = parseLinks(linksPayload(finishesWithoutPairs(rows)));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.share).toBeUndefined();
    expect(sent[0]!.mashbills).toBeUndefined();
  });
});
