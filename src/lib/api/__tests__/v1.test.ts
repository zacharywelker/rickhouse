import { describe, expect, it } from "vitest";
import { apiError, paramsRecord, parseId } from "../v1";

describe("parseId", () => {
  it("accepts positive integers only", () => {
    expect(parseId("42")).toBe(42);
    expect(parseId("0")).toBeNull();
    expect(parseId("-3")).toBeNull();
    expect(parseId("1.5")).toBeNull();
    expect(parseId("abc")).toBeNull();
  });
});

describe("paramsRecord", () => {
  it("keeps the first value of a repeated key", () => {
    expect(paramsRecord(new URLSearchParams("q=rye&q=corn&page=2"))).toEqual({ q: "rye", page: "2" });
  });
});

describe("apiError", () => {
  it("wraps code and message in one shape", async () => {
    const res = apiError(422, "invalid", "Nope.", { proof: "Too high." });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: { code: "invalid", message: "Nope.", fields: { proof: "Too high." } } });
  });
});
