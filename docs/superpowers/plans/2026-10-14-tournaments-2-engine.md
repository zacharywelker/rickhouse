# Tournaments, Plan 2: The engine (grouping, rounds, ranking)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The pure rules of a tournament as plain TypeScript with exact-answer tests: how entrants are sorted and cut into flights, how a flight is labelled, who advances and where everyone finished, and the long-term ranking and rating audit.

**Architecture:** Six small modules under `src/lib/tournaments/` that take plain data and return plain data. Nothing here touches the database, the network or the clock, so every rule is tested with fixtures and the later plans (data layer, routes, web, iOS) only wire it up. Each file has one job: `types` (shared shapes), `grains` (mashbill position), `keys` (the five sort keys and the sort), `grouping` (cut into flights, label them), `rounds` (advancement, standings), `ranking` (Plackett-Luce fit, comparable groups, audit).

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-13-tournament-design.md`, sections 4 and 7. This is PR 1, part 1 of the build order (section 10). Plan 1 (provenance) is independent and can be done in either order.

## Global Constraints

- Proof is compared in bands of **5**; mashbill shares in bands of **5 points**; age in bands of **2 years**. Ties after every key break by the exact values in priority order, then entry id.
- A grain counts as a flavoring grain at **10 points** or more. Grain families: corn; rye (any name containing "rye"); wheat (any name containing "wheat"); malt (any name containing "barley", or "malt"); any other name is its own family.
- Mashbill classes sort: corn-dominant, single-family (alphabetical), multi-family (by count, then alphabetical), malt (51% or more malted barley and no flavoring grain), blend. Unknown sorts last for every key.
- Generic mashbill positions are constants: Low Rye = rye 12, High Rye = rye 27, Wheated = wheat 15, High Wheat = wheat 30, Four Grain = class rye + wheat with unknown shares.
- A label with more than one distillery is the distillery value **Blend**; a label with more than one mashbill is the mashbill value **Blend**.
- A heat of *s* entrants advances `max(1, floor(s/2))`. Only the last heat of a round may be short; a heat of one is a bye. The final is the round whose pool fits in one heat.
- The ranking is a Plackett-Luce fit with a prior of weight **0.5**; a competitor with fewer than **3** heats is provisional; one whose heats all sit in one proof band is "single band" and is never audited.
- These modules import nothing but each other. No `server-only`, no database, no Next.js. Match the surrounding code's comment density and naming.
- Do not open a pull request unless the user asks. Commit on the branch and stop.

## Review Focus

Inputs the spec implies but a quick read would miss, most likely first. Each is pinned by a test named here.

1. **Names and numbers that arrive messy.** Grain names are free text in any case and spacing ("  malted   WHEAT ", "Malted Rye"); an unfamiliar grain ("Oats") must become its own class and not crash. Tests: `grainFamily`, "gives four grain and oats classes of their own".
2. **A recipe with no grains, a bottle with no proof, a label with no distillery.** None of these may throw, and each sorts after every known value. Tests: "is null for a recipe with no grains", "puts a bottle with no proof after every bottle that has one".
3. **Band edges.** 99.9 and 100 fall in different proof bands, 100 and 104.9 in the same one. Test: "splits 99.9 proof from 100 proof, because bands are fixed".
4. **The same field in a different order must give the same flights** (otherwise "Reset to automatic" would not return what you had). Tests: "is the same whatever order the field arrives in", and the fit's order-independence test.
5. **A bottle that has only ever won** must not get an infinite strength, and **two tournaments that share no bottle** must not be merged into one ranking. Tests: "keeps a bottle that has only ever won finite", "keeps separate tournaments in separate groups".
6. **Speed.** The ranking is recomputed on demand. A fit of 400 competitors over 3,000 heats took 0.2 seconds in a scratch run; if a change makes it much slower, treat that as a failure. Step 6 of Task 6 re-times it.

---

### Task 0: Branch and workspace

**Files:** none.

- [ ] **Step 1: Check for existing work on this topic**

```bash
cd /home/zacharywelker/rickhouse-dev
git ls-remote origin 'refs/heads/claude/*' | grep -i -E 'tournament|engine' ; gh pr list --state all --search "tournament" --limit 5
```
Expected: only the spec branch `claude/tournament-spec`. If an engine branch or PR exists, build on it.

- [ ] **Step 2: Create a worktree from the latest main**

```bash
git fetch origin main
git worktree add .worktrees/tournament-engine -b claude/tournament-engine origin/main
cd .worktrees/tournament-engine
npm ci
```
All later commands run from `.worktrees/tournament-engine`.

- [ ] **Step 3: Confirm the baseline is green**

```bash
npm run typecheck && npm test
```
Expected: PASS. If it fails before any change, stop and report.

---

### Task 1: Shared types

**Files:**
- Create: `src/lib/tournaments/types.ts`

**Interfaces:**
- Produces: `Grain`, `MashbillInput`, `GroupKey`, `GROUP_KEYS`, `DEFAULT_GROUP_ORDER`, `Entrant`, `isGroupOrder`.

Types only plus one tiny guard; `isGroupOrder` is tested in Task 4's file.

- [ ] **Step 1: Write the file**

Create `src/lib/tournaments/types.ts`:

```ts
/** One grain of a recipe: its name as typed, and its share in percent. */
export type Grain = { grain: string; percent: number };

/**
 * What the grouping knows about a label's mashbill. A recipe has grains (and a name when it is a secret one, such as
 * "Buffalo Trace High Rye"); a generic style ("High Rye") has none; a label with several mashbills is a blend.
 */
export type MashbillInput =
  | { kind: "recipe"; grains: Grain[]; name: string | null }
  | { kind: "generic"; style: string }
  | { kind: "blend" };

/** The five things flights can be matched on. */
export type GroupKey = "proof" | "mashbill" | "distillery" | "age" | "finish";

export const GROUP_KEYS: readonly GroupKey[] = ["proof", "mashbill", "distillery", "age", "finish"];

/** Proof first: bottles at different strengths are not a fair taste. */
export const DEFAULT_GROUP_ORDER: readonly GroupKey[] = GROUP_KEYS;

/** A competitor as the grouping sees it. `id` is the tournament entry's id, the last tie-break. */
export type Entrant = {
  id: number;
  name: string;
  proof: number | null;
  /** Null when the label has no mashbill recorded, or the spirit is not a whiskey. */
  mashbill: MashbillInput | null;
  /** Every distillery of the label. None is unknown; more than one is a blend. */
  distilleries: string[];
  ageYears: number | null;
  /** The label's finishes in listed order; the first is the one compared. */
  finishes: string[];
};

