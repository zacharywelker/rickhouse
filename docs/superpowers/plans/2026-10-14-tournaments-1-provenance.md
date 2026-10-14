# Tournaments, Plan 1: Provenance on label-page tastings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A label's tasting rows say whether the bottle was a single barrel, a private selection (with its pick name and picker), a specific barrel, or a specific release, on the web label page and in the iOS app.

**Architecture:** One pure function, `provenanceOf`, turns a bottle's fields into a small `Provenance` object (or `null` for a standard bottle or no bottle). The label query selects the extra bottle columns, `GET /api/v1/expressions/:id` adds a `provenance` object to each tasting (additive, as API v1 requires), the web page renders it as one muted line, and the iOS app decodes it and renders the same line. The web and iOS tag text is produced by two small mirrored functions (`provenanceTags` in TypeScript, `Format.provenanceTags` in Swift) that the tests keep in step.

**Tech Stack:** Next.js (this repo's version differs from older ones; see `AGENTS.md`), Drizzle ORM, Vitest, SwiftUI, XCTest.

**Spec:** `docs/superpowers/specs/2026-10-13-tournament-design.md`, section 9. This is PR 0 in the build order (section 10). It is useful on its own and the tournament audit relies on it.

## Global Constraints

- API v1 changes are additive only (`src/lib/api/v1.ts`): add `provenance`, never rename or remove a field.
- A tasting with no bottle has no provenance. Giving a tasting its own provenance fields is out of scope (spec section 9).
- Tag text, in this order: `Private selection`, `“<pick name>”`, `Picked by <picker>`, `Single barrel`, `Barrel <number>`, then the release name (or `Batch <batch>` when there is no release name), then the year unless the release name already contains it.
- A private selection is `is_single_barrel_pick` true **or** a non-blank `picked_by`.
- Blank or whitespace-only text counts as absent.
- Match the surrounding code's comment density and naming. Do not add a dependency.
- Read the relevant guide in `node_modules/next/dist/docs/` before changing a Next.js route or page, as `AGENTS.md` says. This plan edits an existing route and page without new Next.js APIs, so the existing code is the pattern.
- iOS builds and tests run on the iMac: from the `ios/` directory, `mac-build test` (see the project notes, `ios-build-host`). The Linux machine cannot build iOS.
- Do not open a pull request unless the user asks. Commit on the branch and stop.

## Review Focus

Inputs the spec implies but a quick read would miss, most likely first. Each has a test or a named manual check in the owning task.

1. **A pour with no bottle** (a bar pour, a friend's bottle, or a bottle that was deleted): every bottle column comes back `null` from the left join, including the two booleans. Expected: no provenance, no tag line, no crash. Task 1 tests `null` booleans; Task 2 tests the API row.
2. **Blank text** (`pick_name = ''`, `picked_by = ' '`): expected to read as absent, not as an empty `“”` tag. Task 1.
3. **An older server** (no `provenance` key at all) and **a standard bottle** (`provenance: null`): the iOS app must decode both and show nothing. Task 4.
4. **A release whose name already holds the year** ("Spring 2024" with year 2024): expected one tag, not two. Task 1 (TypeScript) and Task 4 (Swift).
5. **A very long pick name** on a narrow phone or at the largest text size: expected to wrap, never truncate or overflow. Manual check in Task 3 and Task 4.

---

### Task 0: Branch and workspace

**Files:** none.

- [ ] **Step 1: Check for existing work on this topic**

```bash
cd /home/zacharywelker/rickhouse-dev
git ls-remote origin 'refs/heads/claude/*' | grep -i -E 'provenance|tournament' ; gh pr list --state all --search "provenance" --limit 5
```
Expected: no matching branch or PR other than the spec branch `claude/tournament-spec`. If a provenance branch or PR exists, build on it instead of starting a new one.

- [ ] **Step 2: Create a worktree from the latest main**

```bash
git fetch origin main
git worktree add .worktrees/tournament-provenance -b claude/tournament-provenance origin/main
cd .worktrees/tournament-provenance
npm ci
```
Expected: `npm ci` finishes without errors. All later commands run from `.worktrees/tournament-provenance`.

- [ ] **Step 3: Confirm the baseline is green**

```bash
npm run typecheck && npm test
```
Expected: PASS. If it fails before any change, stop and report; do not fold an unrelated fix into this branch.

---

### Task 1: The provenance helper

**Files:**
- Create: `src/lib/provenance.ts`
- Test: `src/lib/__tests__/provenance.test.ts`

**Interfaces:**
- Produces:
  - `type ProvenanceInput = { isSingleBarrel: boolean | null; isSingleBarrelPick: boolean | null; pickName: string | null; pickedBy: string | null; barrelNumber: string | null; releaseName: string | null; bottleBatch: string | null; releaseYear: number | null }`
  - `type Provenance = { singleBarrel: boolean; privateSelection: boolean; pickName: string | null; pickedBy: string | null; barrelNumber: string | null; release: string | null; batch: string | null; releaseYear: number | null }`
  - `provenanceOf(input: ProvenanceInput): Provenance | null`
  - `provenanceTags(provenance: Provenance | null): string[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/provenance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { provenanceOf, provenanceTags, type ProvenanceInput } from "../provenance";

const standard: ProvenanceInput = {
  isSingleBarrel: false,
  isSingleBarrelPick: false,
  pickName: null,
  pickedBy: null,
  barrelNumber: null,
  releaseName: null,
  bottleBatch: null,
  releaseYear: null,
};

describe("provenanceOf", () => {
  it("is null for a standard bottle", () => {
    expect(provenanceOf(standard)).toBeNull();
  });

  it("is null for a pour with no bottle, where every field comes back null from the join", () => {
    expect(provenanceOf({ ...standard, isSingleBarrel: null, isSingleBarrelPick: null })).toBeNull();
  });

  it("treats blank text as absent", () => {
    expect(provenanceOf({ ...standard, pickName: "  ", pickedBy: "", barrelNumber: " " })).toBeNull();
  });

  it("counts a picker as a private selection even when the flag is off", () => {
    expect(provenanceOf({ ...standard, pickedBy: "Total Wine" })).toMatchObject({ privateSelection: true, pickedBy: "Total Wine" });
  });
});

describe("provenanceTags", () => {
  it("is empty without provenance", () => {
    expect(provenanceTags(null)).toEqual([]);
  });

  it("names a private single-barrel pick in full", () => {
    const p = provenanceOf({
      ...standard,
      isSingleBarrel: true,
      isSingleBarrelPick: true,
      pickName: "Fall barrel",
      pickedBy: "Total Wine",
      barrelNumber: "1234",
    });
    expect(provenanceTags(p)).toEqual(["Private selection", "“Fall barrel”", "Picked by Total Wine", "Single barrel", "Barrel 1234"]);
  });

  it("shows a plain single barrel", () => {
    expect(provenanceTags(provenanceOf({ ...standard, isSingleBarrel: true }))).toEqual(["Single barrel"]);
  });

  it("shows a release by name, and does not repeat its year", () => {
    const p = provenanceOf({ ...standard, releaseName: "Spring 2024", releaseYear: 2024 });
    expect(provenanceTags(p)).toEqual(["Spring 2024"]);
  });

  it("shows a batch and a year when there is no release name", () => {
    const p = provenanceOf({ ...standard, bottleBatch: "B521", releaseYear: 2021 });
    expect(provenanceTags(p)).toEqual(["Batch B521", "2021"]);
  });

  it("prefers the release name to a batch", () => {
    const p = provenanceOf({ ...standard, releaseName: "Spring 2024", bottleBatch: "B1" });
    expect(provenanceTags(p)).toEqual(["Spring 2024"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/provenance.test.ts`
Expected: FAIL, "Failed to resolve import ../provenance".

- [ ] **Step 3: Write the implementation**

Create `src/lib/provenance.ts`:

```ts
/**
 * What tells one bottle of a label from another, as a tasting inherits it: a single barrel, a private selection
 * (a store or group's own pick), a barrel number, a release or batch. Every field can be null, because a pour of a
 * bottle the owner does not have joins to no bottle at all.
 */
export type ProvenanceInput = {
  isSingleBarrel: boolean | null;
  isSingleBarrelPick: boolean | null;
  pickName: string | null;
  pickedBy: string | null;
  barrelNumber: string | null;
  releaseName: string | null;
  bottleBatch: string | null;
  releaseYear: number | null;
};

/** The shape the API sends for a tasting's bottle. `null` means a standard bottle, or no bottle. */
export type Provenance = {
  singleBarrel: boolean;
  privateSelection: boolean;
  pickName: string | null;
  pickedBy: string | null;
  barrelNumber: string | null;
  release: string | null;
  batch: string | null;
  releaseYear: number | null;
};

const blank = (value: string | null): string | null => (value && value.trim() !== "" ? value.trim() : null);

export function provenanceOf(input: ProvenanceInput): Provenance | null {
  const provenance: Provenance = {
    singleBarrel: input.isSingleBarrel === true,
    privateSelection: input.isSingleBarrelPick === true || blank(input.pickedBy) !== null,
    pickName: blank(input.pickName),
    pickedBy: blank(input.pickedBy),
    barrelNumber: blank(input.barrelNumber),
    release: blank(input.releaseName),
    batch: blank(input.bottleBatch),
    releaseYear: input.releaseYear,
  };
  const standard =
    !provenance.singleBarrel &&
    !provenance.privateSelection &&
    provenance.pickName === null &&
    provenance.barrelNumber === null &&
    provenance.release === null &&
    provenance.batch === null &&
    provenance.releaseYear === null;
  return standard ? null : provenance;
}

/** The short phrases that mark a tasting's bottle, most telling first. Empty for a standard bottle. */
export function provenanceTags(provenance: Provenance | null): string[] {
  if (!provenance) return [];
  const tags: string[] = [];
  if (provenance.privateSelection) tags.push("Private selection");
  if (provenance.pickName) tags.push(`“${provenance.pickName}”`);
  if (provenance.pickedBy) tags.push(`Picked by ${provenance.pickedBy}`);
  if (provenance.singleBarrel) tags.push("Single barrel");
  if (provenance.barrelNumber) tags.push(`Barrel ${provenance.barrelNumber}`);
  if (provenance.release) tags.push(provenance.release);
  else if (provenance.batch) tags.push(`Batch ${provenance.batch}`);
  if (provenance.releaseYear !== null && !(provenance.release ?? "").includes(String(provenance.releaseYear))) {
    tags.push(String(provenance.releaseYear));
  }
  return tags;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/provenance.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/provenance.ts src/lib/__tests__/provenance.test.ts
git commit -m "Provenance of a tasting's bottle: single barrel, private selection, release"
```

---

### Task 2: The label query and the API row

**Files:**
- Create: `src/lib/expressions/tasting-json.ts`
- Test: `src/lib/expressions/__tests__/tasting-json.test.ts`
- Modify: `src/lib/expressions/queries.ts` (the `tastingNotesForLabel` select, around line 586)
- Modify: `src/app/api/v1/expressions/[id]/route.ts` (the `tastings:` mapping, around lines 125-137, and the imports)

**Interfaces:**
- Consumes: `ProvenanceInput`, `provenanceOf` from Task 1.
- Produces:
  - `type LabelTastingRow` (`ProvenanceInput` plus `id`, `bottleId`, `source`, `tastedAt`, `tags`, `tastedOn`, `rating`, `nose`, `palate`, `finish`, `overall`)
  - `labelTastingJson(row: LabelTastingRow)`, the JSON for one tasting, with `provenance: Provenance | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/expressions/__tests__/tasting-json.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { labelTastingJson, type LabelTastingRow } from "../tasting-json";

const row: LabelTastingRow = {
  id: 4,
  bottleId: 9,
  source: "owned",
  tastedAt: null,
  tags: ["bourbon/fruity/citrus/lemon"],
  tastedOn: "2026-10-03",
  rating: "8.5",
  nose: "Cherry",
  palate: null,
  finish: null,
  overall: null,
  isSingleBarrel: true,
  isSingleBarrelPick: true,
  pickName: "Fall barrel",
  pickedBy: "Total Wine",
  barrelNumber: "1234",
  releaseName: null,
  bottleBatch: null,
  releaseYear: null,
};

describe("labelTastingJson", () => {
  it("adds the bottle's provenance to the tasting", () => {
    expect(labelTastingJson(row).provenance).toEqual({
      singleBarrel: true,
      privateSelection: true,
      pickName: "Fall barrel",
      pickedBy: "Total Wine",
      barrelNumber: "1234",
      release: null,
      batch: null,
      releaseYear: null,
    });
  });

  it("sends null provenance for a pour with no bottle", () => {
    const bar = { ...row, bottleId: null, isSingleBarrel: null, isSingleBarrelPick: null, pickName: null, pickedBy: null, barrelNumber: null };
    expect(labelTastingJson(bar).provenance).toBeNull();
  });

  it("changes nothing else in the row, so the API stays additive", () => {
    expect(Object.keys(labelTastingJson(row)).sort()).toEqual(
      ["bottleId", "finish", "id", "nose", "overall", "palate", "provenance", "rating", "source", "tags", "tastedAt", "tastedOn"],
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/expressions/__tests__/tasting-json.test.ts`
Expected: FAIL, "Failed to resolve import ../tasting-json".

- [ ] **Step 3: Write the mapper**

Create `src/lib/expressions/tasting-json.ts`:

```ts
import { provenanceOf, type ProvenanceInput } from "@/lib/provenance";

/** A row of `tastingNotesForLabel`, as far as the API cares. */
export type LabelTastingRow = ProvenanceInput & {
  id: number;
  bottleId: number | null;
  source: string | null;
  tastedAt: string | null;
  tags: string[];
  tastedOn: string;
  rating: string | null;
  nose: string | null;
  palate: string | null;
  finish: string | null;
  overall: string | null;
};

/** One tasting on `GET /api/v1/expressions/:id`. `provenance` is null for a standard bottle or no bottle. */
export function labelTastingJson(row: LabelTastingRow) {
  return {
    id: row.id,
    bottleId: row.bottleId,
    source: row.source,
    tastedAt: row.tastedAt,
    tags: row.tags,
    tastedOn: row.tastedOn,
    rating: row.rating,
    nose: row.nose,
    palate: row.palate,
    finish: row.finish,
    overall: row.overall,
    provenance: provenanceOf(row),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/expressions/__tests__/tasting-json.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Select the bottle columns in the label query**

In `src/lib/expressions/queries.ts`, in `tastingNotesForLabel`, the select currently ends with these three fields:

```ts
      batch: sql<string | null>`coalesce(${expressionReleases.name}::text, ${bottles.batch})`,
      barrelNumber: bottles.barrelNumber,
      pickName: bottles.pickName,
```

Add the new columns after `pickName` (keep the existing three for now; Task 3 removes `batch` once nothing reads it):

```ts
      batch: sql<string | null>`coalesce(${expressionReleases.name}::text, ${bottles.batch})`,
      barrelNumber: bottles.barrelNumber,
      pickName: bottles.pickName,
      pickedBy: bottles.pickedBy,
      isSingleBarrel: bottles.isSingleBarrel,
      isSingleBarrelPick: bottles.isSingleBarrelPick,
      releaseName: sql<string | null>`${expressionReleases.name}::text`,
      bottleBatch: bottles.batch,
      releaseYear: bottles.releaseYear,
```

- [ ] **Step 6: Use the mapper in the route**

In `src/app/api/v1/expressions/[id]/route.ts`, add the import next to the other `@/lib/expressions` imports:

```ts
import { labelTastingJson } from "@/lib/expressions/tasting-json";
```

Replace the whole `tastings:` mapping:

```ts
    tastings: tastings.map((t) => ({
      id: t.id,
      bottleId: t.bottleId,
      source: t.source,
      tastedAt: t.tastedAt,
      tags: t.tags,
      tastedOn: t.tastedOn,
      rating: t.rating,
      nose: t.nose,
      palate: t.palate,
      finish: t.finish,
      overall: t.overall,
    })),
```

with:

```ts
    tastings: tastings.map(labelTastingJson),
```

- [ ] **Step 7: Typecheck and run the suite**

Run: `npm run typecheck && npm test`
Expected: PASS. If `typecheck` reports a type mismatch between a query row and `LabelTastingRow`, fix `LabelTastingRow` to match the real column type (for example a `date` column typed `string`), not the query.

- [ ] **Step 8: Commit**

```bash
git add src/lib/expressions/tasting-json.ts src/lib/expressions/__tests__/tasting-json.test.ts src/lib/expressions/queries.ts "src/app/api/v1/expressions/[id]/route.ts"
git commit -m "Label API: each tasting carries the provenance of its bottle"
```

---

### Task 3: The web label page

**Files:**
- Modify: `src/app/(app)/expressions/[id]/page.tsx` (import, one small helper component, and the tasting row around lines 372-385)
- Modify: `src/lib/expressions/queries.ts` (remove the now-unused `batch` select)

**Interfaces:**
- Consumes: `provenanceOf`, `provenanceTags`, `ProvenanceInput` from Task 1; the extra columns from Task 2.

- [ ] **Step 1: Add the import**

In `src/app/(app)/expressions/[id]/page.tsx`, below the existing `@/lib/expressions/queries` import, add:

```ts
import { provenanceOf, provenanceTags, type ProvenanceInput } from "@/lib/provenance";
```

- [ ] **Step 2: Add the helper component**

Directly below the existing `releaseOf` function (leave `releaseOf` unchanged; it describes a bottle, not a tasting), add:

```tsx
/** What kind of bottle a tasting was of, when it was not a standard one: a private selection, a single barrel, a release. */
function NoteProvenance({ note }: { note: ProvenanceInput }) {
  const tags = provenanceTags(provenanceOf(note));
  return tags.length > 0 ? <p className="text-xs text-muted-foreground">{tags.join(" · ")}</p> : null;
}
```

- [ ] **Step 3: Replace the old fragment and add the line**

In the tasting row (`<li key={note.id} ...>`), delete this block inside `NoteWhen`:

```tsx
                        {note.pickName || note.barrelNumber || note.batch ? (
                          <span className="font-normal text-muted-foreground">
                            {" · "}
                            {note.pickName ?? (note.barrelNumber ? `barrel ${note.barrelNumber}` : note.batch)}
                          </span>
                        ) : null}
```

Then, after the `</div>` that closes the date-and-rating row and before the `{[ ["Nose", note.nose], ...` list, add:

```tsx
                    <NoteProvenance note={note} />
```

- [ ] **Step 4: Remove the unused `batch` select**

Confirm nothing reads it, then delete the line:

```bash
grep -rn "note\.batch\|\.batch" src/app src/components | grep -v "bottle" || true
```
Expected: no hit that reads a tasting's `batch`. Then in `tastingNotesForLabel` delete:

```ts
      batch: sql<string | null>`coalesce(${expressionReleases.name}::text, ${bottles.batch})`,
```

- [ ] **Step 5: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Check it by eye on a throwaway database**

Use the throwaway-database recipe: create `rickhouse_audit` in the `rickhouse-db` container, point a copy of `.env` at it, run `scripts/migrate.ts`, `scripts/reset.ts` and `scripts/seed.ts` with `node --env-file=<copy> --import tsx scripts/<name>.ts`, then `next dev -p 1965` and browse at `http://localhost:1965` (never `127.0.0.1`, which stops the page hydrating). Sign in as `member`, password `smoke-test-password`. Add a bourbon label and two bottles: one standard, one marked single barrel with a pick name `Fall barrel`, picked by `Total Wine`, barrel `1234`. Log a tasting on each, and one more as a bar pour with no bottle.

Expected on the label page, under "Tasting notes":
- the standard bottle's tasting has no extra line;
- the pick's tasting shows `Private selection · “Fall barrel” · Picked by Total Wine · Single barrel · Barrel 1234`;
- the bar pour has no extra line;
- give the pick a 60-character pick name and narrow the window to phone width: the line wraps and is not cut off.

Then drop the throwaway database.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/expressions/[id]/page.tsx" src/lib/expressions/queries.ts
git commit -m "Label page: tastings say when the bottle was a single barrel, private selection or release"
```

---

### Task 4: The iOS app

**Files:**
- Modify: `ios/Rickhouse/Models.swift` (`LabelTasting`, around line 290; add `TastingProvenance` below it)
- Modify: `ios/Rickhouse/Format.swift` (add `provenanceTags`, next to `pour`)
- Modify: `ios/Rickhouse/LabelPage.swift` (`TastingBlock`, around line 433)
- Test: `ios/RickhouseTests/TastingProvenanceTests.swift`

**Interfaces:**
- Consumes: the `provenance` object from Task 2: `{ singleBarrel, privateSelection, pickName, pickedBy, barrelNumber, release, batch, releaseYear }`, or `null`, or absent.
- Produces: `struct TastingProvenance`, `LabelTasting.provenance: TastingProvenance?`, `Format.provenanceTags(_:) -> [String]`.

- [ ] **Step 1: Write the failing test**

Create `ios/RickhouseTests/TastingProvenanceTests.swift`:

```swift
import XCTest
@testable import Rickhouse

final class TastingProvenanceTests: XCTestCase {
    private func tasting(_ extra: [String: Any] = [:]) throws -> LabelTasting {
        var json: [String: Any] = ["id": 1, "tastedOn": "2026-10-03"]
        json.merge(extra) { _, new in new }
        return try JSONDecoder().decode(LabelTasting.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testAnOlderServerSendsNoProvenance() throws {
        let t = try tasting()
        XCTAssertNil(t.provenance)
        XCTAssertEqual(Format.provenanceTags(t.provenance), [])
    }

    func testNullProvenanceMeansAStandardBottleOrNoBottle() throws {
        let t = try tasting(["provenance": NSNull()])
        XCTAssertNil(t.provenance)
        XCTAssertEqual(Format.provenanceTags(t.provenance), [])
    }

    func testAPrivateSingleBarrelPickReadsInFull() throws {
        let t = try tasting(["provenance": [
            "singleBarrel": true, "privateSelection": true, "pickName": "Fall barrel",
            "pickedBy": "Total Wine", "barrelNumber": "1234",
        ] as [String: Any]])
        XCTAssertEqual(
            Format.provenanceTags(t.provenance),
            ["Private selection", "“Fall barrel”", "Picked by Total Wine", "Single barrel", "Barrel 1234"]
        )
    }

    func testAReleaseDoesNotRepeatItsYear() throws {
        let t = try tasting(["provenance": [
            "singleBarrel": false, "privateSelection": false, "release": "Spring 2024", "releaseYear": 2024,
        ] as [String: Any]])
        XCTAssertEqual(Format.provenanceTags(t.provenance), ["Spring 2024"])
    }

    func testABatchAndYearShowWhenThereIsNoReleaseName() throws {
        let t = try tasting(["provenance": [
            "singleBarrel": false, "privateSelection": false, "batch": "B521", "releaseYear": 2021,
        ] as [String: Any]])
        XCTAssertEqual(Format.provenanceTags(t.provenance), ["Batch B521", "2021"])
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run, from the `ios/` directory: `mac-build test`
Expected: the build FAILS with "value of type 'LabelTasting' has no member 'provenance'" (and `Format.provenanceTags` not found).

- [ ] **Step 3: Add the model**

In `ios/Rickhouse/Models.swift`, add this `var` as the **last** stored property of `LabelTasting` (after `let overall: String?`). It must be a `var` with a default, so the synthesized decoder reads it when present and the existing memberwise `init` calls keep compiling:

```swift
    /// What kind of bottle this was, when it was not a standard one. Absent from an older server, and for a pour of
    /// a bottle you don't own.
    var provenance: TastingProvenance? = nil
```

Directly below the `LabelTasting` struct, add:

```swift
/// A tasting's bottle, when it was a single barrel, a private selection or a specific release.
struct TastingProvenance: Decodable, Equatable {
    let singleBarrel: Bool
    let privateSelection: Bool
    let pickName: String?
    let pickedBy: String?
    let barrelNumber: String?
    let release: String?
    let batch: String?
    let releaseYear: Int?
}
```

- [ ] **Step 4: Add the tag function**

In `ios/Rickhouse/Format.swift`, directly after `static func pour(...)`, add (it mirrors `provenanceTags` in `src/lib/provenance.ts`; change one, change the other):

```swift
    /// The short phrases that mark a tasting's bottle, most telling first; empty for a standard bottle. Mirrors
    /// `provenanceTags` in `src/lib/provenance.ts`, which the web label page uses.
    static func provenanceTags(_ provenance: TastingProvenance?) -> [String] {
        guard let p = provenance else { return [] }
        var tags: [String] = []
        if p.privateSelection { tags.append("Private selection") }
        if let name = p.pickName { tags.append("“\(name)”") }
        if let picker = p.pickedBy { tags.append("Picked by \(picker)") }
        if p.singleBarrel { tags.append("Single barrel") }
        if let barrel = p.barrelNumber { tags.append("Barrel \(barrel)") }
        if let release = p.release { tags.append(release) } else if let batch = p.batch { tags.append("Batch \(batch)") }
        if let year = p.releaseYear, !(p.release ?? "").contains(String(year)) { tags.append(String(year)) }
        return tags
    }
```

- [ ] **Step 5: Show the line in the tasting block**

In `ios/Rickhouse/LabelPage.swift`, in `TastingBlock`, directly after the existing

```swift
                    if let pour = Format.pour(source: tasting.source, tastedAt: tasting.tastedAt) ?? ownedLabel {
                        Text(pour).font(.inter(12, .medium, relativeTo: .caption)).foregroundStyle(Theme.muted)
                    }
```

add:

```swift
                    let provenance = Format.provenanceTags(tasting.provenance)
                    if !provenance.isEmpty {
                        Text(provenance.joined(separator: " · "))
                            .font(.inter(12, .medium, relativeTo: .caption)).foregroundStyle(Theme.muted)
                    }
```

The block already ends in `.accessibilityElement(children: .combine)`, so VoiceOver reads this line with the rest of the tasting.

- [ ] **Step 6: Run the tests**

Run, from `ios/`: `mac-build test`
Expected: the build succeeds and all tests pass, including the five new ones.

- [ ] **Step 7: Check it on the Simulator**

From `ios/`: `mac-build shot /tmp/label-page.png`, with the app pointed at the throwaway server from Task 3, signed in as `member`, on the label with the private-selection tasting. Open the screenshot.

Expected: the pick's tasting shows the muted line `Private selection · “Fall barrel” · Picked by Total Wine · Single barrel · Barrel 1234` under the date; the standard bottle's tasting and the bar pour show none. With the 60-character pick name, the line wraps. Note the screenshot path in the commit message body.

- [ ] **Step 8: Commit**

```bash
git add ios/Rickhouse/Models.swift ios/Rickhouse/Format.swift ios/Rickhouse/LabelPage.swift ios/RickhouseTests/TastingProvenanceTests.swift
git commit -m "iOS: label tastings say when the bottle was a single barrel, private selection or release"
```

---

### Task 5: Docs and the final check

**Files:**
- Modify: `ios/README.md` (the `GET /api/v1/expressions/:id` row, line 42)

- [ ] **Step 1: Document the new field**

In `ios/README.md`, change the row

```
| `GET /api/v1/expressions/:id` | One label, read rather than edited: its specs and photo, known releases, your bottles of it and the tastings on them |
```

to

```
| `GET /api/v1/expressions/:id` | One label, read rather than edited: its specs and photo, known releases, your bottles of it and the tastings on them. Each tasting has a `provenance` object (`singleBarrel`, `privateSelection`, `pickName`, `pickedBy`, `barrelNumber`, `release`, `batch`, `releaseYear`), or `null` for a standard bottle or a pour of a bottle you don't own |
```

- [ ] **Step 2: Run everything once more**

```bash
npm run typecheck && npm run lint && npm test
```
Expected: PASS.

- [ ] **Step 3: Commit and stop**

```bash
git add ios/README.md
git commit -m "Document provenance on the label tastings API"
git log --oneline origin/main..HEAD
```
Expected: four commits (helper, API, web, iOS) plus this one. Do not push or open a pull request unless the user asks. Report the branch name, the checks that passed, and the screenshot path.

---

## Self-review (spec coverage)

- Spec section 9, API returns a bottle summary: Task 2.
- Spec section 9, each tasting row shows it as a tag on web and iOS: Tasks 3 and 4.
- Spec section 9, a tasting with no bottle has no provenance: Task 1 and Task 2 tests, Task 4 test.
- API v1 additive only: Task 2 key-list test.
- No placeholders; names agree across tasks: `ProvenanceInput`, `Provenance`, `provenanceOf`, `provenanceTags`, `labelTastingJson`, `LabelTastingRow`, `TastingProvenance`, `Format.provenanceTags`.
