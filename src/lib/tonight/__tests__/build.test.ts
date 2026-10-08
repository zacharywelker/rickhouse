import { describe, expect, it } from "vitest";
import { daysBetween, optionsFor, pickFor, type PickRequest, type ShelfBottle, type TastingRow, type TonightData } from "../build";

const BOURBON = 1;
const RYE = 2;
const SCOTCH = 3;
const AMARO = 4;
const NAMES: Record<number, string> = { [BOURBON]: "Bourbon", [RYE]: "Rye", [SCOTCH]: "Scotch", [AMARO]: "Amaro" };

let nextId = 100;
const shelf = (over: Partial<ShelfBottle> & { categoryId: number }): ShelfBottle => {
  const id = nextId++;
  return {
    id,
    expressionId: id,
    brand: `Brand ${id}`,
    name: `Name ${id}`,
    category: NAMES[over.categoryId]!,
    sealed: false,
    fillPct: 60,
    proof: 90,
    dateAcquired: "2026-01-01",
    thumbPath: null,
    mutedUntil: null,
    ...over,
  };
};

const tasting = (expressionId: number, categoryId: number, over: Partial<TastingRow> = {}): TastingRow => ({
  expressionId,
  categoryId,
  tags: [],
  tastedOn: "2026-09-30",
  rating: 4,
  ...over,
});

const many = (n: number, make: (i: number) => TastingRow): TastingRow[] => Array.from({ length: n }, (_, i) => make(i));

function fixture(over: Partial<TonightData> = {}) {
  const bourbon = [
    shelf({ categoryId: BOURBON, proof: 90 }),
    shelf({ categoryId: BOURBON, proof: 100 }),
    shelf({ categoryId: BOURBON, proof: 126 }),
    shelf({ categoryId: BOURBON, proof: 93, sealed: true }),
  ];
  const rye = [shelf({ categoryId: RYE, proof: 100 }), shelf({ categoryId: RYE, proof: 90, sealed: true })];
  const amaro = [shelf({ categoryId: AMARO, proof: 33 })];
  const bottles = [...bourbon, ...rye, ...amaro];
  const tastings = [
    // 31 bourbon tastings, spread over the three open bottles' labels
    ...many(31, (i) => tasting(bourbon[i % 3]!.expressionId, BOURBON, { tags: i % 2 ? ["oak", "caramel"] : ["oak", "vanilla"], tastedOn: "2026-09-20" })),
    // 9 rye tastings: one short
    ...many(9, () => tasting(rye[0]!.expressionId, RYE, { tags: ["spice"], tastedOn: "2026-07-01" })),
  ];
  const data: TonightData = {
    today: "2026-10-07",
    bottles,
    tastings,
    hasWheel: (id) => id !== AMARO,
    flavorLabel: (key) => key.charAt(0).toUpperCase() + key.slice(1),
    ...over,
  };
  return { data, bourbon, rye, amaro };
}

const sel = { categories: [], sealed: false, bands: [], flavors: [] };
const req = (over: Partial<PickRequest> = {}): PickRequest => ({ mode: "flow", exclude: [], ...sel, ...over });

describe("daysBetween", () => {
  it("counts calendar days", () => {
    expect(daysBetween("2026-08-14", "2026-10-07")).toBe(54);
    expect(daysBetween("2026-10-07", "2026-10-07")).toBe(0);
  });
});

describe("optionsFor: spirits", () => {
  it("lists the spirits on the shelf with open, sealed and muted counts", () => {
    const { data, bourbon } = fixture();
    data.bottles[0] = { ...data.bottles[0]!, mutedUntil: "2026-10-14" };
    const { spirits } = optionsFor(data, sel);
    expect(spirits.map((s) => s.name)).toEqual(["Amaro", "Bourbon", "Rye"]);
    expect(spirits.find((s) => s.name === "Bourbon")).toMatchObject({ open: 2, sealed: 1, muted: 1, tastings: 31, flavors: true });
    expect(spirits.find((s) => s.name === "Rye")).toMatchObject({ open: 1, sealed: 1, muted: 0, tastings: 9, flavors: false });
    expect(bourbon).toHaveLength(4);
  });

  it("treats a mute as lapsed once its date is today or past", () => {
    const { data } = fixture();
    data.bottles[0] = { ...data.bottles[0]!, mutedUntil: "2026-10-07" };
    expect(optionsFor(data, sel).spirits.find((s) => s.name === "Bourbon")).toMatchObject({ open: 3, muted: 0 });
  });
});

