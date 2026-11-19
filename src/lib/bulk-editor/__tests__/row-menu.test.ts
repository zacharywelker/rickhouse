import { describe, expect, it } from "vitest";
import { menuDeleteIds, rowMenuItems } from "../row-menu";
import type { DraftMeta, SheetRow, SheetView } from "../sheet";

const BOTH: SheetView = { labels: true, bottles: true };
const LABELS: SheetView = { labels: true, bottles: false };
const BOTTLES: SheetView = { labels: false, bottles: true };

const savedRow = (over: { bottle?: boolean; bottleCount?: number } = {}): SheetRow =>
  ({ key: "b12", label: { id: 7, bottleCount: over.bottleCount ?? 3 }, bottle: over.bottle === false ? null : { id: 12 } }) as unknown as SheetRow;
const draftRow = (meta: Partial<DraftMeta> = {}): SheetRow =>
  ({ key: "d0", label: { id: -1, bottleCount: 0 }, bottle: null, draft: { brandChosen: false, labelChosen: false, brandIsNew: false, labelIsNew: false, ...meta } }) as unknown as SheetRow;

const ids = (items: ReturnType<typeof rowMenuItems>) => items.map((i) => i.id);
const byId = (items: ReturnType<typeof rowMenuItems>, id: string) => items.find((i) => i.id === id)!;

describe("a saved row's menu", () => {
  it("has the six items, in the agreed order, none dimmed", () => {
    const items = rowMenuItems(savedRow(), BOTH, { blank: false });
    expect(ids(items)).toEqual(["expand", "insert", "duplicateBottle", "duplicateLabel", "deleteLabel", "deleteBottle"]);
    expect(items.filter((i) => i.disabled)).toEqual([]);
    expect(items.map((i) => i.group)).toEqual([0, 0, 1, 1, 2, 2]);
  });
  it("marks the two deletes as destructive, and says Delete label takes its bottles when it has some", () => {
    const items = rowMenuItems(savedRow({ bottleCount: 3 }), BOTH, { blank: false });
    expect(byId(items, "deleteLabel")).toMatchObject({ label: "Delete label", danger: true, hint: "And its bottles" });
    expect(byId(items, "deleteBottle")).toMatchObject({ label: "Delete bottle", danger: true });
    expect(byId(items, "deleteBottle").hint).toBeUndefined();
  });
  it("gives Delete label no hint when the label has no bottles", () => {
    expect(byId(rowMenuItems(savedRow({ bottleCount: 0, bottle: false }), BOTH, { blank: false }), "deleteLabel").hint).toBeUndefined();
  });
  it("dims the bottle items on a label that has no bottle", () => {
    const items = rowMenuItems(savedRow({ bottle: false }), BOTH, { blank: false });
    expect(byId(items, "duplicateBottle").disabled).toBeTruthy();
    expect(byId(items, "deleteBottle").disabled).toBeTruthy();
    expect(byId(items, "duplicateLabel").disabled).toBeUndefined();
    expect(byId(items, "deleteLabel").disabled).toBeUndefined();
  });
  it("dims the bottle items in the Labels-only view, where a row is a label", () => {
    const items = rowMenuItems(savedRow({ bottle: false }), LABELS, { blank: false });
    expect(byId(items, "duplicateBottle").disabled).toBeTruthy();
    expect(byId(items, "deleteBottle").disabled).toBeTruthy();
  });
});

describe("a new, unsaved row's menu", () => {
  it("has Expand, Insert, both Duplicates dimmed, and Discard new row in place of the deletes", () => {
    const items = rowMenuItems(draftRow({ brandChosen: true, labelChosen: true, labelIsNew: true }), BOTH, { blank: false });
    expect(ids(items)).toEqual(["expand", "insert", "duplicateBottle", "duplicateLabel", "discard"]);
    expect(byId(items, "duplicateBottle").disabled).toBe("Not saved yet");
    expect(byId(items, "duplicateLabel").disabled).toBe("Not saved yet");
    expect(byId(items, "discard")).toMatchObject({ label: "Discard new row", danger: true, group: 2 });
    expect(byId(items, "discard").disabled).toBeUndefined();
  });
  it("dims Discard on the empty row at the bottom", () => {
    expect(byId(rowMenuItems(draftRow(), BOTH, { blank: true }), "discard").disabled).toBeTruthy();
  });
  it("dims Insert on the empty row at the bottom too, since there is nothing to insert it below, and only there", () => {
    expect(byId(rowMenuItems(draftRow(), BOTH, { blank: true }), "insert").disabled).toBeTruthy();
    expect(byId(rowMenuItems(draftRow(), BOTH, { blank: false }), "insert").disabled).toBeUndefined();
  });
  it("in the Bottles-only view, needs an existing label before Expand works", () => {
    expect(byId(rowMenuItems(draftRow(), BOTTLES, { blank: false }), "expand").disabled).toBe("Choose a label first");
    expect(byId(rowMenuItems(draftRow({ brandChosen: true, labelChosen: true, labelIsNew: true }), BOTTLES, { blank: false }), "expand").disabled).toBe("Choose a label first");
    expect(byId(rowMenuItems(draftRow({ brandChosen: true, labelChosen: true }), BOTTLES, { blank: false }), "expand").disabled).toBeUndefined();
  });
  it("lets Expand work in the other views, whatever the row has chosen", () => {
    expect(byId(rowMenuItems(draftRow(), BOTH, { blank: false }), "expand").disabled).toBeUndefined();
    expect(byId(rowMenuItems(draftRow(), LABELS, { blank: false }), "expand").disabled).toBeUndefined();
  });
});

describe("what the delete items delete", () => {
  it("Delete label is the row's label, whatever the row's own key", () => {
    expect(menuDeleteIds("deleteLabel", savedRow())).toEqual({ labelIds: [7], bottleIds: [] });
  });
  it("Delete bottle is the row's bottle, and only it", () => {
    expect(menuDeleteIds("deleteBottle", savedRow())).toEqual({ labelIds: [], bottleIds: [12] });
  });
});
