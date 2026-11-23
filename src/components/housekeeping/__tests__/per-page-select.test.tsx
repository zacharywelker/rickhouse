import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {} }), useSearchParams: () => new URLSearchParams() }));

import { PerPageSelect } from "../per-page-select";

describe("PerPageSelect", () => {
  it("is named Per page by default and shows the current choice", () => {
    const html = renderToStaticMarkup(<PerPageSelect per={12} options={[8, 12, 24, 48]} />);
    expect(html).toContain('aria-label="Per page"');
    expect(html).toMatch(/<option[^>]*value="12"[^>]*selected/);
  });

  it("takes its own name, so two on one page can be told apart", () => {
    const html = renderToStaticMarkup(<PerPageSelect per={8} options={[8, 12]} label="TTB per page" param="tp" resetParam="to" />);
    expect(html).toContain('aria-label="TTB per page"');
  });
});
