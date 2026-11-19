import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The controls reach for the router and two server actions; none of them runs in a static render.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/(app)/expressions/photo-actions", () => ({ removeLabelPhotoAction: vi.fn() }));
vi.mock("@/app/(app)/expressions/release-actions", () => ({ removeReleasePhotoAction: vi.fn() }));

import { LabelPhotoControls, uploadTarget } from "../label-photo-controls";

describe("uploadTarget", () => {
  it("posts a label's photo to the label route", () => {
    expect(uploadTarget({ expressionId: 7 })).toEqual({ url: "/api/expressions/7/photo", field: "photo" });
  });

  it("posts a vintage's photo to the vintage route", () => {
    expect(uploadTarget({ expressionId: 7, releaseId: 3 })).toEqual({
      url: "/api/expressions/7/vintages/3/photo",
      field: "photo",
    });
  });

  it("posts a bottle's photo to the bottle route under the field it expects", () => {
    expect(uploadTarget({ bottleId: 12 })).toEqual({ url: "/api/bottles/12/images", field: "images" });
  });

  it("refuses a target with neither an expression nor a bottle", () => {
    expect(() => uploadTarget({})).toThrow();
  });
});

describe("LabelPhotoControls markup", () => {
  it("is unchanged for a label with no photo", () => {
    const html = renderToStaticMarkup(<LabelPhotoControls expressionId={7} hasPhoto={false} />);
    expect(html).toContain("Add photo");
    expect(html).toContain("From a link");
    expect(html).toContain('aria-label="Upload label photo"');
    expect(html).not.toContain("Remove");
  });

  it("offers Replace and Remove for a label with a photo", () => {
    const html = renderToStaticMarkup(<LabelPhotoControls expressionId={7} hasPhoto />);
    expect(html).toContain("Replace photo");
    expect(html).toContain("Remove");
  });

  it("labels its file input for a bottle when it targets one", () => {
    const html = renderToStaticMarkup(<LabelPhotoControls bottleId={12} hasPhoto={false} housekeeping />);
    expect(html).toContain('aria-label="Upload bottle photo"');
    expect(html).not.toContain("Upload label photo");
  });
});
