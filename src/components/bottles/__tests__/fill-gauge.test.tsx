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

/** The opening tag of the element marked `data-part="<name>"`. */
function part(html: string, name: string): string {
  const match = html.match(new RegExp(`<[a-z]+[^>]*data-part="${name}"[^>]*>`));
  if (!match) throw new Error(`no ${name} in the dial`);
  return match[0];
}

describe("FillGauge keeps its parts mounted so opening and sealing can animate", () => {
  const sealed = renderToStaticMarkup(<FillGauge value={100} sealed height={104} />);
  const open = renderToStaticMarkup(<FillGauge value={50} height={104} />);

  it("parks the needle at Empty and hides it while sealed", () => {
    expect(part(sealed, "needle")).toContain("rotate(-90deg)");
    expect(part(sealed, "needle")).toContain("opacity:0");
  });

  it("points the needle at the level once open", () => {
    expect(part(open, "needle")).toContain("rotate(0deg)");
    expect(part(open, "needle")).toContain("opacity:1");
  });

  it("shows the seal while sealed and pops it away once open", () => {
    expect(part(sealed, "seal")).toContain("opacity:1");
    expect(part(open, "seal")).toContain("opacity:0");
    expect(part(open, "seal")).toContain("scale(0.4)");
  });

  it("draws no sweep while sealed, and the whole level once open", () => {
    expect(part(sealed, "sweep")).toContain('stroke-dasharray="0 100"');
    expect(part(open, "sweep")).toContain('stroke-dasharray="50 100"');
  });

  it("fades the hatching out once open", () => {
    expect(part(sealed, "hatch")).toContain("opacity:1");
    expect(part(open, "hatch")).toContain("opacity:0");
  });
});
