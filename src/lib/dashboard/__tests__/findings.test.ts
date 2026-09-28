import { describe, expect, it } from "vitest";
import { buildNumbers, type NumbersInput } from "../findings";

function input(overrides: Partial<{ [K in keyof NumbersInput]: Partial<NumbersInput[K]> }> = {}): NumbersInput {
  return {
    today: "2026-09-28",
    stockpile: {
      onShelf: 20,
      open: 10,
      sealed: 10,
      sealedDated: 10,
      sealedSince: 2021,
      sealedTwoYears: 0,
      medianWaitDays: null,
      waitSample: 0,
      lastPour: 0,
      finished: 0,
      finishedByYear: [],
      sealedByYear: [],
      ...overrides.stockpile,
    },
    money: {
      acquired: 20,
      priced: 20,
      spend: 1000,
      thisYear: 0,
      lastYearToDate: 0,
      msrpSample: 0,
      msrpPaid: 0,
      msrpList: 0,
      overMsrp: 0,
      openValue: 0,
      sealedValue: 0,
      storedSpend: 0,
      storedCount: 0,
      topStore: null,
      months: [],
      priciest: null,
      ...overrides.money,
    },
    acquiring: { acquired: 20, mix: [{ kind: "purchase", count: 20 }], favouriteStore: null, picks: 0, topPicker: null, ...overrides.acquiring },
    shelf: {
      onShelf: 20,
      caskStrength: 0,
      bottledInBond: 0,
      liquidMl: 0,
      medianAge: null,
      ageSample: 0,
      proofSample: 20,
      categories: [],
      proof: [],
      topDistillery: null,
      ...overrides.shelf,
    },
  };
}

describe("buildNumbers", () => {
  it("leads with the finding furthest from unremarkable", () => {
    // 18 of 20 sealed is far from half; spending pace is only 10% ahead.
    const { lead } = buildNumbers(
      input({ stockpile: { sealed: 18, open: 2 }, money: { thisYear: 1100, lastYearToDate: 1000 } }),
    );
    expect(lead?.id).toBe("sealed");
    expect(lead?.figure).toBe("18");
    expect(lead?.href).toBe("/bottles?open=closed");
  });

  it("is deterministic: ties go to chapter order", () => {
    const a = buildNumbers(input({ shelf: { liquidMl: 7500 } }));
    const b = buildNumbers(input({ shelf: { liquidMl: 7500 } }));
    expect(a.lead?.id).toBe(b.lead?.id);
  });

  it("does not repeat the lead inside its chapter", () => {
    const { lead, chapters } = buildNumbers(input({ stockpile: { sealed: 18, open: 2 } }));
    const stockpile = chapters.find((c) => c.id === "stockpile")!;
    expect(stockpile.findings.map((f) => f.id)).not.toContain(lead?.id);
  });

  it("omits a finding whose inputs are missing rather than showing zero", () => {
    const { chapters } = buildNumbers(input());
    const money = chapters.find((c) => c.id === "money")!;
    // No this-year or last-year spend, no MSRP sample, no store, no priciest bottle.
    expect(money.findings.map((f) => f.id)).toEqual([]);
  });

  it("reads pace against last year and links to this year's bottles", () => {
    const { chapters, lead } = buildNumbers(input({ money: { thisYear: 1200, lastYearToDate: 1000 } }));
    const pace = [lead, ...chapters.flatMap((c) => c.findings)].find((f) => f?.id === "pace")!;
    expect(pace.sentence).toBe("spent so far this year, 20% ahead of last year's pace.");
    expect(pace.href).toContain("acquiredFrom=2026-01-01");
    expect(pace.href).toContain("status=");
    expect(pace.href).not.toContain("wishlist");
  });

  it("marks a chapter with fewer than three usable bottles as thin", () => {
    const { chapters } = buildNumbers(input({ money: { priced: 2, acquired: 20 } }));
    const money = chapters.find((c) => c.id === "money")!;
    expect(money.thin).toBe(true);
    expect(money.coverage).toBe("Based on the 2 of 20 bottles with a price recorded.");
  });

  it("says nothing about coverage when everything was counted", () => {
    const { chapters } = buildNumbers(input());
    expect(chapters.find((c) => c.id === "money")!.coverage).toBeNull();
  });

  it("returns no lead for an empty collection", () => {
    const empty = buildNumbers(
      input({
        stockpile: { onShelf: 0, open: 0, sealed: 0, sealedDated: 0 },
        money: { acquired: 0, priced: 0, spend: 0 },
        acquiring: { acquired: 0, mix: [] },
        shelf: { onShelf: 0, proofSample: 0 },
      }),
    );
    expect(empty.lead).toBeNull();
    expect(empty.chapters.every((c) => c.findings.length === 0)).toBe(true);
  });

  it("shares a store's spend out of money whose store is known", () => {
    const { chapters, lead } = buildNumbers(
      input({ money: { spend: 1000, storedSpend: 200, storedCount: 5, topStore: { id: 4, name: "Neighborhood Liquor", spend: 150 } } }),
    );
    const store = [lead, ...chapters.flatMap((c) => c.findings)].find((f) => f?.id === "top-store-spend")!;
    expect(store.figure).toBe("75%");
    expect(store.href).toContain("store=4");
  });

  it("names no top distillery on a single bottle", () => {
    const { chapters } = buildNumbers(input({ shelf: { topDistillery: { id: 1, label: "Bardstown", slug: null, count: 1 } } }));
    expect(chapters.flatMap((c) => c.findings).map((f) => f.id)).not.toContain("top-distillery");
  });

  it("uses singular grammar for one", () => {
    const { lead } = buildNumbers(input({ stockpile: { onShelf: 3, open: 0, sealed: 3, sealedDated: 3 } }));
    expect(lead?.sentence).toBe("bottles on the shelf, and not one of them opened yet.");
    const one = buildNumbers(input({ acquiring: { acquired: 5, picks: 1, mix: [{ kind: "purchase", count: 5 }] } }));
    const picks = [one.lead, ...one.chapters.flatMap((c) => c.findings)].find((f) => f?.id === "picks")!;
    expect(picks.sentence).toBe("single-barrel pick on the shelf.");
  });
});