describe("optionsFor: proof", () => {
  it("applies when the bottles in play span 15 proof, and counts bands", () => {
    const { data } = fixture();
    const { proof } = optionsFor(data, { categories: [BOURBON], sealed: false });
    expect(proof.applies).toBe(true);
    expect(proof).toMatchObject({ lo: 90, hi: 126 });
    expect(proof.bands.map((b) => b.count)).toEqual([0, 2, 1]);
  });

  it("is skipped for rye, whose proofs sit 10 apart", () => {
    const { data } = fixture();
    expect(optionsFor(data, { categories: [RYE], sealed: true }).proof.applies).toBe(false);
  });

  it("follows the sealed switch", () => {
    const { data } = fixture();
    const off = optionsFor(data, { categories: [BOURBON], sealed: false }).proof.bands.map((b) => b.count);
    const on = optionsFor(data, { categories: [BOURBON], sealed: true }).proof.bands.map((b) => b.count);
    expect(off).toEqual([0, 2, 1]);
    expect(on).toEqual([0, 3, 1]);
  });
});

describe("optionsFor: flavors", () => {
  it("offers the flavors tasted most for a spirit with enough tastings", () => {
    const { data } = fixture();
    const { flavors, fallback } = optionsFor(data, { categories: [BOURBON], sealed: false });
    expect(flavors.enabled).toBe(true);
    expect(flavors.tags.map((t) => [t.key, t.count])).toEqual([["oak", 31], ["caramel", 15], ["vanilla", 16]].sort((a, b) => (b[1] as number) - (a[1] as number)));
    expect(flavors.skipped).toEqual([]);
    expect(fallback).toBeNull();
  });

  it("offers none for rye alone and falls back to 'time to open a new bottle'", () => {
    const { data } = fixture();
    const { flavors, fallback } = optionsFor(data, { categories: [RYE], sealed: false });
    expect(flavors.enabled).toBe(false);
    expect(fallback).toEqual({ tastings: 9, spirits: ["Rye"], open: 1, sealed: 1 });
  });

  it("with bourbon and rye, takes flavors from bourbon only and says rye was skipped", () => {
    const { data } = fixture();
    const { flavors } = optionsFor(data, { categories: [BOURBON, RYE], sealed: false });
    expect(flavors.enabled).toBe(true);
    expect(flavors.tags.some((t) => t.key === "spice")).toBe(false);
    expect(flavors.skipped).toEqual([{ categoryId: RYE, name: "Rye", tastings: 9 }]);
  });

  it("needs 25 tastings in the whole account, however many a spirit has", () => {
    const { data } = fixture();
    data.tastings = data.tastings.slice(0, 24).map((t) => ({ ...t, categoryId: BOURBON }));
    const { flavors, spirits } = optionsFor(data, { categories: [BOURBON], sealed: false });
    expect(flavors.enabled).toBe(false);
    expect(spirits.find((s) => s.name === "Bourbon")!.flavors).toBe(false);
  });

  it("never offers flavors for a spirit with no wheel", () => {
    const { data } = fixture();
    const { flavors, fallback } = optionsFor(data, { categories: [AMARO], sealed: false });
    expect(flavors.enabled).toBe(false);
    expect(fallback).toMatchObject({ spirits: ["Amaro"], open: 1 });
  });
});

