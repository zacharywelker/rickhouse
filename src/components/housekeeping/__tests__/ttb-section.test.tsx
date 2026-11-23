import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/(app)/expressions/cola-actions", () => ({
  addColaAction: vi.fn(),
  attachColasAction: vi.fn(),
  colaPermitHintsAction: vi.fn(),
  searchColasAction: vi.fn(),
}));
vi.mock("@/app/(app)/housekeeping/ttb-actions", () => ({ dismissTtbAction: vi.fn() }));

import { TtbSection } from "../ttb-section";
import { pageWindow } from "@/lib/housekeeping/photo-params";
import type { PageState } from "@/lib/housekeeping/page-state";
import type { TtbRow } from "@/lib/housekeeping/ttb-queries";

const state: PageState = { tab: "labels", per: 8, offset: 0, dup: null, ttbOffset: 0, ttbPer: 8 };
const rows: TtbRow[] = [
  { expressionId: 1, name: "Four Roses Single Barrel", brandName: "Four Roses", meta: "Bourbon · 1 bottle" },
  { expressionId: 2, name: "Hibiki Harmony", brandName: "Hibiki", meta: "Japanese whiskey · 2 bottles" },
];

describe("TtbSection", () => {
  it("lists each label with its actions under a heading", () => {
    const html = renderToStaticMarkup(<TtbSection state={state} total={2} rows={rows} window={pageWindow(2, 8, 0)} lookupEnabled />);
    expect(html).toContain("TTB approvals");
    expect(html).toContain("Four Roses Single Barrel");
    expect(html).toContain("Hibiki Harmony");
    expect(html.match(/>Find on TTB[^<]*<\/button>/g)).toHaveLength(2);
    expect(html).toContain("1–2 of 2");
    expect(html).toContain('aria-label="TTB per page"');
  });

  it("says why there is no search when lookups are off", () => {
    const html = renderToStaticMarkup(<TtbSection state={state} total={2} rows={rows} window={pageWindow(2, 8, 0)} lookupEnabled={false} />);
    expect(html).toContain("Searching TTB is off on this server. Paste a TTB ID or link instead.");
    expect(html).not.toContain("Find on TTB");
  });

  it("says so when there is nothing to do", () => {
    const html = renderToStaticMarkup(<TtbSection state={state} total={0} rows={[]} window={pageWindow(0, 8, 0)} lookupEnabled />);
    expect(html).toContain("Every label has a TTB approval, or you marked it as not on file.");
  });
});
