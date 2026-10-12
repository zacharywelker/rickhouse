import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

describe("writableValues", () => {
  it("makes a Bottled In Bond label 100 proof", async () => {
    const { writableValues } = await import("../save");
    const kept = writableValues({ isBottledInBond: true, proof: "90", name: "X" }, new Set(["isBottledInBond"]));
    expect(kept.proof).toBe("100");
  });

  it("leaves proof alone otherwise", async () => {
    const { writableValues } = await import("../save");
    expect(writableValues({ isBottledInBond: false, proof: "90" }, new Set()).proof).toBe("90");
    expect(writableValues({ proof: "90" }, new Set()).proof).toBe("90");
  });
});
