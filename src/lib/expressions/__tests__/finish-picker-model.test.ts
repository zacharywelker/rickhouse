import { describe, expect, it } from "vitest";
import type { LinkedRow } from "@/components/expressions/ordered-picker";
import { addFinishRow, effectiveRows, linesOf, totalsOf, withLines } from "../finish-picker-model";

const row = (id: number, extra: Partial<LinkedRow> = {}): LinkedRow => ({ id, label: `F${id}`, amount: "", ...extra });
const unfinished = (extra: Partial<LinkedRow> = {}): LinkedRow => ({ id: 0, label: "No finish", amount: "", unfinished: true, ...extra });

describe("finish picker model", () => {
  it("pairs a finish with the only mashbill, and says nothing when there are several", () => {
    expect(linesOf(row(1, { share: "40" }), [7])).toEqual([{ id: 7, share: "40" }]);
    expect(linesOf(row(1), [7, 8])).toEqual([]);
    expect(linesOf(row(1, { mashbills: [{ id: 8, share: "5" }] }), [7, 8])).toEqual([{ id: 8, share: "5" }]);
  });

  it("drops lines that name a mashbill taken off the label", () => {
    expect(linesOf(row(1, { mashbills: [{ id: 7, share: "5" }, { id: 8, share: "6" }] }), [8])).toEqual([{ id: 8, share: "6" }]);
  });

  it("a new finish starts on the first mashbill when there are several", () => {
    expect(addFinishRow(row(1), [7, 8]).mashbills).toEqual([{ id: 7, share: "" }]);
    expect(addFinishRow(row(1), [7]).mashbills).toBeUndefined();
  });

  it("a finish's share is the sum of its lines once there is more than one", () => {
    const out = withLines(row(1), [{ id: 7, share: "3" }, { id: 8, share: "12" }]);
    expect(out.share).toBe("15");
    expect(withLines(row(1), [{ id: 7, share: "9" }]).share).toBe("9");
    expect(withLines(row(1), [{ id: 7, share: "3" }, { id: 8, share: "" }]).share).toBe("");
  });

  it("totals the Blue Note shares per mashbill and reports 100", () => {
    const rows = [
      row(10, { mashbills: [{ id: 1, share: "3" }, { id: 3, share: "12" }] }),
      row(11, { mashbills: [{ id: 3, share: "2" }] }), row(12, { mashbills: [{ id: 2, share: "3" }] }),
      row(13, { mashbills: [{ id: 1, share: "3" }] }), row(14, { mashbills: [{ id: 3, share: "41" }] }),
      row(15, { mashbills: [{ id: 3, share: "15" }] }), row(16, { mashbills: [{ id: 3, share: "11" }] }), row(17, { mashbills: [{ id: 3, share: "10" }] }),
    ];
    const totals = totalsOf(rows, [1, 2, 3]);
    expect(totals).toMatchObject({ started: true, total: 100, error: null, mashbillShares: { 1: 6, 2: 3, 3: 91 } });
  });

  it("names the difference when shares do not add to 100, and stays quiet when none are typed", () => {
    expect(totalsOf([row(1, { mashbills: [{ id: 7, share: "60" }] }), row(2, { mashbills: [{ id: 7, share: "55" }] })], [7]).error).toMatch(/15 over/);
    expect(totalsOf([row(1, { mashbills: [{ id: 7, share: "" }] }), row(2, { mashbills: [{ id: 7, share: "" }] })], [7])).toMatchObject({ started: false, error: null });
  });

  it("fills a lone unfinished share with what the finishes leave", () => {
    const rows = [row(1, { share: "30" }), row(2, { share: "10" }), unfinished()];
    const eff = effectiveRows(rows, [7]);
    expect(eff.at(-1)).toMatchObject({ unfinished: true, mashbills: [{ id: 7, share: "60" }] });
    expect(totalsOf(rows, [7])).toMatchObject({ total: 100, error: null, mashbillShares: { 7: 100 } });
  });

  it("leaves a typed unfinished share alone", () => {
    const eff = effectiveRows([row(1, { share: "30" }), unfinished({ share: "50" })], [7]);
    expect(eff.at(-1)!.mashbills).toEqual([{ id: 7, share: "50" }]);
  });
});