describe("pickFor", () => {
  it("never picks a muted, sealed (unless included) or excluded bottle", () => {
    const { data, bourbon } = fixture();
    data.bottles[0] = { ...data.bottles[0]!, mutedUntil: "2026-10-14" };
    const seen = new Set<number>();
    for (let r = 0; r < 1; r += 0.01) {
      const pick = pickFor(data, req({ categories: [BOURBON], exclude: [bourbon[1]!.id] }), () => r);
      if (pick) seen.add(pick.bottle.id);
    }
    expect([...seen]).toEqual([bourbon[2]!.id]);
  });

  it("includes sealed bottles when asked", () => {
    const { data, bourbon } = fixture();
    const seen = new Set<number>();
    for (let r = 0; r < 1; r += 0.01) seen.add(pickFor(data, req({ categories: [BOURBON], sealed: true }), () => r)!.bottle.id);
    expect(seen.has(bourbon[3]!.id)).toBe(true);
  });

  it("filters by the chosen proof bands", () => {
    const { data, bourbon } = fixture();
    const seen = new Set<number>();
    for (let r = 0; r < 1; r += 0.01) seen.add(pickFor(data, req({ categories: [BOURBON], bands: ["barrel"] }), () => r)!.bottle.id);
    expect([...seen]).toEqual([bourbon[2]!.id]);
  });

  it("uses only sealed (or only open) bottles for the fallback's two buttons, whatever the switch says", () => {
    const { data, rye } = fixture();
    const sealed = pickFor(data, req({ categories: [RYE], only: "sealed" }), () => 0.5)!;
    expect(sealed.bottle.id).toBe(rye[1]!.id);
    const open = pickFor(data, req({ categories: [RYE], only: "open", sealed: true }), () => 0.5)!;
    expect(open.bottle.id).toBe(rye[0]!.id);
  });

  it("leans toward matches without ruling anyone out (bourbon and rye, caramel)", () => {
    const { data, bourbon, rye } = fixture();
    const hits = new Map<number, number>();
    const runs = 1000;
    for (let i = 0; i < runs; i++) {
      const pick = pickFor(data, req({ categories: [BOURBON, RYE], flavors: ["caramel"] }), () => (i + 0.5) / runs)!;
      hits.set(pick.bottle.id, (hits.get(pick.bottle.id) ?? 0) + 1);
    }
    // Every open bottle of both spirits is still reachable, including the rye that has no usable notes.
    for (const b of [bourbon[0]!, bourbon[1]!, bourbon[2]!, rye[0]!]) expect(hits.get(b.id) ?? 0).toBeGreaterThan(0);
    expect(hits.has(bourbon[3]!.id)).toBe(false); // sealed, switch off
  });

  it("explains a rye pick as a wildcard when flavors were chosen", () => {
    const { data, rye } = fixture();
    const pick = pickFor(data, req({ categories: [RYE], flavors: ["caramel"], only: undefined }), () => 0)!;
    expect(pick.bottle.id).toBe(rye[0]!.id);
    expect(pick.why).toEqual(["A wildcard: not enough rye tastings to match on flavor.", "Last tasted 98 days ago."]);
  });

  it("returns null and counts what is left", () => {
    const { data, amaro } = fixture();
    expect(pickFor(data, req({ categories: [AMARO], exclude: [amaro[0]!.id] }))).toBeNull();
    const pick = pickFor(data, req({ categories: [BOURBON] }), () => 0)!;
    expect(pick.left).toBe(2);
  });

  it("gives Roulette every open bottle uniformly, ignoring spirit, proof and flavors, but obeying mutes and the switch", () => {
    const { data, bourbon, rye, amaro } = fixture();
    data.bottles[0] = { ...data.bottles[0]!, mutedUntil: "2026-10-14" };
    const seen = new Set<number>();
    for (let r = 0; r < 1; r += 0.005) {
      const pick = pickFor(data, req({ mode: "roulette", categories: [RYE], bands: ["barrel"], flavors: ["oak"] }), () => r)!;
      seen.add(pick.bottle.id);
      expect(pick.why).toEqual([]);
    }
    expect(seen).toEqual(new Set([bourbon[1]!.id, bourbon[2]!.id, rye[0]!.id, amaro[0]!.id]));
  });

  it("reports the label's last tasting", () => {
    const { data, rye } = fixture();
    const pick = pickFor(data, req({ categories: [RYE], only: "open" }), () => 0)!;
    expect(pick.bottle.lastTasted).toEqual({ on: "2026-07-01", rating: 4, daysAgo: 98 });
    const never = pickFor(data, req({ categories: [RYE], only: "sealed" }), () => 0)!;
    expect(never.bottle.id).toBe(rye[1]!.id);
    expect(never.bottle.lastTasted).toBeNull();
  });
});
