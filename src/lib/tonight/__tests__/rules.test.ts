import { describe, expect, it } from "vitest";
import {
  addMonths,
  bandCounts,
  bandOf,
  checkMuteUntil,
  drawUniform,
  drawWeighted,
  hasNotes,
  inBands,
  mutePresets,
  muteWindow,
  nextDay,
  proofApplies,
  reasonsFor,
  spiritQualifies,
  weightOf,
  type Candidate,
} from "../rules";

const bottle = (over: Partial<Candidate> = {}): Candidate => ({
  id: 1,
  categoryId: 1,
  sealed: false,
  proof: 90,
  tags: [],
  daysSinceTasted: 10,
  spiritQualifies: true,
  ...over,
});

describe("spiritQualifies", () => {
  it("needs a wheel, ten tastings of the spirit and 25 overall", () => {
    expect(spiritQualifies({ tastings: 10, hasWheel: true }, 25)).toBe(true);
    expect(spiritQualifies({ tastings: 9, hasWheel: true }, 80)).toBe(false);
    expect(spiritQualifies({ tastings: 40, hasWheel: false }, 80)).toBe(false);
    expect(spiritQualifies({ tastings: 12, hasWheel: true }, 24)).toBe(false);
  });
});

describe("weightOf", () => {
  it("is 1 for a recently tasted bottle when no flavors are chosen", () => {
    expect(weightOf(bottle({ tags: ["a"] }), [])).toBe(1);
  });

  it("adds one for each chosen flavor the bottle's notes hold", () => {
    const b = bottle({ tags: ["caramel", "oak", "spice"] });
    expect(weightOf(b, ["caramel"])).toBe(2);
    expect(weightOf(b, ["caramel", "oak"])).toBe(3);
    expect(weightOf(b, ["cherry"])).toBe(1);
  });

  it("counts a bottle with no notes as one match, so unknown bottles are not punished", () => {
    expect(weightOf(bottle({ tags: [] }), ["caramel", "oak"])).toBe(2);
    expect(weightOf(bottle({ tags: ["oak"], spiritQualifies: false }), ["caramel", "oak"])).toBe(2);
  });

  it("adds one when the label was never tasted or not lately, with or without flavors", () => {
    expect(weightOf(bottle({ daysSinceTasted: null }), [])).toBe(2);
    expect(weightOf(bottle({ daysSinceTasted: 59 }), [])).toBe(1);
    expect(weightOf(bottle({ daysSinceTasted: 60 }), [])).toBe(2);
  });

  it("matches the worked example: bourbon and rye, Caramel and Oak", () => {
    const flavors = ["caramel", "oak"];
    const weights = [
      weightOf(bottle({ tags: ["caramel", "vanilla", "oak"], daysSinceTasted: 54 }), flavors), // Buffalo Trace
      weightOf(bottle({ tags: ["oak", "caramel", "spice"], daysSinceTasted: 35 }), flavors), // Elijah Craig
      weightOf(bottle({ tags: ["cherry", "spice", "oak"], daysSinceTasted: 17 }), flavors), // Four Roses
      weightOf(bottle({ tags: ["chocolate", "oak", "nutty"], daysSinceTasted: 69 }), flavors), // Booker's
      weightOf(bottle({ tags: ["vanilla", "oak", "cherry"], daysSinceTasted: 9 }), flavors), // Eagle Rare
      weightOf(bottle({ tags: ["spice", "oak"], spiritQualifies: false, daysSinceTasted: 65 }), flavors), // Rittenhouse
    ];
    expect(weights).toEqual([3, 3, 2, 3, 2, 3]);
  });
});

describe("drawing", () => {
  it("returns null from an empty list", () => {
    expect(drawWeighted([], () => 1)).toBeNull();
    expect(drawUniform([])).toBeNull();
  });

  it("walks the weights: the first item owns the first share of [0, 1)", () => {
    const items = [{ w: 3 }, { w: 1 }, { w: 2 }];
    const pick = (r: number) => drawWeighted(items, (i) => i.w, () => r);
    expect(pick(0)).toBe(items[0]);
    expect(pick(0.49)).toBe(items[0]);
    expect(pick(0.5)).toBe(items[1]);
    expect(pick(0.66)).toBe(items[1]);
    expect(pick(0.67)).toBe(items[2]);
    expect(pick(0.999)).toBe(items[2]);
  });

  it("is uniform for Roulette", () => {
    const items = ["a", "b", "c", "d"];
    expect(drawUniform(items, () => 0)).toBe("a");
    expect(drawUniform(items, () => 0.3)).toBe("b");
    expect(drawUniform(items, () => 0.99)).toBe("d");
  });

  it("stays in range even if random() returns exactly 1", () => {
    expect(drawWeighted(["a", "b"], () => 1, () => 1)).toBe("b");
  });
});

