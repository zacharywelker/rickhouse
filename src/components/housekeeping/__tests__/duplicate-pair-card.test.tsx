import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The card calls two server actions; neither runs in a static render.
vi.mock("@/app/(app)/housekeeping/duplicate-actions", () => ({ mergePairAction: vi.fn(), dismissPairAction: vi.fn() }));

import { DuplicatePairCard } from "../duplicate-pair-card";
import type { PairView } from "@/lib/housekeeping/duplicate-queries";
import type { MergePreview } from "@/lib/housekeeping/merge-reference";

const ok = (moves: MergePreview["moves"], adoptable: MergePreview["adoptable"] = []): MergePreview => ({ moves, adoptable, blocked: null });

const distilleries: PairView = {
  key: "4:9",
  kind: "distilleries",
  score: 1,
  reason: "Same name once “Distillery” is dropped",
  a: { id: 4, name: "Buffalo Trace", detail: "Frankfort, KY", uses: 12, fields: { city: "Frankfort" } },
  b: { id: 9, name: "Buffalo Trace Distillery", detail: "", uses: 3, fields: { city: null } },
};
const previews = {
  aKeeps: ok([{ label: "labels", count: 3 }]),
  bKeeps: ok([{ label: "labels", count: 12 }], [{ field: "city", label: "City", value: "Frankfort" }]),
};

describe("DuplicatePairCard", () => {
  it("shows why the pair matched, both sides and how many labels use each", () => {
    const html = renderToStaticMarkup(<DuplicatePairCard pair={distilleries} previews={previews} />);
    expect(html).toContain("Very likely");
    expect(html).toContain("Same name once “Distillery” is dropped");
    expect(html).toContain("Buffalo Trace Distillery");
    expect(html).toContain("12 labels");
    expect(html).toContain("3 labels");
    expect(html).toContain("Frankfort, KY");
    expect(html).toContain('role="group"');
  });

  it("keeps the busier side by default and says exactly what moves, including the kept name for a distillery", () => {
    const html = renderToStaticMarkup(<DuplicatePairCard pair={distilleries} previews={previews} />);
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain("Keep this one");
    expect(html).toMatch(/Merging moves <b[^>]*>3 labels<\/b> to <b[^>]*>Buffalo Trace<\/b>/);
    expect(html).toContain("keeps “Buffalo Trace Distillery” as another name");
  });

  it("has no other-name clause for kinds that have no other names", () => {
    const brands: PairView = { ...distilleries, kind: "brands", reason: "Same name apart from spacing and punctuation", score: 0 };
    const html = renderToStaticMarkup(<DuplicatePairCard pair={brands} previews={previews} />);
    expect(html).not.toContain("as another name");
  });

  it("offers a field only the removed row has, ticked, when the other side would be kept", () => {
    const flipped: PairView = { ...distilleries, a: { ...distilleries.a, uses: 1 }, b: { ...distilleries.b, uses: 9 } };
    const html = renderToStaticMarkup(<DuplicatePairCard pair={flipped} previews={previews} />);
    expect(html).toContain("Also keep");
    expect(html).toContain("City");
    expect(html).toContain("Frankfort");
  });

  it("says why a merge cannot happen and does not offer to run it", () => {
    const blocked = {
      aKeeps: { moves: [], adoptable: [], blocked: "Both brands have a label called “X”. Merge those labels first." },
      bKeeps: { moves: [], adoptable: [], blocked: "Both brands have a label called “X”. Merge those labels first." },
    };
    const html = renderToStaticMarkup(<DuplicatePairCard pair={{ ...distilleries, kind: "brands" }} previews={blocked} />);
    expect(html).toContain("Both brands have a label called “X”. Merge those labels first.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Merge<\/button>/);
    expect(html).toContain("Not a duplicate");
  });

  it("says when nothing points at the removed row", () => {
    const html = renderToStaticMarkup(
      <DuplicatePairCard pair={{ ...distilleries, kind: "tags" }} previews={{ aKeeps: ok([]), bKeeps: ok([]) }} />,
    );
    expect(html).toContain("Nothing points at");
  });

  it("names the group for a screen reader", () => {
    const html = renderToStaticMarkup(<DuplicatePairCard pair={distilleries} previews={previews} />);
    expect(html).toContain('aria-label="Likely duplicates: Buffalo Trace and Buffalo Trace Distillery"');
  });
});
