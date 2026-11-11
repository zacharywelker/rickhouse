import { describe, expect, it } from "vitest";
import { applyMoves, buildChanges, editKey, labelEditsOf, moveCandidates, setMove } from "../changes";
import { EDITORS, setEdit, type Edits } from "../editors";
import type { SheetBottle, SheetLabel, SheetRow } from "../sheet";

const mk = (id: number, brandId: number, brand: string, name: string, bottleCount: number) => ({ id, brandId, brand, name, category: "Bourbon", bottleCount }) as unknown as SheetLabel;
const labels = [mk(1, 10, "Four Roses", "Single Barrel", 3), mk(2, 10, "Four Roses", "Small Batch", 1), mk(3, 11, "Buffalo Trace", "Eagle Rare", 2)];
const bottle = (id: number, expressionId: number): SheetBottle => ({ id, expressionId } as unknown as SheetBottle);
const bottles = [bottle(7, 1), bottle(8, 1), bottle(9, 1), bottle(20, 2)];
const row = (b: SheetBottle): SheetRow => ({ key: `b${b.id}`, label: labels.find((l) => l.id === b.expressionId)!, bottle: b });

describe("where an edit is kept", () => {
  it("keeps a bottle's own cell under the bottle, so it changes that bottle only", () => {
    expect(editKey(row(bottles[0]!), EDITORS.pricePaid!)).toBe("b7");
    expect(editKey(row(bottles[0]!), EDITORS.ownProof!)).toBe("b7");
  });
  it("keeps a label's cell under the label, so every bottle row of it shows the change", () => {
    const edits = setEdit({}, editKey(row(bottles[0]!), EDITORS.proof!), "proof", "101", "100");
    for (const b of bottles.slice(0, 3)) expect(labelEditsOf(edits, row(b))).toEqual({ proof: "101" });
    expect(labelEditsOf(edits, row(bottles[3]!))).toBeUndefined();
  });
  it("keeps everything on a new row under the row", () => {
    const draft: SheetRow = { ...row(bottles[0]!), key: "d0", draft: { brandChosen: true, labelChosen: true, brandIsNew: true, labelIsNew: true } };
    expect(editKey(draft, EDITORS.proof!)).toBe("d0");
    expect(labelEditsOf({ l1: { proof: "1" } }, draft)).toBeUndefined();
  });
});

describe("what saving would send", () => {
  it("a bottle-column edit changes one bottle and no label", () => {
    const edits: Edits = { b7: { pricePaid: "52" } };
    expect(buildChanges(edits, {}, labels, bottles)).toEqual({ bottles: [{ bottleId: 7, fields: { pricePaid: "52" } }], labels: [] });
  });
  it("an edit to the bottle's own proof is that bottle's, not the label's", () => {
    const edits: Edits = { b7: { ownProof: "99" } };
    const out = buildChanges(edits, {}, labels, bottles);
    expect(out.bottles).toEqual([{ bottleId: 7, fields: { proof: "99" } }]);
    expect(out.labels).toEqual([]);
  });
  it("a label edit is one request for the label, reaching every bottle on it", () => {
    const edits: Edits = { l1: { msrp: "59" } };
    expect(buildChanges(edits, {}, labels, bottles)).toEqual({ bottles: [], labels: [{ labelId: 1, fields: { msrp: "59" }, bottles: 3 }] });
  });
  it("a rename and a brand change on a label go by the server's names", () => {
    expect(buildChanges({ l1: { name: "Single Barrel Select", brand: "Four Roses Distillery" } }, {}, labels, bottles).labels[0]!.fields).toEqual({ name: "Single Barrel Select", brand: "Four Roses Distillery" });
  });
  it("a move names the label the bottle goes to, and joins that bottle's other edits", () => {
    const out = buildChanges({ b7: { notes: "x" } }, { b7: 3, b20: 1 }, labels, bottles);
    expect(out.bottles).toEqual([{ bottleId: 7, fields: { notes: "x" }, moveToLabelId: 3 }, { bottleId: 20, fields: {}, moveToLabelId: 1 }]);
    expect(out.labels).toEqual([]);
  });
  it("leaves new rows and gone rows out", () => {
    expect(buildChanges({ d0: { proof: "1" }, b999: { notes: "x" }, l999: { msrp: "1" } }, {}, labels, bottles)).toEqual({ bottles: [], labels: [] });
  });
});

describe("moving a bottle", () => {
  it("shows a moved bottle on its new label, and says it moved", () => {
    const [moved, other] = applyMoves([row(bottles[0]!), row(bottles[1]!)], { b7: 3 }, labels);
    expect(moved).toMatchObject({ key: "b7", moved: true, label: { id: 3 } });
    expect(other).toMatchObject({ key: "b8", label: { id: 1 } });
    expect(other!.moved).toBeUndefined();
  });
  it("forgets a move back to the original label", () => {
    expect(setMove({ b7: 3 }, "b7", 1, 1)).toEqual({});
    const same = { b7: 3 };
    expect(setMove(same, "b7", 3, 1)).toBe(same);
    expect(setMove({}, "b7", 3, 1)).toEqual({ b7: 3 });
  });
  it("offers only labels that exist: every label from Brand, the brand's own from Label", () => {
    const r = row(bottles[0]!);
    expect(moveCandidates("brand", r, labels).map((c) => c.name)).toEqual(["Four Roses Single Barrel", "Four Roses Small Batch", "Buffalo Trace Eagle Rare"]);
    expect(moveCandidates("name", r, labels).map((c) => [c.id, c.name])).toEqual([[1, "Single Barrel"], [2, "Small Batch"]]);
    expect(moveCandidates("brand", r, labels).every((c) => c.id !== null)).toBe(true);
  });
});
