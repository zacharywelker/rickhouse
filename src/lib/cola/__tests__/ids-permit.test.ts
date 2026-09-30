import { describe, expect, it } from "vitest";
import { isClassTypeCode, permitKey } from "../ids";

describe("permitKey", () => {
  it("compares permits however they were typed", () => {
    expect(permitKey("DSP-NY-0000")).toBe(permitKey("dsp ny 0"));
    expect(permitKey("DSP-KY-95")).toBe(permitKey("DSP-KY-0095"));
    expect(permitKey("DSP-KY-95")).not.toBe(permitKey("DSP-KY-96"));
  });
});

describe("isClassTypeCode", () => {
  it("tells a registry code from a word", () => {
    expect(isClassTypeCode("101")).toBe(true);
    expect(isClassTypeCode("101A")).toBe(true);
    expect(isClassTypeCode("bourbon")).toBe(false);
  });
});
