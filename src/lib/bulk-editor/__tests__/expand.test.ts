import { describe, expect, it } from "vitest";
import { expandSteps } from "../expand";
import type { SheetRow, SheetView } from "../sheet";

const LABELS: SheetView = { labels: true, bottles: false };
const BOTTLES: SheetView = { labels: false, bottles: true };
const BOTH: SheetView = { labels: true, bottles: true };

const saved = (bottle: boolean): SheetRow => ({ key: bottle ? "b12" : "l7", label: { id: 7 }, bottle: bottle ? { id: 12 } : null }) as unknown as SheetRow;
const draft = { key: "d0", label: { id: -1 }, bottle: null, draft: { brandChosen: false, labelChosen: false, brandIsNew: false, labelIsNew: false } } as unknown as SheetRow;

describe("where a saved row expands to", () => {
  it("is the label's edit page when only Labels is on", () => {
    expect(expandSteps(saved(false), LABELS)).toEqual(["/expressions/7/edit"]);
  });
  it("is the bottle's edit page when only Bottles is on", () => {
    expect(expandSteps(saved(true), BOTTLES)).toEqual(["/bottles/12/edit"]);
  });
  it("is the label's edit page and then the bottle's when both are on", () => {
    expect(expandSteps(saved(true), BOTH)).toEqual(["/expressions/7/edit", "/bottles/12/edit"]);
  });
  it("is the label's edit page alone when both are on and the row has no bottle", () => {
    expect(expandSteps(saved(false), BOTH)).toEqual(["/expressions/7/edit"]);
  });
});

describe("a new row", () => {
  it("has no steps here: its pages need what it has typed (see expandStepsForDraft)", () => {
    expect(expandSteps(draft, BOTH)).toBeNull();
  });
});
