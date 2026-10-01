import { describe, expect, it } from "vitest";
import { describeLinks, linksPayload } from "../links";
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
