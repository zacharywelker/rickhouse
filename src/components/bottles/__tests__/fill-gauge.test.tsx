import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FillGauge } from "../fill-gauge";

describe("FillGauge accessibility", () => {
  it("shows keyboard focus on the interactive dial", () => {
    const html = renderToStaticMarkup(<FillGauge value={50} onChange={() => {}} />);
    expect(html).toContain('role="slider"');
    expect(html).toContain("focus-visible:ring-2");
  });

  it("reads a sealed dial as Sealed to assistive tech", () => {
    const html = renderToStaticMarkup(<FillGauge value={100} sealed onChange={() => {}} />);
    expect(html).toContain('aria-valuetext="Sealed"');
  });

  it("leaves a read-only dial out of the tab order", () => {
    const html = renderToStaticMarkup(<FillGauge value={50} readOnly />);
    expect(html).not.toContain("tabindex");
    expect(html).toContain('role="img"');
  });
});
