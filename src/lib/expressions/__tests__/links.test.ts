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

  it("says so in the one-line description", () => {
    expect(describeLinks("distilleries", rows)).toBe("MGP of Indiana (inferred), Bardstown (40%)");
  });

  it("makes flipping the flag count as a change", () => {
    expect(linksPayload(rows)).not.toBe(linksPayload([{ ...rows[0]!, inferred: false }, rows[1]!]));
  });
});
