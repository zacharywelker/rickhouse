import { describe, expect, it } from "vitest";
import { FILL_STATES, fillState, fillStateDescription, fillStateText } from "../fill-state";

describe("fillState", () => {
  it("reads each set-point as its own state", () => {
    for (const state of FILL_STATES) expect(fillState(state.pct)).toBe(state);
  });

  it("only calls a truly empty bottle empty", () => {
    expect(fillState(0).key).toBe("empty");
    expect(fillState(1).key).toBe("almost-gone");
  });

  it("splits the bands between set-points", () => {
    expect(fillState(17).key).toBe("almost-gone");
    expect(fillState(18).key).toBe("quarter");
    expect(fillState(37).key).toBe("quarter");
    expect(fillState(38).key).toBe("half");
    expect(fillState(62).key).toBe("half");
    expect(fillState(63).key).toBe("three-quarters");
    expect(fillState(87).key).toBe("three-quarters");
    expect(fillState(88).key).toBe("full");
  });

  it("spells fractions out for screen readers", () => {
    expect(fillStateDescription(75)).toBe("Three quarters full");
    expect(fillStateDescription(100)).toBe("Full");
    expect(fillStateDescription(5)).toBe("Almost gone");
  });

  it("adds 'full' to fractions only, for inline text", () => {
    expect(fillStateText(50)).toBe("½ full");
    expect(fillStateText(100)).toBe("Full");
    expect(fillStateText(0)).toBe("Empty");
  });
});
