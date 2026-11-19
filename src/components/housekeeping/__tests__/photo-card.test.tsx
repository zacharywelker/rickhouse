import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The card embeds the photo controls, which reach for the router and two server actions.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/(app)/expressions/photo-actions", () => ({ removeLabelPhotoAction: vi.fn() }));
vi.mock("@/app/(app)/expressions/release-actions", () => ({ removeReleasePhotoAction: vi.fn() }));
// The frame's handwriting fonts come from next/font, which only exists inside a Next build.
vi.mock("@/lib/tape-fonts", () => ({ TAPE_FONTS: [{ className: "font-test" }] }));

import { firstImage, PhotoCard } from "../photo-card";
import type { MissingPhoto } from "@/lib/housekeeping/photo-queries";

const file = (name: string, type: string) => new File(["x"], name, { type });

describe("firstImage", () => {
  it("takes the first image when other files come first", () => {
    const png = file("a.png", "image/png");
    expect(firstImage([file("a.txt", "text/plain"), png])).toBe(png);
  });

  it("is null when there is no image to take", () => {
    expect(firstImage([file("a.pdf", "application/pdf")])).toBeNull();
    expect(firstImage([])).toBeNull();
    expect(firstImage(null)).toBeNull();
    expect(firstImage(undefined)).toBeNull();
  });
});

const label: MissingPhoto = {
  key: "label:12",
  name: "Old Forester 1920",
  meta: "Bourbon · 3 bottles",
  seed: 12,
  target: { kind: "label", expressionId: 12 },
};

describe("PhotoCard markup", () => {
  it("shows a label with the same controls as the label page, and can take focus", () => {
    const html = renderToStaticMarkup(<PhotoCard item={label} />);
    expect(html).toContain("Old Forester 1920");
    expect(html).toContain("Bourbon · 3 bottles");
    expect(html).toContain("No photo yet");
    expect(html).toContain("Add photo");
    expect(html).toContain("From a link");
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain('aria-label="Upload label photo"');
  });

  it("saves a barrel to its bottle", () => {
    const barrel: MissingPhoto = { ...label, key: "barrel:5", seed: 5, target: { kind: "barrel", bottleId: 5 } };
    const html = renderToStaticMarkup(<PhotoCard item={barrel} />);
    expect(html).toContain('aria-label="Upload bottle photo"');
    expect(html).not.toContain("Upload label photo");
  });

  it("saves a vintage as a label-style photo", () => {
    const vintage: MissingPhoto = {
      ...label,
      key: "vintage:3",
      seed: 3,
      target: { kind: "vintage", expressionId: 12, vintageId: 3 },
    };
    const html = renderToStaticMarkup(<PhotoCard item={vintage} />);
    expect(html).toContain('aria-label="Upload label photo"');
  });
});
