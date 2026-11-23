import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The row embeds the label page's search dialog and paste field, which reach for the router and server actions.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/(app)/expressions/cola-actions", () => ({
  addColaAction: vi.fn(),
  attachColasAction: vi.fn(),
  colaPermitHintsAction: vi.fn(),
  searchColasAction: vi.fn(),
}));
vi.mock("@/app/(app)/housekeeping/ttb-actions", () => ({ dismissTtbAction: vi.fn() }));

import { TtbRowView } from "../ttb-row";
import type { TtbRow } from "@/lib/housekeeping/ttb-queries";

const row: TtbRow = { expressionId: 7, name: "Old Forester 1920 Prohibition Style", brandName: "Old Forester", meta: "Bourbon · 3 bottles" };

describe("TtbRowView", () => {
  it("shows the label and how many bottles it has", () => {
    const html = renderToStaticMarkup(<TtbRowView row={row} lookupEnabled />);
    expect(html).toContain("Old Forester 1920 Prohibition Style");
    expect(html).toContain("Bourbon · 3 bottles");
  });

  it("offers the label page's search, a paste field for an ID or link, and Not on TTB", () => {
    const html = renderToStaticMarkup(<TtbRowView row={row} lookupEnabled />);
    expect(html).toContain("Find on TTB");
    expect(html).toContain("TTB ID");
    expect(html).toContain('placeholder="21132001000620"');
    expect(html).toContain("Not on TTB");
  });

  it("offers no search when lookups are off, but still takes a pasted ID", () => {
    const html = renderToStaticMarkup(<TtbRowView row={row} lookupEnabled={false} />);
    expect(html).not.toContain("Find on TTB");
    expect(html).toContain("TTB ID");
    expect(html).toContain("Not on TTB");
  });

  it("is a named group", () => {
    const html = renderToStaticMarkup(<TtbRowView row={row} lookupEnabled />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Old Forester 1920 Prohibition Style: no TTB approval"');
  });
});
