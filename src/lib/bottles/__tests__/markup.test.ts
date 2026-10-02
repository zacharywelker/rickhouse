import { describe, expect, it } from "vitest";
import { describeMarkup, markup, shortMarkup } from "../markup";

describe("markup", () => {
  it("compares what was paid with the label's MSRP", () => {
    expect(markup("64.99", "59.99")).toEqual({ amount: 5, pct: 8 });
    expect(markup("149.99", "74.99")).toEqual({ amount: 75, pct: 100 });
    expect(markup("49.99", "59.99")).toEqual({ amount: -10, pct: -17 });
  });

  it("is unknown without both prices, or with a zero MSRP", () => {
    expect(markup(null, "59.99")).toBeNull();
    expect(markup("64.99", null)).toBeNull();
    expect(markup("64.99", "")).toBeNull();
    expect(markup("0", "0")).toBeNull();
  });

  it("reads the way a collector says it", () => {
    expect(describeMarkup(markup("64.99", "59.99")!)).toBe("$5.00 (8%) over MSRP");
    expect(describeMarkup(markup("49.99", "59.99")!)).toBe("$10.00 (17%) under MSRP");
    expect(describeMarkup(markup("59.99", "59.99")!)).toBe("At MSRP");
    expect(describeMarkup(markup("1299.99", "99.99")!)).toBe("$1,200.00 (1200%) over MSRP");
    expect(shortMarkup(markup("64.99", "59.99")!)).toBe("+8%");
    expect(shortMarkup(markup("49.99", "59.99")!)).toBe("−17%");
    expect(shortMarkup(markup("60.19", "59.99")!)).toBe("+<1%");
  });
});
