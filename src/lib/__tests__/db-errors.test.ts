import { describe, expect, it } from "vitest";
import { mapDbError } from "../db-errors";

/** Drizzle throws its own Error and hangs the driver error off `cause`. */
function drizzleWrapped(pg: Record<string, unknown>): Error {
  return new Error("Failed query: insert into ...", { cause: Object.assign(new Error("pg"), pg) });
}

const ctx = { singular: "Finish" };

describe("mapDbError", () => {
  it("finds the Postgres code through Drizzle's wrapper", () => {
    const result = mapDbError(
      drizzleWrapped({ code: "23505", detail: "Key (name)=(French Oak) already exists.", constraint_name: "finishes_name_unique" }),
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/already uses that name/i);
      expect(result.fieldErrors?.name).toBe("Already taken.");
    }
  });

  it("reads an unwrapped driver error too", () => {
    const result = mapDbError({ code: "23505", detail: "Key (slug)=(french-oak) already exists." }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/URL slug/);
      // A generated slug is not a field the user typed, so nothing is flagged.
      expect(result.fieldErrors).toBeUndefined();
    }
  });

  it("explains a foreign key violation as something still referencing the row", () => {
    const result = mapDbError(drizzleWrapped({ code: "23503" }), { singular: "Brand" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/still references this brand/i);
  });

  it("recognises the mashbill check constraint by name", () => {
    const result = mapDbError(drizzleWrapped({ code: "23514", constraint_name: "mashbill_sums_to_100" }), {
      singular: "Mashbill",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/add up to 100/i);
  });

  it("picks the first column out of a composite key", () => {
    const result = mapDbError({ code: "23505", detail: "Key (name, location)=(P.Club, Online) already exists." }, {
      singular: "Store",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.name).toBe("Already taken.");
  });

  it("falls back to a generic message for anything unrecognised", () => {
    const result = mapDbError(new Error("socket hang up"), ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/something went wrong/i);
  });

  it("does not loop forever on a self-referencing cause chain", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    a.cause = a;
    expect(mapDbError(a, ctx).ok).toBe(false);
  });
});