describe("proof", () => {
  it("puts proofs in bands, with the boundaries on the stronger side", () => {
    expect(bandOf(89.9)).toBe("easy");
    expect(bandOf(90)).toBe("standard");
    expect(bandOf(109.9)).toBe("standard");
    expect(bandOf(110)).toBe("barrel");
    expect(bandOf(null)).toBeNull();
  });

  it("filters only when a band is chosen, and a bottle with no proof fails a chosen band", () => {
    expect(inBands(null, [])).toBe(true);
    expect(inBands(100, ["standard"])).toBe(true);
    expect(inBands(100, ["easy", "barrel"])).toBe(false);
    expect(inBands(null, ["standard"])).toBe(false);
  });

  it("asks only when three bottles with a proof span 15 or more", () => {
    expect(proofApplies([90, 100, 100])).toBe(false); // 10 apart: rye
    expect(proofApplies([80, 95, 95])).toBe(true);
    expect(proofApplies([80, 120])).toBe(false); // two bottles
    expect(proofApplies([80, 120, null, null])).toBe(false); // only two known
    expect(proofApplies([])).toBe(false);
  });

  it("counts bottles per band", () => {
    expect(bandCounts([80, 90, 100, 126.2, null])).toEqual({ easy: 1, standard: 2, barrel: 1 });
  });
});

describe("reasonsFor", () => {
  const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);
  const spiritName = "Rye";

  it("says nothing about flavors when none were chosen", () => {
    expect(reasonsFor({ candidate: bottle(), flavors: [], flavorLabel: label, spiritName })).toEqual([]);
  });

  it("names the matched flavors", () => {
    const candidate = bottle({ tags: ["oak", "caramel", "spice"] });
    expect(reasonsFor({ candidate, flavors: ["oak", "caramel"], flavorLabel: label, spiritName })).toEqual(["Matches oak and caramel from your notes."]);
  });

  it("is honest about a pick that is not a flavor match", () => {
    const candidate = bottle({ tags: ["cherry"] });
    expect(reasonsFor({ candidate, flavors: ["oak"], flavorLabel: label, spiritName })).toEqual(["Not a flavor match. Flavors only nudge the draw."]);
  });

  it("calls a thin spirit's bottle a wildcard, and an untasted one a wildcard too", () => {
    const thin = bottle({ spiritQualifies: false, daysSinceTasted: 65 });
    expect(reasonsFor({ candidate: thin, flavors: ["oak"], flavorLabel: label, spiritName })).toEqual([
      "A wildcard: not enough rye tastings to match on flavor.",
      "Last tasted 65 days ago.",
    ]);
    const fresh = bottle({ daysSinceTasted: null });
    expect(reasonsFor({ candidate: fresh, flavors: ["oak"], flavorLabel: label, spiritName })).toEqual(["A wildcard: never tasted, so no notes to match."]);
  });

  it("mentions staleness without flavors too", () => {
    expect(reasonsFor({ candidate: bottle({ daysSinceTasted: 90 }), flavors: [], flavorLabel: label, spiritName })).toEqual(["Last tasted 90 days ago."]);
  });
});

describe("hasNotes", () => {
  it("needs a qualifying spirit and at least one chosen tag", () => {
    expect(hasNotes(bottle({ tags: ["a"] }))).toBe(true);
    expect(hasNotes(bottle({ tags: [] }))).toBe(false);
    expect(hasNotes(bottle({ tags: ["a"], spiritQualifies: false }))).toBe(false);
  });
});

describe("dates", () => {
  it("adds months and clamps the day to the target month", () => {
    expect(addMonths("2026-10-07", 3)).toBe("2027-01-07");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2027-11-30", 3)).toBe("2028-02-29");
    expect(addMonths("2026-12-31", 1)).toBe("2027-01-31");
  });

  it("steps to the next day across months and years", () => {
    expect(nextDay("2026-10-07")).toBe("2026-10-08");
    expect(nextDay("2026-10-31")).toBe("2026-11-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});

describe("checkMuteUntil", () => {
  const today = "2026-10-07";

  it("accepts tomorrow through three months out", () => {
    expect(checkMuteUntil("2026-10-08", today)).toEqual({ ok: true });
    expect(checkMuteUntil("2027-01-07", today)).toEqual({ ok: true });
  });

  it("refuses today, the past and anything past three months", () => {
    expect(checkMuteUntil("2026-10-07", today).ok).toBe(false);
    expect(checkMuteUntil("2026-09-01", today).ok).toBe(false);
    const far = checkMuteUntil("2027-01-08", today);
    expect(far).toEqual({ ok: false, message: "A mute lasts at most 3 months. Pick a date on or before 2027-01-07." });
  });

  it("refuses what is not a real date", () => {
    for (const bad of ["tomorrow", "2026-02-30", "2026-13-01", "26-10-08", "", null, 20261008, undefined]) {
      expect(checkMuteUntil(bad, today).ok).toBe(false);
    }
  });
});

describe("muteWindow and mutePresets", () => {
  const today = "2026-10-07";

  it("runs from tomorrow to three months from today", () => {
    expect(muteWindow(today)).toEqual({ min: "2026-10-08", max: "2027-01-07" });
  });

  it("offers a week, a month and three months, each inside the window", () => {
    const presets = mutePresets(today);
    expect(presets).toEqual([
      { key: "week", label: "1 week", until: "2026-10-14" },
      { key: "month", label: "1 month", until: "2026-11-07" },
      { key: "quarter", label: "3 months", until: "2027-01-07" },
    ]);
    for (const preset of presets) expect(checkMuteUntil(preset.until, today)).toEqual({ ok: true });
  });

  it("keeps every preset inside the window at month ends and year ends", () => {
    for (const day of ["2026-01-31", "2026-11-30", "2026-12-31", "2027-12-31", "2028-02-29"]) {
      for (const preset of mutePresets(day)) expect(checkMuteUntil(preset.until, day)).toEqual({ ok: true });
    }
  });
});
