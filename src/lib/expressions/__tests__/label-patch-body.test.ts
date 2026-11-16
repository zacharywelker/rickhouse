import { describe, expect, it, vi } from "vitest";
import { bulkLabelPatchBody } from "../label-patch-body";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

describe("bulk label patch", () => {
  it("preserves omitted form facts when changing the price", () => {
    expect(bulkLabelPatchBody.parse({ msrp: 50 })).toEqual({ msrp: "50" });
    expect(bulkLabelPatchBody.safeParse({}).success).toBe(false);
  });

  it("keeps explicit statuses and clears", () => {
    expect(bulkLabelPatchBody.parse({
      peatStatus: "unpeated",
      dairyStatus: "non-dairy",
      msrp: null,
    })).toEqual({
      peatStatus: "unpeated",
      dairyStatus: "non-dairy",
      msrp: null,
    });
  });
});
