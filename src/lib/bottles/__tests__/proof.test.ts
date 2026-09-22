import { describe, expect, it } from "vitest";
import { abvToProof, proofToAbv } from "../proof";

describe("proofToAbv", () => {
  it("halves proof into ABV", () => {
    expect(proofToAbv("90")).toBe("45");
    expect(proofToAbv("135.6")).toBe("67.8");
  });

  it("is blank when proof is blank", () => {
    expect(proofToAbv("")).toBe("");
    expect(proofToAbv("   ")).toBe("");
  });

  it("is blank rather than NaN for garbage input", () => {
    expect(proofToAbv("not a number")).toBe("");
  });

  it("rounds away float noise to two decimal places", () => {
    expect(proofToAbv("0.3")).toBe("0.15");
  });
});

describe("abvToProof", () => {
  it("doubles ABV into proof", () => {
    expect(abvToProof("45")).toBe("90");
    expect(abvToProof("67.8")).toBe("135.6");
  });

  it("is blank when ABV is blank", () => {
    expect(abvToProof("")).toBe("");
  });

  it("round-trips through proof and back", () => {
    expect(abvToProof(proofToAbv("108.6"))).toBe("108.6");
    expect(proofToAbv(abvToProof("54.3"))).toBe("54.3");
  });
});
