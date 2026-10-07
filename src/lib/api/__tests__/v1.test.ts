import { describe, expect, it } from "vitest";
import { apiError, pageParams, paramsRecord, parseId } from "../v1";

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

describe("pageParams", () => {
  it("defaults to the first page and the fallback size", () => {
    expect(pageParams(new URLSearchParams(""))).toEqual({ page: 1, size: 30 });
  });

  it("takes a valid page and size, and caps the size", () => {
    expect(pageParams(new URLSearchParams("page=3&size=20"))).toEqual({ page: 3, size: 20 });
    expect(pageParams(new URLSearchParams("size=5000"))).toEqual({ page: 1, size: 100 });
  });

  it("ignores values that are not positive whole numbers", () => {
    expect(pageParams(new URLSearchParams("page=0&size=0"))).toEqual({ page: 1, size: 30 });
    expect(pageParams(new URLSearchParams("page=-2&size=abc"))).toEqual({ page: 1, size: 30 });
    expect(pageParams(new URLSearchParams("page=1.5&size="))).toEqual({ page: 1, size: 30 });
  });
});