/** True when `order` holds each of the five keys exactly once. */
export function isGroupOrder(order: readonly string[]): order is GroupKey[] {
  return order.length === GROUP_KEYS.length && GROUP_KEYS.every((key) => order.includes(key));
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tournaments/types.ts
git commit -m "Tournament engine: shared types"
```

---

### Task 2: Mashbill position

**Files:**
- Create: `src/lib/tournaments/grains.ts`
- Test: `src/lib/tournaments/__tests__/grains.test.ts`

**Interfaces:**
- Consumes: `MashbillInput` from Task 1.
- Produces: `type Comparable`, `FLAVORING_MIN`, `SHARE_BAND`, `grainFamily(name)`, `mashbillKey(m)` returning `{ band: Comparable; exact: Comparable } | null`, `mashbillDisplay(m)`.

To keep every task green on its own, this task's test file leaves out the final "sorting by mashbill alone" block, which needs the sort from Task 3. Task 3 adds it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tournaments/__tests__/grains.test.ts` (without the last `describe("sorting by mashbill alone", ...)` block):

```ts
import { describe, expect, it } from "vitest";
import { grainFamily, mashbillDisplay, mashbillKey } from "../grains";
import type { Grain, MashbillInput } from "../types";

const recipe = (grains: [string, number][], name: string | null = null): MashbillInput => ({
  kind: "recipe",
  grains: grains.map(([grain, percent]): Grain => ({ grain, percent })),
  name,
});

describe("grainFamily", () => {
  it("groups the names the app suggests", () => {
    expect(grainFamily("Corn")).toBe("corn");
    expect(grainFamily("Rye")).toBe("rye");
    expect(grainFamily("Malted Rye")).toBe("rye");
    expect(grainFamily("Wheat")).toBe("wheat");
    expect(grainFamily("  malted   WHEAT ")).toBe("wheat");
    expect(grainFamily("Malted Barley")).toBe("malt");
    expect(grainFamily("barley")).toBe("malt");
    expect(grainFamily("Malt")).toBe("malt");
  });

  it("gives any other grain its own family", () => {
    expect(grainFamily("Oats")).toBe("oats");
    expect(grainFamily("Triticale")).toBe("triticale");
  });
});

describe("mashbillKey", () => {
  it("is null when there is no mashbill, or a generic style it does not know", () => {
    expect(mashbillKey(null)).toBeNull();
    expect(mashbillKey({ kind: "generic", style: "Mystery" })).toBeNull();
  });

  it("puts 75/21/4 and 68/20/12 in the same flavoring band but apart on barley", () => {
    const a = mashbillKey(recipe([["Corn", 75], ["Rye", 21], ["Malted Barley", 4]]))!;
    const b = mashbillKey(recipe([["Corn", 68], ["Rye", 20], ["Malted Barley", 12]]))!;
    expect(a.band).toEqual([1, "rye", 4, 0]);
    expect(b.band).toEqual([1, "rye", 4, 2]);
  });

  it("is null for a recipe with no grains", () => {
    expect(mashbillKey(recipe([]))).toBeNull();
  });

  it("puts 60/36/4 in a different rye band", () => {
    expect(mashbillKey(recipe([["Corn", 60], ["Rye", 36], ["Malted Barley", 4]]))!.band).toEqual([1, "rye", 7, 0]);
  });

  it("ignores a grain under 10 points when finding the flavoring grain", () => {
    expect(mashbillKey(recipe([["Corn", 81], ["Rye", 9], ["Malted Barley", 10]]))!.band).toEqual([0, "", 16, 2]);
  });

  it("gives four grain and oats classes of their own", () => {
    expect(mashbillKey(recipe([["Corn", 63], ["Rye", 12], ["Wheat", 12], ["Malted Barley", 13]]))!.band).toEqual([2, "2rye+wheat", 2, 2, 2]);
    expect(mashbillKey(recipe([["Corn", 70], ["Oats", 20], ["Malted Barley", 10]]))!.band).toEqual([1, "oats", 4, 2]);
  });

  it("calls a mostly malted barley recipe malt, and several mashbills a blend", () => {
    expect(mashbillKey(recipe([["Malted Barley", 100]]))!.band).toEqual([3, "", 20]);
    expect(mashbillKey({ kind: "blend" })!.band).toEqual([4]);
  });
});

describe("mashbillDisplay", () => {
  it("prefers a name, then the shares by size, then the style", () => {
    expect(mashbillDisplay(recipe([["Corn", 75]], "Buffalo Trace High Rye"))).toBe("Buffalo Trace High Rye");
    expect(mashbillDisplay(recipe([["Malted Barley", 5], ["Rye", 95]]))).toBe("95/5");
    expect(mashbillDisplay({ kind: "generic", style: " High Rye " })).toBe("High Rye");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/tournaments/__tests__/grains.test.ts`
Expected: FAIL, "Failed to resolve import ../grains".

- [ ] **Step 3: Write the implementation**

Create `src/lib/tournaments/grains.ts`:

```ts
import type { MashbillInput } from "./types";

/** A sort key part: numbers and strings, compared left to right. Every index holds one type across all keys. */
export type Comparable = readonly (number | string)[];

/** A grain must hold at least this many points to define a mashbill's style. A smaller share is too minor. */
export const FLAVORING_MIN = 10;
/** Shares are compared in bands this many points wide, so 21% and 20% rye count as the same. */
export const SHARE_BAND = 5;
/** With no flavoring grain, a recipe this malted-barley-heavy is a malt whiskey. */
const MALT_CLASS_MIN = 51;

const UNKNOWN = Number.POSITIVE_INFINITY;
const band = (share: number): number => Math.floor(share / SHARE_BAND);

/** Which family a grain name belongs to. Names are free text, so match on the words; any other name is its own family. */
export function grainFamily(name: string): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (/\bcorn\b/.test(n)) return "corn";
  if (n.includes("wheat")) return "wheat";
  if (n.includes("rye")) return "rye";
  if (n.includes("barley") || n === "malt") return "malt";
  return n;
}

/** Where a generic style sits when it names no grains: its typical flavoring grain and share. Judgment calls; tune here. */
const GENERIC: Record<string, { family: string; share: number } | "four grain"> = {
  "low rye": { family: "rye", share: 12 },
  "high rye": { family: "rye", share: 27 },
  wheated: { family: "wheat", share: 15 },
  "high wheat": { family: "wheat", share: 30 },
  "four grain": "four grain",
};

// Class kinds, in sort order.
const CORN = 0;
const ONE = 1;
const MANY = 2;
const MALT = 3;
const BLEND = 4;

/**
 * A mashbill as a sort key: a class (corn-dominant, one flavoring grain, several, malt, blend) then the flavoring
 * grains' shares and the malted barley share, each in bands of 5 points. `exact` holds the same without banding, for
 * tie-breaks. Null when there is nothing to compare. A share the data does not give sorts after every known one.
 */
export function mashbillKey(mashbill: MashbillInput | null): { band: Comparable; exact: Comparable } | null {
  if (mashbill === null) return null;
  if (mashbill.kind === "blend") return { band: [BLEND], exact: [BLEND] };

  if (mashbill.kind === "generic") {
    const typical = GENERIC[mashbill.style.trim().toLowerCase()];
    if (typical === undefined) return null;
    if (typical === "four grain") {
      const unknown = [MANY, "2rye+wheat", UNKNOWN, UNKNOWN, UNKNOWN];
      return { band: unknown, exact: unknown };
    }
    return { band: [ONE, typical.family, band(typical.share), UNKNOWN], exact: [ONE, typical.family, typical.share, UNKNOWN] };
  }

  // A recipe with no grains says nothing to compare.
  if (mashbill.grains.length === 0) return null;

  const shares = new Map<string, number>();
  for (const { grain, percent } of mashbill.grains) {
    const family = grainFamily(grain);
    shares.set(family, (shares.get(family) ?? 0) + percent);
  }
  const corn = shares.get("corn") ?? 0;
  const malt = shares.get("malt") ?? 0;
  const flavoring = [...shares]
    .filter(([family, share]) => family !== "corn" && family !== "malt" && share >= FLAVORING_MIN)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  if (flavoring.length === 0) {
    if (malt >= MALT_CLASS_MIN) return { band: [MALT, "", band(malt)], exact: [MALT, "", malt] };
    return { band: [CORN, "", band(corn), band(malt)], exact: [CORN, "", corn, malt] };
  }
  const kind = flavoring.length === 1 ? ONE : MANY;
  const names = flavoring.map(([family]) => family).join("+");
  const klass = kind === ONE ? names : `${flavoring.length}${names}`;
  return {
    band: [kind, klass, ...flavoring.map(([, share]) => band(share)), band(malt)],
    exact: [kind, klass, ...flavoring.map(([, share]) => share), malt],
  };
}

/** A mashbill as it reads on a flight's label: its name, else the recipe's shares ("75/21/4"), else the style. */
export function mashbillDisplay(mashbill: MashbillInput): string {
  if (mashbill.kind === "blend") return "Blend";
  if (mashbill.kind === "generic") return mashbill.style.trim();
  const name = mashbill.name?.trim();
  if (name) return name;
  return [...mashbill.grains]
    .sort((a, b) => b.percent - a.percent)
    .map((g) => String(Math.round(g.percent)))
    .join("/");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/tournaments/__tests__/grains.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournaments/grains.ts src/lib/tournaments/__tests__/grains.test.ts
git commit -m "Tournament engine: mashbill position by flavoring grain, class and banded shares"
```

---

### Task 3: The five keys and the sort

**Files:**
- Create: `src/lib/tournaments/keys.ts`
- Modify: `src/lib/tournaments/__tests__/grains.test.ts` (add the sorting block)

**Interfaces:**
- Consumes: `mashbillKey`, `Comparable` from Task 2; `Entrant`, `GroupKey` from Task 1.
- Produces: `PROOF_BAND`, `AGE_BAND_YEARS`, `keyValue(entrant, key)`, `sortEntrants(entrants, order): Entrant[]`.

- [ ] **Step 1: Add the failing test**

In `src/lib/tournaments/__tests__/grains.test.ts`, change the type import to `import type { Entrant, Grain, MashbillInput } from "../types";`, add `import { sortEntrants } from "../keys";` below the `grains` import, and append this block at the end of the file:

```ts
describe("sorting by mashbill alone", () => {
  const cases: [string, MashbillInput][] = [
    ["75/21/4", recipe([["Corn", 75], ["Rye", 21], ["Malted Barley", 4]])],
    ["68/20/12", recipe([["Corn", 68], ["Rye", 20], ["Malted Barley", 12]])],
    ["60/36/4", recipe([["Corn", 60], ["Rye", 36], ["Malted Barley", 4]])],
    ["generic High Rye", { kind: "generic", style: "High Rye" }],
    ["generic Low Rye", { kind: "generic", style: "Low Rye" }],
    ["75/13/12", recipe([["Corn", 75], ["Rye", 13], ["Malted Barley", 12]])],
    ["70/16/14 wheated", recipe([["Corn", 70], ["Wheat", 16], ["Malted Barley", 14]])],
    ["generic Wheated", { kind: "generic", style: "Wheated" }],
    ["63/12/12/13 four grain", recipe([["Corn", 63], ["Rye", 12], ["Wheat", 12], ["Malted Barley", 13]])],
    ["generic Four Grain", { kind: "generic", style: "Four Grain" }],
    ["70/20/10 oats", recipe([["Corn", 70], ["Oats", 20], ["Malted Barley", 10]])],
    ["51/39/10 rye", recipe([["Rye", 51], ["Corn", 39], ["Malted Barley", 10]])],
    ["95/5 rye", recipe([["Rye", 95], ["Malted Barley", 5]])],
    ["81/9/10 corn", recipe([["Corn", 81], ["Rye", 9], ["Malted Barley", 10]])],
    ["100 malt", recipe([["Malted Barley", 100]])],
  ];

  it("orders them so that similar mashbills are neighbors", () => {
    const entrants: Entrant[] = cases.map(([name, mashbill], index) => ({
      id: index + 1, name, proof: null, mashbill, distilleries: [], ageYears: null, finishes: [],
    }));
    expect(sortEntrants(entrants, ["mashbill", "proof", "distillery", "age", "finish"]).map((e) => e.name)).toEqual([
      "81/9/10 corn",
      "70/20/10 oats",
      "75/13/12",
      "generic Low Rye",
      "75/21/4",
      "68/20/12",
      "generic High Rye",
      "60/36/4",
      "51/39/10 rye",
      "95/5 rye",
      "70/16/14 wheated",
      "generic Wheated",
      "63/12/12/13 four grain",
      "generic Four Grain",
      "100 malt",
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/tournaments/__tests__/grains.test.ts`
Expected: FAIL, "Failed to resolve import ../keys".

- [ ] **Step 3: Write the implementation**

Create `src/lib/tournaments/keys.ts`:

```ts
import { mashbillKey, type Comparable } from "./grains";
import type { Entrant, GroupKey } from "./types";

/** Proof is compared in bands this many points wide: a point or two of proof is no difference to a palate. */
export const PROOF_BAND = 5;
/** Age is compared in bands this many years wide. */
export const AGE_BAND_YEARS = 2;

type KeyValue = { band: Comparable; exact: Comparable } | null;

/** What one key says about an entrant, or null when it is unknown (which sorts after every known value). */
export function keyValue(entrant: Entrant, key: GroupKey): KeyValue {
  switch (key) {
    case "proof":
      return entrant.proof === null ? null : { band: [Math.floor(entrant.proof / PROOF_BAND)], exact: [entrant.proof] };
    case "mashbill":
      return mashbillKey(entrant.mashbill);
    case "distillery": {
      if (entrant.distilleries.length === 0) return null;
      // Names sort first, alphabetically; a label with several distilleries is its own group after them.
      if (entrant.distilleries.length > 1) return { band: [1, ""], exact: [1, ""] };
      const name = entrant.distilleries[0]!.trim().toLowerCase();
      return { band: [0, name], exact: [0, name] };
    }
    case "age":
      return entrant.ageYears === null
        ? null
        : { band: [Math.floor(entrant.ageYears / AGE_BAND_YEARS)], exact: [entrant.ageYears] };
    case "finish": {
      const first = entrant.finishes[0]?.trim().toLowerCase();
      return first ? { band: [first], exact: [first] } : null;
    }
  }
}

function compareComparable(a: Comparable, b: Comparable): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x !== y) return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

function compareValues(a: KeyValue, b: KeyValue, part: "band" | "exact"): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return compareComparable(a[part], b[part]);
}

/**
 * The entrants in similarity order: by each key's band in priority order, then by the exact values in the same order,
 * then by entry id. The same entrants always give the same order, which is what makes "reset to automatic" repeatable.
 */
export function sortEntrants(entrants: readonly Entrant[], order: readonly GroupKey[]): Entrant[] {
  const keyed = entrants.map((entrant) => ({ entrant, values: order.map((key) => keyValue(entrant, key)) }));
  keyed.sort((a, b) => {
    for (const part of ["band", "exact"] as const) {
      for (let i = 0; i < order.length; i++) {
        const c = compareValues(a.values[i]!, b.values[i]!, part);
        if (c !== 0) return c;
      }
    }
    return a.entrant.id - b.entrant.id;
  });
  return keyed.map((k) => k.entrant);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/tournaments/__tests__/grains.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournaments/keys.ts src/lib/tournaments/__tests__/grains.test.ts
git commit -m "Tournament engine: the five sort keys, banded, with a deterministic sort"
```

---

### Task 4: Flights and their labels

**Files:**
- Create: `src/lib/tournaments/grouping.ts`
- Test: `src/lib/tournaments/__tests__/grouping.test.ts`

**Interfaces:**
- Consumes: `sortEntrants` (Task 3), `mashbillDisplay` (Task 2), `Entrant`, `GroupKey`, `DEFAULT_GROUP_ORDER`, `isGroupOrder` (Task 1).
- Produces: `groupIntoHeats(entrants, order, heatSize): Entrant[][]`, `heatBand(heat): string`, `autoLabel(heat): string | null`.

The tests include your bottled-in-bond example, and the twelve-bourbon fixture reproduces, flight for flight, the grouping shown in the approved mockup.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tournaments/__tests__/grouping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { autoLabel, groupIntoHeats, heatBand } from "../grouping";
import { DEFAULT_GROUP_ORDER, isGroupOrder, type Entrant, type MashbillInput } from "../types";

const generic = (style: string): MashbillInput => ({ kind: "generic", style });
const entrant = (id: number, name: string, over: Partial<Entrant> = {}): Entrant => ({
  id, name, proof: null, mashbill: null, distilleries: [], ageYears: null, finishes: [], ...over,
});
const names = (heats: Entrant[][]) => heats.map((h) => h.map((e) => e.name));

describe("isGroupOrder", () => {
  it("wants each of the five keys exactly once", () => {
    expect(isGroupOrder(["proof", "mashbill", "distillery", "age", "finish"])).toBe(true);
    expect(isGroupOrder(["distillery", "proof", "mashbill", "age", "finish"])).toBe(true);
    expect(isGroupOrder(["proof", "proof", "distillery", "age", "finish"])).toBe(false);
    expect(isGroupOrder(["proof", "mashbill"])).toBe(false);
    expect(isGroupOrder(["proof", "mashbill", "distillery", "age", "taste"])).toBe(false);
  });
});

describe("groupIntoHeats: the bottled-in-bond example", () => {
  // Ten at 100 proof (4 high rye, 3 rye whiskey, 3 wheated) plus two high ryes at 101 and 102. Heats of 4.
  const rye = (n: number) => entrant(4 + n, `R${n}`, { proof: 100, mashbill: { kind: "recipe", name: null, grains: [{ grain: "Rye", percent: 51 }, { grain: "Corn", percent: 39 }, { grain: "Malted Barley", percent: 10 }] } });
  const field: Entrant[] = [
    ...[1, 2, 3, 4].map((n) => entrant(n, `H${n}`, { proof: 100, mashbill: generic("High Rye") })),
    ...[1, 2, 3].map(rye),
    ...[1, 2, 3].map((n) => entrant(7 + n, `W${n}`, { proof: 100, mashbill: generic("Wheated") })),
    entrant(11, "H101", { proof: 101, mashbill: generic("High Rye") }),
    entrant(12, "H102", { proof: 102, mashbill: generic("High Rye") }),
  ];

  it("keeps 100, 101 and 102 together and lets mashbill order them", () => {
    expect(names(groupIntoHeats(field, ["proof", "mashbill", "distillery", "age", "finish"], 4))).toEqual([
      ["H1", "H2", "H3", "H4"],
      ["H101", "H102", "R1", "R2"],
      ["R3", "W1", "W2", "W3"],
    ]);
  });

  it("is the same whatever order the field arrives in", () => {
    const shuffled = [...field].reverse();
    expect(names(groupIntoHeats(shuffled, DEFAULT_GROUP_ORDER, 4))).toEqual(names(groupIntoHeats(field, DEFAULT_GROUP_ORDER, 4)));
  });
});

describe("groupIntoHeats: twelve bourbons", () => {
  const bottle = (id: number, name: string, proof: number, style: string, distillery: string, age: number | null, finish: string | null = null) =>
    entrant(id, name, { proof, mashbill: generic(style), distilleries: [distillery], ageYears: age, finishes: finish ? [finish] : [] });
  const field = [
    bottle(1, "Buffalo Trace", 90, "Low Rye", "Buffalo Trace", null),
    bottle(2, "Eagle Rare 10", 90, "Low Rye", "Buffalo Trace", 10),
    bottle(3, "Weller 12", 90, "Wheated", "Buffalo Trace", 12),
    bottle(4, "Russell's Reserve 10", 90, "Low Rye", "Wild Turkey", 10),
    bottle(5, "Blanton's", 93, "High Rye", "Buffalo Trace", null),
    bottle(6, "Maker's Mark 46", 94, "Wheated", "Maker's Mark", null, "Oak staves"),
    bottle(7, "Knob Creek 12", 100, "Low Rye", "Jim Beam", 12),
    bottle(8, "Four Roses Single Barrel", 100, "High Rye", "Four Roses", null),
    bottle(9, "Wild Turkey 101", 101, "High Rye", "Wild Turkey", null),
    bottle(10, "Old Forester 1920", 115, "Low Rye", "Old Forester", null),
    bottle(11, "Elijah Craig Barrel Proof", 124, "Low Rye", "Heaven Hill", 12),
    bottle(12, "Booker's", 126, "Low Rye", "Jim Beam", 7),
  ];

  it("matches by proof first", () => {
    expect(names(groupIntoHeats(field, DEFAULT_GROUP_ORDER, 4))).toEqual([
      ["Eagle Rare 10", "Buffalo Trace", "Russell's Reserve 10", "Blanton's"],
      ["Weller 12", "Maker's Mark 46", "Knob Creek 12", "Four Roses Single Barrel"],
      ["Wild Turkey 101", "Old Forester 1920", "Elijah Craig Barrel Proof", "Booker's"],
    ]);
  });

  it("matches by distillery first when asked, at the cost of mixing proofs", () => {
    const heats = groupIntoHeats(field, ["distillery", "proof", "mashbill", "age", "finish"], 4);
    expect(names(heats)).toEqual([
      ["Eagle Rare 10", "Buffalo Trace", "Blanton's", "Weller 12"],
      ["Four Roses Single Barrel", "Elijah Craig Barrel Proof", "Knob Creek 12", "Booker's"],
      ["Maker's Mark 46", "Old Forester 1920", "Russell's Reserve 10", "Wild Turkey 101"],
    ]);
    expect(heatBand(heats[1]!)).toBe("100 to 126 proof");
  });

  it("lets only the last heat be short, and a lone entrant is a bye", () => {
    const five = field.slice(0, 5);
    expect(groupIntoHeats(five, DEFAULT_GROUP_ORDER, 4).map((h) => h.length)).toEqual([4, 1]);
  });

  it("puts a bottle with no proof after every bottle that has one", () => {
    const withBlank = [...field.slice(0, 3), entrant(99, "Unknown", { mashbill: generic("Low Rye") })];
    expect(groupIntoHeats(withBlank, DEFAULT_GROUP_ORDER, 4)[0]!.at(-1)!.name).toBe("Unknown");
  });
});

describe("groupIntoHeats: edges", () => {
  it("returns no heats for no entrants", () => {
    expect(groupIntoHeats([], DEFAULT_GROUP_ORDER, 4)).toEqual([]);
  });

  it("splits 99.9 proof from 100 proof, because bands are fixed", () => {
    const field = [entrant(1, "a", { proof: 99.9 }), entrant(2, "b", { proof: 100 }), entrant(3, "c", { proof: 104.9 }), entrant(4, "d", { proof: 105 })];
    // 99.9 is in the 95 band, 100 and 104.9 share the 100 band, 105 starts the next: the order is by band, then exact proof.
    expect(names(groupIntoHeats(field, DEFAULT_GROUP_ORDER, 2))).toEqual([["a", "b"], ["c", "d"]]);
    expect(groupIntoHeats(field, DEFAULT_GROUP_ORDER, 1).map((h) => h[0]!.name)).toEqual(["a", "b", "c", "d"]);
  });

  it("falls back to entry id when nothing separates two entrants", () => {
    const field = [entrant(5, "later"), entrant(2, "earlier")];
    expect(names(groupIntoHeats(field, DEFAULT_GROUP_ORDER, 2))).toEqual([["earlier", "later"]]);
  });
});

describe("heatBand", () => {
  it("reads as a span, a single proof, or nothing when a proof is unknown", () => {
    expect(heatBand([entrant(1, "a", { proof: 90 }), entrant(2, "b", { proof: 94 })])).toBe("90 to 94 proof");
    expect(heatBand([entrant(1, "a", { proof: 100 }), entrant(2, "b", { proof: 100 })])).toBe("100 proof");
    expect(heatBand([entrant(1, "a", { proof: 90 }), entrant(2, "b")])).toBe("");
  });
});

describe("autoLabel", () => {
  const recipe = (name: string | null, grains: [string, number][]): MashbillInput => ({
    kind: "recipe", name, grains: grains.map(([grain, percent]) => ({ grain, percent })),
  });

  it("names a shared secret mashbill, without repeating its distillery", () => {
    const m = recipe("Buffalo Trace High Rye", [["Corn", 75]]);
    const heat = [1, 2].map((id) => entrant(id, `b${id}`, { mashbill: m, distilleries: ["Buffalo Trace"] }));
    expect(autoLabel(heat)).toBe("Buffalo Trace High Rye");
  });

  it("puts a shared distillery in front of a shared recipe", () => {
    const m = recipe(null, [["Rye", 95], ["Malted Barley", 5]]);
    const heat = [1, 2].map((id) => entrant(id, `b${id}`, { mashbill: m, distilleries: ["MGP"] }));
    expect(autoLabel(heat)).toBe("MGP 95/5");
  });

  it("falls back to whichever of the two is shared, and to null when neither is", () => {
    const high = generic("High Rye");
    expect(autoLabel([entrant(1, "a", { mashbill: high, distilleries: ["X"] }), entrant(2, "b", { mashbill: high, distilleries: ["Y"] })])).toBe("High Rye");
    expect(autoLabel([entrant(1, "a", { distilleries: ["X"] }), entrant(2, "b", { distilleries: ["X"] })])).toBe("X");
    expect(autoLabel([entrant(1, "a", { mashbill: high }), entrant(2, "b", { mashbill: generic("Wheated") })])).toBeNull();
  });

  it("calls a heat of several-distillery labels a blend, and is null when anything is unknown", () => {
    expect(autoLabel([entrant(1, "a", { distilleries: ["X", "Y"] }), entrant(2, "b", { distilleries: ["Z", "W"] })])).toBe("Blend");
    expect(autoLabel([entrant(1, "a", { distilleries: ["X"] }), entrant(2, "b")])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/tournaments/__tests__/grouping.test.ts`
Expected: FAIL, "Failed to resolve import ../grouping".

- [ ] **Step 3: Write the implementation**

Create `src/lib/tournaments/grouping.ts`:

```ts
import { mashbillDisplay } from "./grains";
import { sortEntrants } from "./keys";
import type { Entrant, GroupKey } from "./types";

/**
 * The entrants cut into heats of `heatSize` in similarity order. Only the last heat may be short, and a heat of one
 * is a bye. Every flight is cut at `heatSize`, even where it straddles two groups of the first key.
 */
export function groupIntoHeats(entrants: readonly Entrant[], order: readonly GroupKey[], heatSize: number): Entrant[][] {
  const sorted = sortEntrants(entrants, order);
  const heats: Entrant[][] = [];
  for (let i = 0; i < sorted.length; i += heatSize) heats.push(sorted.slice(i, i + heatSize));
  return heats;
}

/** A heat's proof span as it reads: "90 to 94 proof", "100 proof", or empty when any proof is unknown. */
export function heatBand(heat: readonly Entrant[]): string {
  const proofs = heat.map((e) => e.proof);
  if (heat.length === 0 || proofs.some((p) => p === null)) return "";
  const known = proofs as number[];
  const low = Math.min(...known);
  const high = Math.max(...known);
  return low === high ? `${low} proof` : `${low} to ${high} proof`;
}

/** The one value every item shares, or null when any is missing or they differ. */
function shared(values: readonly (string | null)[]): string | null {
  const first = values[0];
  return first !== null && first !== undefined && values.every((v) => v === first) ? first : null;
}

/**
 * A heat's generated label, from what its bottles share: a shared mashbill (by name or recipe) with a shared
 * distillery in front of it. Null when they share neither, so the caller falls back to the proof band.
 */
export function autoLabel(heat: readonly Entrant[]): string | null {
  const distillery = shared(
    heat.map((e) => (e.distilleries.length === 0 ? null : e.distilleries.length > 1 ? "Blend" : e.distilleries[0]!.trim())),
  );
  const mashbill = shared(heat.map((e) => (e.mashbill === null ? null : mashbillDisplay(e.mashbill))));
  if (distillery !== null && mashbill !== null) {
    return mashbill.toLowerCase().includes(distillery.toLowerCase()) ? mashbill : `${distillery} ${mashbill}`;
  }
  return mashbill ?? distillery;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/tournaments/__tests__/grouping.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournaments/grouping.ts src/lib/tournaments/__tests__/grouping.test.ts
git commit -m "Tournament engine: cut entrants into flights, with a band and a generated label"
```

---

### Task 5: Rounds and standings

**Files:**
- Create: `src/lib/tournaments/rounds.ts`
- Test: `src/lib/tournaments/__tests__/rounds.test.ts`

**Interfaces:**
- Produces: `advanceCount(size)`, `type HeatResult = { round; kind: "ranked" | "bye"; entries: { entryId; place: number | null }[] }`, `advancers(heat)`, `nextPool(decided, withdrawn)`, `isFinalPool(poolSize, heatSize)`, `planRounds(entrantCount, heatSize)`, `type Standing`, `standings(results)`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tournaments/__tests__/rounds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advanceCount, advancers, isFinalPool, nextPool, planRounds, standings, type HeatResult } from "../rounds";

const ranked = (round: number, ids: number[]): HeatResult => ({
  round, kind: "ranked", entries: ids.map((entryId, i) => ({ entryId, place: i + 1 })),
});

describe("advanceCount", () => {
  it("advances half, at least one", () => {
    expect([1, 2, 3, 4].map(advanceCount)).toEqual([1, 1, 1, 2]);
  });
});

describe("advancers and nextPool", () => {
  it("takes the top of a ranked heat, whatever order the entries are listed in", () => {
    const heat: HeatResult = { round: 1, kind: "ranked", entries: [{ entryId: 7, place: 3 }, { entryId: 5, place: 1 }, { entryId: 6, place: 2 }, { entryId: 8, place: 4 }] };
    expect(advancers(heat)).toEqual([5, 6]);
  });

  it("sends a bye straight through", () => {
    expect(advancers({ round: 1, kind: "bye", entries: [{ entryId: 9, place: null }] })).toEqual([9]);
  });

  it("drops anyone withdrawn since", () => {
    const pool = nextPool([ranked(1, [1, 2, 3, 4]), ranked(1, [5, 6, 7, 8])], new Set([2]));
    expect(pool).toEqual([1, 5, 6]);
  });
});

describe("isFinalPool and planRounds", () => {
  it("makes the final the round whose pool fits in one heat", () => {
    expect(isFinalPool(4, 4)).toBe(true);
    expect(isFinalPool(5, 4)).toBe(false);
  });

  it("plans twelve bottles of four as three rounds", () => {
    expect(planRounds(12, 4)).toEqual([3, 2, 1]);
  });

  it("plans 101 bottles of two as seven rounds", () => {
    expect(planRounds(101, 2)).toEqual([51, 26, 13, 7, 4, 2, 1]);
  });

  it("handles the smallest fields", () => {
    expect(planRounds(2, 2)).toEqual([1]);
    expect(planRounds(5, 4)).toEqual([2, 1]);
  });
});

describe("standings", () => {
  it("ranks by the round left, then the place, and shares a rank for equals", () => {
    const rows = standings([
      ranked(1, [1, 2, 3, 4]),
      ranked(1, [5, 6, 7, 8]),
      ranked(2, [1, 5, 2, 6]),
    ]);
    expect(rows.map((r) => [r.entryId, r.rank])).toEqual([
      [1, 1], [5, 2], [2, 3], [6, 4],
      [3, 5], [7, 5],
      [4, 7], [8, 7],
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/tournaments/__tests__/rounds.test.ts`
Expected: FAIL, "Failed to resolve import ../rounds".

- [ ] **Step 3: Write the implementation**

Create `src/lib/tournaments/rounds.ts`:

```ts
/** How many of a heat of `size` go through: a 4-way advances 2, a 3-way or 2-way advances 1, a bye advances its one. */
export function advanceCount(size: number): number {
  return size <= 1 ? 1 : Math.max(1, Math.floor(size / 2));
}

/** A decided heat: who was in it and where they placed (null for a bye). */
export type HeatResult = {
  round: number;
  kind: "ranked" | "bye";
  entries: { entryId: number; place: number | null }[];
};

/** The entry ids that go through from one heat, best placed first. */
export function advancers(heat: HeatResult): number[] {
  if (heat.kind === "bye") return heat.entries.map((e) => e.entryId);
  const ranked = [...heat.entries].sort((a, b) => (a.place ?? Number.POSITIVE_INFINITY) - (b.place ?? Number.POSITIVE_INFINITY));
  return ranked.slice(0, advanceCount(heat.entries.length)).map((e) => e.entryId);
}

/** The entries going into the next round: every heat's advancers, less anyone withdrawn meanwhile. */
export function nextPool(decided: readonly HeatResult[], withdrawn: ReadonlySet<number>): number[] {
  return decided.flatMap(advancers).filter((id) => !withdrawn.has(id));
}

/** When the pool entering a round fits in one heat, that heat is the final. */
export function isFinalPool(poolSize: number, heatSize: number): boolean {
  return poolSize <= heatSize;
}

/** How many heats each round has, from the field's size to the final (no withdrawals). 12 bottles of 4: [3, 2, 1]. */
export function planRounds(entrantCount: number, heatSize: number): number[] {
  const rounds: number[] = [];
  let pool = entrantCount;
  for (;;) {
    rounds.push(Math.ceil(pool / heatSize));
    if (isFinalPool(pool, heatSize)) return rounds;
    let next = 0;
    for (let left = pool; left > 0; left -= heatSize) next += advanceCount(Math.min(heatSize, left));
    pool = next;
  }
}

export type Standing = { entryId: number; round: number; place: number | null; rank: number };

/**
 * Where everyone finished: by the round they left (later is better), then their place in that heat. Entrants who left
 * the same round at the same place share a rank, and the next rank skips (1, 2, 2, 4).
 */
export function standings(results: readonly HeatResult[]): Standing[] {
  const last = new Map<number, { round: number; place: number | null }>();
  for (const heat of results) {
    for (const { entryId, place } of heat.entries) {
      const seen = last.get(entryId);
      if (!seen || heat.round > seen.round) last.set(entryId, { round: heat.round, place });
    }
  }
  const worse = (a: { round: number; place: number | null }, b: { round: number; place: number | null }) =>
    a.round !== b.round ? a.round < b.round : (a.place ?? Number.POSITIVE_INFINITY) > (b.place ?? Number.POSITIVE_INFINITY);
  const rows = [...last].map(([entryId, where]) => ({ entryId, ...where }));
  rows.sort((a, b) => (worse(a, b) ? 1 : worse(b, a) ? -1 : a.entryId - b.entryId));
  return rows.map((row) => ({ ...row, rank: 1 + rows.filter((other) => worse(row, other)).length }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/tournaments/__tests__/rounds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournaments/rounds.ts src/lib/tournaments/__tests__/rounds.test.ts
git commit -m "Tournament engine: advancement, round plan and standings"
```

---

### Task 6: Ranking and audit

**Files:**
- Create: `src/lib/tournaments/ranking.ts`
- Test: `src/lib/tournaments/__tests__/ranking.test.ts`

**Interfaces:**
- Consumes: `PROOF_BAND` from Task 3 (`keys.ts`), so the proof band is defined once.
- Produces: `FIRM_HEATS`, `PRIOR_WEIGHT`, `type RankedHeat = { ranking: { id: string; proof: number | null }[] }`, `type Strength`, `fitStrengths(heats, prior?)`, `comparableGroups(heats)`, `rankCompetitors(heats, prior?)`, `type AuditRow`, `audit(strengths, ratings)`.

A competitor's `id` is a string the caller chooses (the data layer will use `b:<bottleId>` for a bottle and `e:<expressionId>` for a label-only entrant). The fit only ever compares ids for equality.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tournaments/__tests__/ranking.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { audit, comparableGroups, fitStrengths, rankCompetitors, type RankedHeat } from "../ranking";

const heat = (ids: string[], proof: number | null = 100): RankedHeat => ({ ranking: ids.map((id) => ({ id, proof })) });

/** The penalized log-likelihood the fit maximizes, written out independently of the fit. */
function logLikelihood(heats: string[][], theta: Map<string, number>, prior: number): number {
  let total = 0;
  for (const ranking of heats) {
    for (let stage = 0; stage < ranking.length - 1; stage++) {
      const rest = ranking.slice(stage).reduce((sum, id) => sum + Math.exp(theta.get(id)!), 0);
      total += theta.get(ranking[stage]!)! - Math.log(rest);
    }
  }
  for (const value of theta.values()) total += prior * (value - 2 * Math.log(1 + Math.exp(value)));
  return total;
}

describe("fitStrengths", () => {
  it("gives equal strength to two bottles that beat each other once", () => {
    const theta = fitStrengths([["a", "b"], ["b", "a"]]);
    expect(theta.get("a")).toBeCloseTo(theta.get("b")!, 9);
  });

  it("keeps a bottle that has only ever won finite", () => {
    const theta = fitStrengths([["a", "b"], ["a", "c"], ["a", "d"]]);
    expect(Number.isFinite(theta.get("a")!)).toBe(true);
    expect(theta.get("a")!).toBeGreaterThan(theta.get("b")!);
  });

  it("orders strengths by place in a four-way heat", () => {
    const theta = fitStrengths([["a", "b", "c", "d"]]);
    const t = (id: string) => theta.get(id)!;
    expect(t("a")).toBeGreaterThan(t("b"));
    expect(t("b")).toBeGreaterThan(t("c"));
    expect(t("c")).toBeGreaterThan(t("d"));
  });

  it("does not depend on the order the heats are given in", () => {
    const heats = [["a", "b", "c"], ["c", "d"], ["b", "d", "a"], ["d", "a"]];
    const one = fitStrengths(heats);
    const two = fitStrengths([...heats].reverse());
    for (const id of one.keys()) expect(one.get(id)!).toBeCloseTo(two.get(id)!, 9);
  });

  it("lands on a maximum: nudging any strength either way lowers the likelihood", () => {
    const heats = [["a", "b", "c", "d"], ["b", "e"], ["e", "c", "a"], ["d", "b"], ["a", "e"]];
    const theta = fitStrengths(heats, 0.5);
    const base = logLikelihood(heats, theta, 0.5);
    for (const id of theta.keys()) {
      for (const nudge of [-1e-3, 1e-3]) {
        const moved = new Map(theta).set(id, theta.get(id)! + nudge);
        expect(logLikelihood(heats, moved, 0.5)).toBeLessThan(base);
      }
    }
  });
});

describe("comparableGroups", () => {
  it("links competitors who share heats, directly or through others", () => {
    const groups = comparableGroups([["a", "b"], ["b", "c"], ["x", "y"]]);
    expect(groups.get("a")).toBe(groups.get("c"));
    expect(groups.get("a")).not.toBe(groups.get("x"));
  });

  it("numbers the largest group 0", () => {
    const groups = comparableGroups([["x", "y"], ["a", "b"], ["b", "c"]]);
    expect(groups.get("a")).toBe(0);
    expect(groups.get("x")).toBe(1);
  });
});

describe("rankCompetitors", () => {
  it("ranks within a group, and shares a rank for equal strength", () => {
    const rows = rankCompetitors([heat(["a", "b"]), heat(["b", "a"])]);
    expect(rows.map((r) => [r.id, r.rank])).toEqual([["a", 1], ["b", 1]]);
  });

  it("marks a competitor provisional until it has three heats", () => {
    const rows = rankCompetitors([heat(["a", "b"]), heat(["a", "c"]), heat(["a", "d"])]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.a!.provisional).toBe(false);
    expect(byId.b!.provisional).toBe(true);
  });

  it("marks single band when every heat sat in one proof band, and not when a heat spans bands", () => {
    const rows = rankCompetitors([heat(["a", "b"], 100), heat(["a", "c"], 102), heat(["a", "d"], 101), {
      ranking: [{ id: "e", proof: 90 }, { id: "f", proof: 120 }],
    }]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.a!.singleBand).toBe(true);
    expect(byId.e!.singleBand).toBe(false);
  });

  it("does not call a bottle single band when a proof is unknown", () => {
    const rows = rankCompetitors([heat(["a", "b"], null)]);
    expect(rows.every((r) => !r.singleBand)).toBe(true);
  });

  it("keeps separate tournaments in separate groups", () => {
    const rows = rankCompetitors([heat(["a", "b"]), heat(["x", "y"])]);
    expect(new Set(rows.map((r) => r.group)).size).toBe(2);
  });

  it("ignores heats of fewer than two", () => {
    expect(rankCompetitors([heat(["solo"])])).toEqual([]);
  });
});

describe("audit", () => {
  // Six bottles that met across bands, ranked a to f, each with three or more heats.
  const heats: RankedHeat[] = [];
  const ids = ["a", "b", "c", "d", "e", "f"];
  const proof: Record<string, number> = { a: 90, b: 100, c: 110, d: 120, e: 95, f: 105 };
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) heats.push({ ranking: [{ id: ids[i]!, proof: proof[ids[i]!]! }, { id: ids[j]!, proof: proof[ids[j]!]! }] });
  }
  const strengths = rankCompetitors(heats);

  it("lists the biggest disagreements between rank and rating first", () => {
    // a ranks first but is rated worst; f ranks last but is rated best.
    const ratings = new Map<string, number | null>([["a", 5], ["b", 7], ["c", 7.5], ["d", 8], ["e", 8.5], ["f", 9]]);
    const rows = audit(strengths, ratings);
    expect(rows[0]!.id === "a" || rows[0]!.id === "f").toBe(true);
    const a = rows.find((r) => r.id === "a")!;
    expect(a.rank).toBe(1);
    expect(a.expectedRank).toBe(6);
    expect(a.gap).toBe(-5);
    const f = rows.find((r) => r.id === "f")!;
    expect(f.gap).toBe(5);
  });

  it("skips unrated and provisional competitors, and never compares fewer than two rated", () => {
    const ratings = new Map<string, number | null>([["a", 8], ["b", null], ["c", null], ["d", null], ["e", null], ["f", null]]);
    expect(audit(strengths, ratings)).toEqual([]);
    const few = rankCompetitors([heat(["a", "b"]), heat(["b", "c"])]);
    expect(audit(few, new Map([["a", 8], ["b", 7], ["c", 6]]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/tournaments/__tests__/ranking.test.ts`
Expected: FAIL, "Failed to resolve import ../ranking".

- [ ] **Step 3: Write the implementation**

Create `src/lib/tournaments/ranking.ts`:

```ts
import { PROOF_BAND } from "./keys";

/** Fewer heats than this and a competitor's rank is provisional, not firm. */
export const FIRM_HEATS = 3;
/** How strongly strengths are pulled toward the average, in pseudo-heats against a fixed average competitor. */
export const PRIOR_WEIGHT = 0.5;

/** One decided heat: its competitors best first, with the proof each had (null when unknown). */
export type RankedHeat = { ranking: { id: string; proof: number | null }[] };

export type Strength = {
  id: string;
  /** Log strength; higher is better. Only comparable inside a group. */
  theta: number;
  /** 1 is best within the competitor's group; competitors with equal strength share a rank. */
  rank: number;
  heats: number;
  provisional: boolean;
  /** Every heat it played sat inside one proof band, so it has never been set against a different strength. */
  singleBand: boolean;
  /** Competitors linked by sharing heats are comparable; this numbers the groups, the largest first. */
  group: number;
  groupSize: number;
};

/**
 * Fits a Plackett-Luce model to the heats by minorization-maximization. A heat is a sequence of choices: the first
 * place beat everyone, the second beat everyone after it, and so on. A pull toward the average (one win and one loss
 * of weight `prior` against a fixed average competitor) keeps a bottle that has only won from getting an infinite
 * strength. The result does not depend on the order the heats are given in.
 */
export function fitStrengths(heats: readonly string[][], prior = PRIOR_WEIGHT): Map<string, number> {
  const ids = [...new Set(heats.flat())].sort();
  const index = new Map(ids.map((id, i) => [id, i]));
  const rankings = heats.map((ranking) => Int32Array.from(ranking, (id) => index.get(id)!));

  const gamma = new Float64Array(ids.length).fill(1);
  const wins = new Float64Array(ids.length).fill(prior);
  for (const ranking of rankings) for (let stage = 0; stage < ranking.length - 1; stage++) wins[ranking[stage]!]! += 1;

  const denominator = new Float64Array(ids.length);
  for (let iteration = 0; iteration < 5000; iteration++) {
    for (let i = 0; i < ids.length; i++) denominator[i] = (2 * prior) / (gamma[i]! + 1);
    for (const ranking of rankings) {
      const last = ranking.length - 1;
      // totals[s] is the strength still in the running at stage s; the entrant at position k is in stages 0..min(k, last - 1).
      let rest = 0;
      for (let k = 0; k <= last; k++) rest += gamma[ranking[k]!]!;
      let running = 0;
      let remaining = rest;
      for (let k = 0; k <= last; k++) {
        if (k < last) running += 1 / remaining;
        denominator[ranking[k]!]! += running;
        remaining -= gamma[ranking[k]!]!;
      }
    }
    let moved = 0;
    for (let i = 0; i < ids.length; i++) {
      const next = wins[i]! / denominator[i]!;
      moved = Math.max(moved, Math.abs(Math.log(next / gamma[i]!)));
      gamma[i] = next;
    }
    if (moved < 1e-10) break;
  }
  return new Map(ids.map((id, i) => [id, Math.log(gamma[i]!)]));
}

/** Competitors who share a heat, directly or through others, form one group. Returns id to group index, largest first. */
export function comparableGroups(heats: readonly string[][]): Map<string, number> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  for (const id of heats.flat()) if (!parent.has(id)) parent.set(id, id);
  for (const ranking of heats) {
    for (const id of ranking.slice(1)) parent.set(find(id), find(ranking[0]!));
  }
  const members = new Map<string, string[]>();
  for (const id of parent.keys()) members.set(find(id), [...(members.get(find(id)) ?? []), id]);
  const ordered = [...members.values()].map((m) => m.sort()).sort((a, b) => b.length - a.length || a[0]!.localeCompare(b[0]!));
  return new Map(ordered.flatMap((m, index) => m.map((id) => [id, index] as const)));
}

/** The proof band every competitor in a heat sits in, or null when any proof is unknown or they span bands. */
function heatBand(heat: RankedHeat): number | null {
  const proofs = heat.ranking.map((c) => c.proof);
  if (proofs.length === 0 || proofs.some((p) => p === null)) return null;
  const bands = new Set((proofs as number[]).map((p) => Math.floor(p / PROOF_BAND)));
  return bands.size === 1 ? [...bands][0]! : null;
}

/** Strength, rank and flags for every competitor in the decided heats. */
export function rankCompetitors(heats: readonly RankedHeat[], prior = PRIOR_WEIGHT): Strength[] {
  const usable = heats.filter((h) => h.ranking.length >= 2);
  const orders = usable.map((h) => h.ranking.map((c) => c.id));
  const theta = fitStrengths(orders, prior);
  const group = comparableGroups(orders);

  const played = new Map<string, (number | null)[]>();
  for (const heat of usable) {
    const band = heatBand(heat);
    for (const { id } of heat.ranking) played.set(id, [...(played.get(id) ?? []), band]);
  }
  const groupSize = new Map<number, number>();
  for (const g of group.values()) groupSize.set(g, (groupSize.get(g) ?? 0) + 1);

  const rows = [...theta].map(([id, value]) => {
    const bands = played.get(id)!;
    return {
      id,
      theta: value,
      heats: bands.length,
      provisional: bands.length < FIRM_HEATS,
      singleBand: bands.every((b) => b !== null && b === bands[0]),
      group: group.get(id)!,
      groupSize: groupSize.get(group.get(id)!)!,
    };
  });
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  return rows
    .map((row) => ({ ...row, rank: 1 + rows.filter((o) => o.group === row.group && o.theta > row.theta && !same(o.theta, row.theta)).length }))
    .sort((a, b) => a.group - b.group || a.rank - b.rank || a.id.localeCompare(b.id));
}

export type AuditRow = {
  id: string;
  rating: number;
  rank: number;
  groupSize: number;
  /** Where the rating alone would put it in the group's ranking. */
  expectedRank: number;
  /** rank minus expectedRank: positive means it ranks worse than its rating suggests. */
  gap: number;
};

/**
 * Where the tournament ranking and the 0 to 10 ratings disagree, biggest gap first. A competitor is audited only when
 * its rank is firm, it has met more than one proof band, and it has a rating. Ratings are compared as percentiles
 * among the rated competitors of its own group, so groups that cannot be compared are never mixed.
 */
export function audit(strengths: readonly Strength[], ratings: ReadonlyMap<string, number | null>): AuditRow[] {
  const rows: AuditRow[] = [];
  const groups = new Set(strengths.map((s) => s.group));
  for (const group of groups) {
    const members = strengths.filter((s) => s.group === group);
    const rated = members.filter((s) => ratings.get(s.id) != null);
    if (members.length < 2 || rated.length < 2) continue;
    for (const s of rated) {
      if (s.provisional || s.singleBand) continue;
      const rating = ratings.get(s.id)!;
      const ratingRank = 1 + rated.filter((o) => ratings.get(o.id)! > rating).length;
      const expectedRank = 1 + Math.round(((ratingRank - 1) / (rated.length - 1)) * (members.length - 1));
      rows.push({ id: s.id, rating, rank: s.rank, groupSize: members.length, expectedRank, gap: s.rank - expectedRank });
    }
  }
  return rows.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/tournaments/__tests__/ranking.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole engine and the repo checks**

```bash
npx vitest run src/lib/tournaments && npm run typecheck && npm run lint && npm test
```
Expected: PASS (50 tests in `src/lib/tournaments`).

- [ ] **Step 6: Re-time a large fit**

Create a temporary file `src/lib/tournaments/__tests__/perf.tmp.test.ts` (do not commit it):

```ts
import { it } from "vitest";
import { rankCompetitors } from "../ranking";

it("times a big fit", { timeout: 60000 }, () => {
  let seed = 1;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const heats = [];
  for (let h = 0; h < 3000; h++) {
    const ids = new Set<number>();
    while (ids.size < 4) ids.add(Math.floor(rnd() * 400));
    const order = [...ids].sort((a, b) => a + rnd() * 120 - (b + rnd() * 120));
    heats.push({ ranking: order.map((i) => ({ id: "b" + i, proof: 90 + (i % 40) })) });
  }
  const start = Date.now();
  const rows = rankCompetitors(heats);
  console.log("competitors", rows.length, "ms", Date.now() - start);
});
```
Run: `npx vitest run src/lib/tournaments/__tests__/perf.tmp.test.ts`
Expected: finishes in well under 2 seconds (about 0.2 seconds on the machine this plan was checked on). Then delete the file: `rm src/lib/tournaments/__tests__/perf.tmp.test.ts`.

- [ ] **Step 7: Commit and stop**

```bash
git add src/lib/tournaments/ranking.ts src/lib/tournaments/__tests__/ranking.test.ts
git commit -m "Tournament engine: Plackett-Luce ranking, comparable groups and the rating audit"
git log --oneline origin/main..HEAD
```
Expected: six commits (types, mashbill, keys, flights, rounds, ranking). Do not push or open a pull request unless the user asks. Report the branch, the test count, and the timing.

---

## Self-review (spec coverage)

- Spec section 4 grouping, priority order, bands, key values, mashbill position, Blend, missing values, determinism: Tasks 2 to 4.
- Spec section 4 advancement (`max(1, floor(s/2))`), byes, final, standings, withdrawing (`nextPool`'s `withdrawn`): Task 5.
- Spec section 4 flight labels (generated from shared mashbill and distillery, falling back to the proof band): Task 4 `autoLabel` and `heatBand`. A custom label and blind-hiding are rules for the data layer and the UI, in later plans.
- Spec section 7 Plackett-Luce with a prior, provisional under 3 heats, comparable groups, single band, audit by percentile: Task 6.
- Spec section 4 "Move", "Reset", "Undo", the draw: these change stored state, so they belong to the data-layer plan, which calls `groupIntoHeats` and `nextPool`.
- No placeholders. Names agree across tasks: `Entrant`, `MashbillInput`, `GroupKey`, `DEFAULT_GROUP_ORDER`, `isGroupOrder`, `mashbillKey`, `mashbillDisplay`, `sortEntrants`, `keyValue`, `groupIntoHeats`, `heatBand`, `autoLabel`, `HeatResult`, `advancers`, `nextPool`, `planRounds`, `standings`, `RankedHeat`, `rankCompetitors`, `audit`.
