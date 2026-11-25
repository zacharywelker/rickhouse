import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

describe("withOnlyMashbill", () => {
  it("names the fixed recipe on the label and in every finish's pair lines", async () => {
    const { withOnlyMashbill } = await import("../save");
    const out = withOnlyMashbill(
      {
        distilleries: [], mashbills: [{ id: 5, amount: null }],
        finishes: [
          { id: 9, amount: "", mashbills: [{ id: 5, share: 30 }, { id: 6, share: 20 }] },
          { id: 10, amount: "", mashbills: [{ id: 6, share: null }] },
          { id: 11, amount: "" },
        ],
      } as never,
      77,
    );
    expect(out.mashbills).toEqual([{ id: 77, amount: null }]);
    expect(out.finishes[0]).toMatchObject({ mashbills: [{ id: 77, share: 50 }] });
    expect(out.finishes[1]).toMatchObject({ mashbills: [{ id: 77, share: null }] });
    expect(out.finishes[2]).toEqual({ id: 11, amount: "" });
  });
});
