import { describe, expect, it } from "vitest";
import { capDecimals, padDecimals } from "@/lib/decimals";

describe("capDecimals", () => {
  it("drops digits past two places after the dot", () => {
    expect(capDecimals("99.999", 2)).toBe("99.99");
  });
  it("leaves a value with no dot alone", () => {
    expect(capDecimals("12", 2)).toBe("12");
  });
  it("leaves a value within the cap alone", () => {
    expect(capDecimals("117.9", 2)).toBe("117.9");
  });
});

describe("padDecimals", () => {
  it("pads a whole number to two places", () => {
    expect(padDecimals("100", 2)).toBe("100.00");
  });
  it("pads a leading-dot value with a zero", () => {
    expect(padDecimals(".5", 2)).toBe("0.50");
  });
  it("pads one decimal to two places", () => {
    expect(padDecimals("117.9", 2)).toBe("117.90");
  });
  it("leaves an empty value empty", () => {
    expect(padDecimals("", 2)).toBe("");
  });
  it("leaves a value that is not a plain decimal unchanged", () => {
    expect(padDecimals("1e3", 2)).toBe("1e3");
    expect(padDecimals("-5", 2)).toBe("-5");
    expect(padDecimals(".", 2)).toBe(".");
  });
});
