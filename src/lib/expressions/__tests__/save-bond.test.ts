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

  it("drops aging for a category without it (vodka), and keeps it where allowed", async () => {
    const { writableValues } = await import("../save");
    const { writableFields } = await import("../fields");
    const sent = { ageYears: "3", ageStatement: "3 Year", isNas: true, proof: "80" };
    expect(writableValues(sent, writableFields("vodka"))).toEqual({ proof: "80" });
    expect(writableValues(sent, writableFields("whiskey"))).toEqual(sent);
  });
});
