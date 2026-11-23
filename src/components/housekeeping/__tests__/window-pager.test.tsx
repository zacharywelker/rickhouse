import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));

import { WindowPager } from "../window-pager";
import { pageWindow } from "@/lib/housekeeping/photo-params";
import type { PageState } from "@/lib/housekeeping/page-state";

const state: PageState = { tab: "barrels", per: 12, offset: 5, dup: "stores", ttbOffset: 8, ttbPer: 8 };

describe("WindowPager", () => {
  it("shows the range, and moves only the TTB window, keeping the other sections' places", () => {
    const html = renderToStaticMarkup(<WindowPager state={state} total={30} window={pageWindow(30, 8, 8)} />);
    expect(html).toContain("9–16 of 30");
    expect(html).toContain('href="/housekeeping?tab=barrels&amp;per=12&amp;offset=5&amp;dup=stores"'); // Previous: back to the start
    expect(html).toContain('href="/housekeeping?tab=barrels&amp;per=12&amp;offset=5&amp;dup=stores&amp;to=16"'); // Next
  });

  it("disables Previous on the first window and Next on the last", () => {
    const first = renderToStaticMarkup(<WindowPager state={{ ...state, ttbOffset: 0 }} total={30} window={pageWindow(30, 8, 0)} />);
    expect(first).toMatch(/<button[^>]*disabled[^>]*>Previous<\/button>/);
    expect(first).toContain(">Next</a>");
    const last = renderToStaticMarkup(<WindowPager state={{ ...state, ttbOffset: 24 }} total={30} window={pageWindow(30, 8, 24)} />);
    expect(last).toMatch(/<button[^>]*disabled[^>]*>Next<\/button>/);
    expect(last).toContain("25–30 of 30");
  });

  it("uses the TTB page size, not the Photos one", () => {
    const html = renderToStaticMarkup(<WindowPager state={{ ...state, ttbPer: 12, ttbOffset: 0 }} total={40} window={pageWindow(40, 12, 0)} />);
    expect(html).toContain("1–12 of 40");
    expect(html).toContain("&amp;to=12&amp;tp=12");
  });
});
