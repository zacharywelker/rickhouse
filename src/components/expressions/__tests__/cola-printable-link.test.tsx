import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { colaFormUrl } from "@/lib/cola/ids";
import { PrintableLink } from "../cola-printable-link";

const ID = "21132001000620";

describe("PrintableLink", () => {
  it("links to the printable form in a new tab", () => {
    const html = renderToStaticMarkup(<PrintableLink ttbId={ID} />);
    expect(html).toContain(`href="${colaFormUrl(ID).replace(/&/g, "&amp;")}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain('title="Printable version"');
  });

  it("names itself for assistive tech", () => {
    expect(renderToStaticMarkup(<PrintableLink ttbId={ID} />)).toContain(`aria-label="Printable version of ${ID}"`);
  });

  it("is one anchor and hides its icon", () => {
    const html = renderToStaticMarkup(<PrintableLink ttbId={ID} />);
    expect(html.match(/<a[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("renders nothing for an ID that is not 14 digits", () => {
    expect(renderToStaticMarkup(<PrintableLink ttbId="123" />)).toBe("");
    expect(renderToStaticMarkup(<PrintableLink ttbId={`${ID}&x=1`} />)).toBe("");
  });

  it("passes a class through", () => {
    expect(renderToStaticMarkup(<PrintableLink ttbId={ID} className="ml-2" />)).toContain("ml-2");
  });
});
