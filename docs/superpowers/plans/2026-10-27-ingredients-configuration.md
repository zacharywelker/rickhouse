# Ingredients in Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use beads-superpowers:subagent-driven-development (recommended) or beads-superpowers:executing-plans to implement this plan task-by-task. Each Task becomes a bead (`bd create -t task --parent <epic-id>`) where `bd` is installed; where it is not, track tasks inline. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make ingredient chips (rum and gin bases, botanicals, magueys, distillates, flavors) open a page of matching bottles, and give ingredients a home in Configuration with add, rename, delete and merge.

**Architecture:** Ingredients become a tenth admin resource on the existing registry (`src/lib/admin/registry.ts`). A per-row `/ingredients/[id]` page reuses `EntityPage` with a new `ingredientIds` bottle filter, exactly as finishes and mashbills do. Built-in presets move into one web module and are enforced as locked, read-only, reserved names on the server. Merge is a single transaction in `src/lib/ingredients/merge.ts`. No schema change.

**Tech Stack:** Next.js App Router, Drizzle ORM (Postgres, citext), Zod 4, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-ingredients-configuration-design.md`

## Spec adjustments found while planning

The spec is edited to match these in the same commit as this plan.

1. `showWhenAny` only reacts to sibling **boolean** fields, so it cannot show Family only for distillates. Family is shown by a resource-specific filter in `resource-form.tsx` (the same pattern the distilleries form already uses for `dspNumber` and `nomNumber`).
2. The reserved-name rule and the locks need the preset module and the `locked` row plumbing in **Phase 1**. Phase 2 is therefore: unused-built-ins footer, Merge, and the Merge pointer in the reserved-name message.
3. Merge renumbers **all** ingredient links of an affected label, not only the merged kind. Gin labels keep botanicals and bases in one `0..n-1` sequence.
4. The merge confirm dialog reads the count from the row's Labels cell, which `list()` already scopes by `ownerId`.
5. Known simplification: botanical presets are gin's list, so an amaro botanical named "Lemon" also shows as Built-in. Harmless: it is the same name.

## Global Constraints

- Web only. No iOS change. The REST kind list widening is additive.
- No schema change and no migration in either phase.
- Eight ingredient kinds, exactly: `maguey`, `distillate`, `rum_base`, `botanical`, `gin_base`, `vodka_base`, `flavor`, `liqueur_base`.
- Family values, exactly: `grape`, `apple`, `pear`, `other`. Required for distillates, null for every other kind.
- Names: trimmed, 1 to 120 characters. Unique per `(ownerId, kind, name)`, case-insensitive (citext).
- Every query, server action and page filters by `ownerId` and starts with `requireSession()` (REST: `getCurrentUser()`).
- `/ingredients/[id]` for another account's id returns 404.
- Built-in names are reserved. Rows are locked when a preset matches or when any link has `is_manual = false`.
- Delete is blocked while any label uses the ingredient, enforced server-side by a guarded statement that throws when it matches zero rows.
- Merge: same kind only, same family for distillates, confirm dialog with label count, irreversible, one transaction.
- Copy: "Already exists.", "N labels use this ingredient", "Something changed while saving. Try again."
- Run `npm run typecheck`, `npm run lint` and `npx vitest run` before every PR.
- DB-backed tests are opt-in: `TOURNAMENT_TEST_DATABASE_URL=postgres://user:pass@localhost:5432/scratch npx vitest run integration` (database name must contain test, proto, scratch or tourney; migrations applied).

## File Structure

Create:
- `src/lib/expressions/ingredient-presets.ts`: the one web source of preset names.
- `src/lib/expressions/ingredient-rules.ts`: pure rules: kind labels, locks, reserved names, merge targets, unused presets, `ingredientHref`.
- `src/lib/admin/errors.ts`: `AdminRuleError`.
- `src/app/(app)/ingredients/[id]/page.tsx`: the ingredient page.
- `src/lib/ingredients/merge.ts` (Phase 2): `mergeIngredient`, `listMergeTargets`.
- `src/app/(app)/admin/ingredients-actions.ts` (Phase 2): merge server actions.
- `src/components/admin/merge-dialog.tsx`, `src/components/admin/unused-built-ins.tsx` (Phase 2).
- Tests beside each (see tasks), plus `e2e/ingredients.spec.ts`.

Modify:
- `src/lib/expressions/gin-details.ts`, `src/components/expressions/ingredient-picker.tsx`
- `src/lib/admin/schemas.ts`, `types.ts`, `registry.ts`, `nav.ts`
- `src/app/(app)/admin/actions.ts`, `src/app/(app)/admin/[resource]/page.tsx`
- `src/components/admin/resource-view.tsx`, `resource-form.tsx`
- `src/lib/bottles/filters.ts`, `grid.ts`
- `src/lib/entities/queries.ts`, `src/components/entities/entity-page.tsx`
- `src/app/(app)/expressions/[id]/page.tsx`, `src/app/(app)/bottles/[id]/page.tsx`
- `src/app/api/v1/ingredients/route.ts`

---

# Phase 1: chips, page, filter, Ingredients resource (PR 1)

### Task 0: Branch and preflight

**Files:** none.

**Acceptance Criteria:**
- No existing branch or PR already covers this topic.
- Work happens on `claude/ingredients-config-phase-1`, based on fresh `origin/main`, carrying the spec and plan commits.

- [ ] **Step 1: Check for existing work**

```bash
git ls-remote origin 'refs/heads/claude/*'
gh pr list --state all --search "ingredient"
```
Expected: nothing matching ingredients in Configuration. If a branch or PR exists, stop and build on it instead.

- [ ] **Step 2: Branch from fresh main and bring the docs across**

```bash
git fetch origin main
git checkout -b claude/ingredients-config-phase-1 origin/main
git cherry-pick e83fb43..worktree-bridge-cse_01QZZCFPHkvunm7Uks7ffMH2
git log --oneline -6
```
Expected: the spec and plan commits sit on top of `origin/main`.

- [ ] **Step 3: Baseline**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. If it fails on a clean main, fix that as its own small PR first.

---

### Task 1: One source for preset names

**Files:**
- Create: `src/lib/expressions/ingredient-presets.ts`
- Create: `src/lib/expressions/__tests__/ingredient-presets.test.ts`
- Modify: `src/lib/expressions/gin-details.ts:4-13`
- Modify: `src/components/expressions/ingredient-picker.tsx` (the `STANDARD_BASES` line and the `presets` expression)

**Interfaces:**
- Produces: `GIN_BASES`, `GIN_BOTANICALS`, `RUM_BASES`, `VODKA_BASES`, `MAGUEY_PRESETS`, `INGREDIENT_PRESETS: Partial<Record<IngredientKind, readonly string[]>>`, `presetFor(kind, name): string | null`, `isPreset(kind, name): boolean`.

**Acceptance Criteria:**
- Every existing import of `GIN_BASES` and `GIN_BOTANICALS` from `gin-details` still works and returns the same arrays.
- The picker reads rum and vodka presets from the module, not inline literals.
- Juniper is a botanical preset and Blue Weber is a maguey preset.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/expressions/__tests__/ingredient-presets.test.ts
import { describe, expect, it } from "vitest";
import { GIN_BASES as ginBasesFromGin, GIN_BOTANICALS as botanicalsFromGin } from "../gin-details";
import { GIN_BASES, GIN_BOTANICALS, INGREDIENT_PRESETS, isPreset, presetFor } from "../ingredient-presets";

describe("ingredient presets", () => {
  it("has no case-insensitive duplicates within a kind", () => {
    for (const [kind, names] of Object.entries(INGREDIENT_PRESETS)) {
      const lowered = (names ?? []).map((name) => name.toLocaleLowerCase());
      expect(new Set(lowered).size, kind).toBe(lowered.length);
    }
  });

  it("keeps Juniper and Blue Weber as built-ins", () => {
    expect(isPreset("botanical", "Juniper")).toBe(true);
    expect(isPreset("maguey", "Blue Weber")).toBe(true);
  });

  it("matches regardless of case and surrounding space, and returns the canonical spelling", () => {
    expect(presetFor("rum_base", "  molasses ")).toBe("Molasses");
    expect(presetFor("gin_base", "WHEAT")).toBe("Wheat");
  });

  it("never matches a kind that has no presets, or a name from another kind", () => {
    expect(isPreset("flavor", "Wheat")).toBe(false);
    expect(isPreset("rum_base", "Wheat")).toBe(false);
  });

  it("is still exported from gin-details with the same contents", () => {
    expect(ginBasesFromGin).toBe(GIN_BASES);
    expect(botanicalsFromGin).toBe(GIN_BOTANICALS);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/expressions/__tests__/ingredient-presets.test.ts`
Expected: FAIL, cannot resolve `../ingredient-presets`.

- [ ] **Step 3: Create the module**

```ts
// src/lib/expressions/ingredient-presets.ts
import type { IngredientKind } from "@/db/schema";

/**
 * The names the web label forms offer before anyone has typed one. They are constants, not rows:
 * a row appears only when a label uses the name or someone adds it in Configuration. The iOS copy
 * lives in SpiritChoices.swift and is not kept in step by this module.
 */
export const GIN_BASES = ["Corn", "Potato", "Rye", "Grape", "Molasses", "Sugarcane", "Apple", "Wheat", "Barley", "Whey"] as const;
export const GIN_BOTANICALS = [
  "Juniper", "Coriander", "Angelica Root", "Cassia Bark", "Lemon", "Bitter Orange", "Lime", "Yuzu",
  "Grapefruit", "Pomelo", "Cardamom", "Cucumber", "Lavender", "Allspice", "Almond", "Bergamot",
  "Anise", "Basil", "Bay Laurel", "Black Pepper", "Blood Orange", "Butterfly Pea Flower",
  "Hibiscus", "Chamomile", "Cloves", "Cubeb Pepper", "Dill", "Elderflower", "Elderberry",
  "Fennel", "Ginger", "Grains of Paradise", "Honeysuckle", "Lemongrass", "Licorice",
  "Meadowsweet", "Nutmeg", "Orris Root", "Rosemary", "Rose", "Thyme",
] as const;
export const RUM_BASES = ["Molasses", "Sugarcane", "Honey"] as const;
export const VODKA_BASES = ["Wheat", "Rye", "Potato", "Corn", "Grape"] as const;
export const MAGUEY_PRESETS = ["Blue Weber"] as const;

export const INGREDIENT_PRESETS: Partial<Record<IngredientKind, readonly string[]>> = {
  maguey: MAGUEY_PRESETS,
  rum_base: RUM_BASES,
  gin_base: GIN_BASES,
  botanical: GIN_BOTANICALS,
  vodka_base: VODKA_BASES,
};

/** The canonical spelling of the preset this name matches for this kind, or null. */
export function presetFor(kind: IngredientKind, name: string): string | null {
  const wanted = name.trim().toLocaleLowerCase();
  return INGREDIENT_PRESETS[kind]?.find((preset) => preset.toLocaleLowerCase() === wanted) ?? null;
}

export const isPreset = (kind: IngredientKind, name: string): boolean => presetFor(kind, name) !== null;
```

- [ ] **Step 4: Point gin-details at it**

In `src/lib/expressions/gin-details.ts` delete the `GIN_BASES` and `GIN_BOTANICALS` definitions (lines 4 to 13) and put this in their place, leaving `GIN_STYLES`, `isGinKind` and the rest alone:

```ts
export { GIN_BASES, GIN_BOTANICALS } from "./ingredient-presets";
```

- [ ] **Step 5: Point the picker at it**

In `src/components/expressions/ingredient-picker.tsx`: delete the line `const STANDARD_BASES = ["Molasses", "Sugarcane", "Honey"];`, add `RUM_BASES, VODKA_BASES` to the existing `GIN_BASES, GIN_BOTANICALS` import (change that import's source to `@/lib/expressions/ingredient-presets` for all four names), and replace the `presets` expression with:

```tsx
  const presets = kind === "rum_base" ? RUM_BASES : kind === "botanical" && isGinKind(categoryKind) ? GIN_BOTANICALS : kind === "gin_base" ? GIN_BASES : kind === "vodka_base" ? VODKA_BASES : [];
```

- [ ] **Step 6: Verify**

Run: `npx vitest run src/lib/expressions && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/expressions src/components/expressions/ingredient-picker.tsx
git commit -m "Move ingredient presets into one web module

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pure ingredient rules

**Files:**
- Create: `src/lib/expressions/ingredient-rules.ts`
- Create: `src/lib/expressions/__tests__/ingredient-rules.test.ts`

**Interfaces:**
- Consumes: `isPreset`, `presetFor` from Task 1.
- Produces: `INGREDIENT_KIND_LABELS`, `FAMILIES`, `isIngredientKind(value: unknown): value is IngredientKind`, `type Lock`, `lockFor(row): Lock | null`, `reservedNameError(kind, name): string | null`, `ingredientHref(item): Route`.

**Acceptance Criteria:**
- A row with a preset name is locked as "Built-in"; a row with any style-derived link is locked as "Fixed"; style wins when both apply.
- `reservedNameError` returns a message only for preset names of that kind.
- `isIngredientKind` accepts exactly the eight kinds and rejects prototype keys like `"toString"`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/expressions/__tests__/ingredient-rules.test.ts
import { describe, expect, it } from "vitest";
import { FAMILIES, INGREDIENT_KIND_LABELS, ingredientHref, isIngredientKind, lockFor, reservedNameError } from "../ingredient-rules";

describe("lockFor", () => {
  it("locks a preset name as Built-in", () => {
    expect(lockFor({ kind: "botanical", name: "juniper", styleLinks: 0 })?.tag).toBe("Built-in");
  });

  it("locks a row with a style-derived link as Fixed, even when it is not a preset", () => {
    expect(lockFor({ kind: "botanical", name: "Wormwood", styleLinks: 1 })?.tag).toBe("Fixed");
  });

  it("prefers Fixed when both apply", () => {
    expect(lockFor({ kind: "botanical", name: "Juniper", styleLinks: 2 })?.tag).toBe("Fixed");
  });

  it("leaves an ordinary custom row editable, so Wormwood on a gin is not locked", () => {
    expect(lockFor({ kind: "botanical", name: "Wormwood", styleLinks: 0 })).toBeNull();
  });
});

describe("reservedNameError", () => {
  it("names the canonical spelling for a preset of that kind", () => {
    expect(reservedNameError("rum_base", "sugarcane")).toBe("Sugarcane is a built-in choice.");
  });

  it("allows a name that is a preset only of another kind", () => {
    expect(reservedNameError("flavor", "Sugarcane")).toBeNull();
  });
});

describe("isIngredientKind", () => {
  it("accepts all eight kinds and nothing else", () => {
    expect(Object.keys(INGREDIENT_KIND_LABELS)).toHaveLength(8);
    for (const kind of Object.keys(INGREDIENT_KIND_LABELS)) expect(isIngredientKind(kind)).toBe(true);
    for (const bad of ["", "gin", "toString", "__proto__", null, undefined, 3]) expect(isIngredientKind(bad)).toBe(false);
  });
});

it("offers the four families and links chips by id", () => {
  expect([...FAMILIES]).toEqual(["grape", "apple", "pear", "other"]);
  expect(ingredientHref({ id: 12 })).toBe("/ingredients/12");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/expressions/__tests__/ingredient-rules.test.ts`
Expected: FAIL, cannot resolve `../ingredient-rules`.

- [ ] **Step 3: Implement**

```ts
// src/lib/expressions/ingredient-rules.ts
import type { Route } from "next";
import type { IngredientKind } from "@/db/schema";
import { isPreset, presetFor } from "./ingredient-presets";

/**
 * No value import from the schema here: ResourceView is a client component and this file rides
 * along with it. The Record type makes the compiler list any kind added to the schema later.
 */
export const INGREDIENT_KIND_LABELS: Record<IngredientKind, string> = {
  maguey: "Maguey",
  distillate: "Distillate",
  rum_base: "Rum base",
  botanical: "Botanical",
  gin_base: "Gin base",
  vodka_base: "Vodka base",
  flavor: "Flavor",
  liqueur_base: "Liqueur base",
};

export const FAMILIES = ["grape", "apple", "pear", "other"] as const;

export function isIngredientKind(value: unknown): value is IngredientKind {
  return typeof value === "string" && Object.hasOwn(INGREDIENT_KIND_LABELS, value);
}

export type Lock = { tag: "Built-in" | "Fixed"; reason: string };

/**
 * Why a row cannot be renamed or deleted, or null. A style-derived link means an amaro save will
 * re-add the botanical by name, so a rename would be undone; a preset would come straight back as
 * a suggestion. Decided from data, not a name list, so a new amaro style is covered automatically.
 */
export function lockFor(row: { kind: IngredientKind; name: string; styleLinks: number }): Lock | null {
  if (row.styleLinks > 0) {
    return { tag: "Fixed", reason: "An amaro style adds this automatically, so it can't be renamed or deleted." };
  }
  if (isPreset(row.kind, row.name)) {
    return { tag: "Built-in", reason: "This comes with the app, so it can't be renamed or deleted." };
  }
  return null;
}

export function reservedNameError(kind: IngredientKind, name: string): string | null {
  const preset = presetFor(kind, name);
  return preset ? `${preset} is a built-in choice.` : null;
}

export const ingredientHref = (item: { id: number }): Route => `/ingredients/${item.id}` as Route;
```

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/expressions/__tests__/ingredient-rules.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/expressions
git commit -m "Add pure ingredient rules: kinds, locks, reserved names

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ingredient schema

**Files:**
- Modify: `src/lib/admin/schemas.ts` (imports at top; add the schema after `cooperageSchema`, line ~230; add an inferred type at the bottom)
- Create: `src/lib/admin/__tests__/ingredient-schema.test.ts`

**Interfaces:**
- Consumes: `FAMILIES` from Task 2; `INGREDIENT_KINDS` from `@/db/schema`.
- Produces: `ingredientSchema` whose parsed output is `{ name: string; kind: IngredientKind; family: string | null }`.

**Acceptance Criteria:**
- FormData-style strings parse. Absent `family` is treated as blank.
- Distillates require one of the four families; every other kind gets `family: null` even if one is sent.
- Unknown or missing kind is rejected with "Choose a kind."; the name is trimmed and capped at 120.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/admin/__tests__/ingredient-schema.test.ts
import { describe, expect, it } from "vitest";
import { ingredientSchema } from "../schemas";

const input = (over: Record<string, string> = {}) => ({ name: "Palm Sugar", kind: "rum_base", family: "", ...over });

describe("ingredientSchema", () => {
  it("accepts a rum base without a family", () => {
    const parsed = ingredientSchema.safeParse(input());
    expect(parsed.success && parsed.data).toEqual({ name: "Palm Sugar", kind: "rum_base", family: null });
  });

  it("trims the name and rejects an empty or overlong one", () => {
    const trimmed = ingredientSchema.safeParse(input({ name: "  Palm Sugar  " }));
    expect(trimmed.success && trimmed.data.name).toBe("Palm Sugar");
    expect(ingredientSchema.safeParse(input({ name: "   " })).success).toBe(false);
    expect(ingredientSchema.safeParse(input({ name: "x".repeat(121) })).success).toBe(false);
  });

  it("requires a family for a distillate, pointing at the family field", () => {
    const parsed = ingredientSchema.safeParse(input({ kind: "distillate", name: "Muscat" }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.path[0]).toBe("family");
  });

  it("accepts each family for a distillate", () => {
    for (const family of ["grape", "apple", "pear", "other"]) {
      const parsed = ingredientSchema.safeParse(input({ kind: "distillate", name: "Muscat", family }));
      expect(parsed.success && parsed.data.family).toBe(family);
    }
  });

  it("drops a stray family on any other kind", () => {
    const parsed = ingredientSchema.safeParse(input({ kind: "botanical", family: "grape" }));
    expect(parsed.success && parsed.data.family).toBeNull();
  });

  it("rejects an unknown or missing kind", () => {
    expect(ingredientSchema.safeParse(input({ kind: "whiskey_base" })).success).toBe(false);
    expect(ingredientSchema.safeParse({ name: "Palm Sugar" }).success).toBe(false);
  });

  it("treats an absent family as blank", () => {
    expect(ingredientSchema.safeParse({ name: "Palm Sugar", kind: "rum_base" }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/admin/__tests__/ingredient-schema.test.ts`
Expected: FAIL, `ingredientSchema` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/admin/schemas.ts` change the schema import line to add `INGREDIENT_KINDS`:

```ts
import { DISTILLERY_DISCLOSURES, FIELD_GROUPS, FINISH_TYPES, INGREDIENT_KINDS, SCOTCH_REGIONS } from "@/db/schema";
```

Add below the existing `normalizeGrainName` import:

```ts
import { FAMILIES } from "@/lib/expressions/ingredient-rules";
```

Add after `cooperageSchema`:

```ts
export const ingredientSchema = z
  .object({
    name: requiredText(120),
    kind: z.enum(INGREDIENT_KINDS, { message: "Choose a kind." }),
    family: blankIfAbsent(trimmed),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "distillate" && !(FAMILIES as readonly string[]).includes(value.family)) {
      ctx.addIssue({ code: "custom", path: ["family"], message: "Choose a family." });
    }
  })
  // Family only means something for a distillate; anything sent with another kind is discarded.
  .transform((value) => ({ name: value.name, kind: value.kind, family: value.kind === "distillate" ? value.family : null }));
```

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/admin && npm run typecheck`
Expected: PASS. If Zod rejects the `{ message }` form on `z.enum`, use `{ error: "Choose a kind." }`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin
git commit -m "Add the ingredient admin schema

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rule errors reach the user

**Files:**
- Create: `src/lib/admin/errors.ts`
- Modify: `src/app/(app)/admin/actions.ts` (both `catch` blocks, lines ~47 and ~66)
- Create: `src/app/(app)/admin/__tests__/actions.test.ts`

**Interfaces:**
- Produces: `class AdminRuleError extends Error`. Anything a resource's `save` or `remove` throws as this is shown to the user verbatim; everything else still goes through `mapDbError`.

**Acceptance Criteria:**
- `deleteResourceAction` returns `{ ok: false, error: <message> }` for an `AdminRuleError`.
- A successful remove still returns `ok: true` with "Ingredient deleted."

- [ ] **Step 1: Write the failing test**

```ts
// src/app/(app)/admin/__tests__/actions.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRuleError } from "@/lib/admin/errors";

const remove = vi.fn();
vi.mock("@/lib/auth", () => ({ requireSession: async () => ({ id: 1, role: "user" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/registry", () => ({
  isResourceKey: (key: string) => key === "ingredients",
  RESOURCES: { ingredients: { singular: "Ingredient", remove: (...args: unknown[]) => remove(...args) } },
}));

import { deleteResourceAction } from "../actions";

beforeEach(() => remove.mockReset());

describe("deleteResourceAction", () => {
  it("shows a rule error's own words", async () => {
    remove.mockRejectedValue(new AdminRuleError("2 labels use this ingredient"));
    expect(await deleteResourceAction("ingredients", 5)).toEqual({ ok: false, error: "2 labels use this ingredient" });
  });

  it("reports success when nothing throws", async () => {
    remove.mockResolvedValue(undefined);
    expect(await deleteResourceAction("ingredients", 5)).toEqual({ ok: true, message: "Ingredient deleted." });
    expect(remove).toHaveBeenCalledWith(5, 1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run "src/app/(app)/admin/__tests__/actions.test.ts"`
Expected: FAIL, cannot resolve `@/lib/admin/errors`.

- [ ] **Step 3: Implement**

```ts
// src/lib/admin/errors.ts
/** A rule the user ran into, worded for them. The admin actions show the message as written. */
export class AdminRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminRuleError";
  }
}
```

In `actions.ts` add `import { AdminRuleError } from "@/lib/admin/errors";` and put this as the first line inside both `catch (error: unknown) {` blocks (in `saveResourceAction` and `deleteResourceAction`):

```ts
    if (error instanceof AdminRuleError) return { ok: false, error: error.message };
```

- [ ] **Step 4: Verify**

Run: `npx vitest run "src/app/(app)/admin" && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/errors.ts "src/app/(app)/admin"
git commit -m "Show rule errors thrown by admin save and remove

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Ingredients resource

**Files:**
- Modify: `src/lib/admin/types.ts` (`AdminRow`, line ~146)
- Modify: `src/lib/admin/registry.ts` (imports; `RESOURCE_KEYS`; new config after `cooperagesConfig` at ~1101; `RESOURCES` at ~1271)
- Modify: `src/lib/admin/nav.ts`
- Create: `src/lib/admin/__tests__/ingredients.integration.test.ts`

**Interfaces:**
- Consumes: `ingredientSchema` (Task 3), `lockFor`, `reservedNameError`, `INGREDIENT_KIND_LABELS`, `FAMILIES` (Task 2), `AdminRuleError` (Task 4).
- Produces: `RESOURCES.ingredients`; `AdminRow.locked?: { tag: string; reason: string }`.

**Acceptance Criteria:**
- The list shows this account's ingredients with Name, Kind, Family, Labels; rows carry `locked` and `deleteBlockedBy`.
- Add creates a row; a same-name-and-kind add (any case) returns a field error "Already exists."; a preset name is rejected.
- Edit changes name and family only; a different `kind` in the request is ignored.
- Another account's id cannot be edited or deleted.
- Delete throws "N labels use this ingredient" while linked, and never reports success for a row that is still there.
- A locked row rejects edit and delete on the server.

- [ ] **Step 1: Write the failing integration test (opt-in, needs the scratch database)**

```ts
// src/lib/admin/__tests__/ingredients.integration.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";
import { AdminRuleError } from "../errors";

vi.mock("server-only", () => ({}));

/** Opt-in: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("the Ingredients resource against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let stranger: number;
  let registry: typeof import("../registry");
  const res = () => registry.RESOURCES.ingredients;
  const add = (kind: string, name: string, family = "") => res().save({ kind, name, family }, null, owner);
  const idOf = async (name: string, kind = "") =>
    (await res().list(owner)).find((row) => row.cells.name === name && (kind === "" || row.cells.kind === kind))!.id;
  const link = async (ingredientId: number, isManual = true) => {
    const label = await fx.mkLabel(owner, cat.rum, `Label ${ingredientId} ${isManual}`);
    await m.sql(`INSERT INTO expression_ingredients (expression_id, ingredient_id, position, is_manual) VALUES ($1, $2, 0, $3)`, label, ingredientId, isManual);
    return label;
  };

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    owner = await fx.mkUser();
    stranger = await fx.mkUser();
    registry = await import("../registry");
  });
  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  it("adds an ingredient and lists it with its kind and no labels", async () => {
    expect((await add("rum_base", "Palm Sugar")).ok).toBe(true);
    const row = (await res().list(owner)).find((r) => r.cells.name === "Palm Sugar")!;
    expect(row.cells).toMatchObject({ kind: "Rum base", uses: 0 });
    expect(row.locked).toBeUndefined();
    expect(row.deleteBlockedBy).toBeUndefined();
  });

  it("refuses the same name and kind in any case, but allows it under another kind", async () => {
    const clash = await add("rum_base", "palm sugar");
    expect(clash).toMatchObject({ ok: false, fieldErrors: { name: "Already exists." } });
    expect((await add("flavor", "Palm Sugar")).ok).toBe(true);
  });

  it("refuses a built-in name and creates nothing", async () => {
    const result = await add("rum_base", "molasses");
    expect(result).toMatchObject({ ok: false, fieldErrors: { name: "Molasses is a built-in choice." } });
    expect((await res().list(owner)).some((r) => r.cells.name === "molasses")).toBe(false);
  });

  it("requires a family for a distillate", async () => {
    expect(await add("distillate", "Muscat")).toMatchObject({ ok: false, fieldErrors: { family: "Choose a family." } });
    expect((await add("distillate", "Muscat", "grape")).ok).toBe(true);
  });

  it("changes the name on edit but ignores a different kind", async () => {
    const id = await idOf("Palm Sugar", "Rum base");
    expect((await res().save({ kind: "gin_base", name: "Palm Sugar Syrup", family: "" }, id, owner)).ok).toBe(true);
    const row = (await res().list(owner)).find((r) => r.id === id)!;
    expect(row.cells).toMatchObject({ name: "Palm Sugar Syrup", kind: "Rum base" });
  });

  it("will not let another account edit or delete it", async () => {
    const id = await idOf("Palm Sugar Syrup");
    expect(await res().save({ kind: "rum_base", name: "Stolen", family: "" }, id, stranger)).toMatchObject({ ok: false });
    await res().remove(id, stranger);
    expect((await res().list(owner)).some((r) => r.id === id)).toBe(true);
  });

  it("blocks delete while a label uses it, and allows it once unlinked", async () => {
    await add("rum_base", "Coconut Sugar");
    const id = await idOf("Coconut Sugar");
    const label = await link(id);
    expect((await res().list(owner)).find((r) => r.id === id)!.deleteBlockedBy).toBe("1 label uses this ingredient");
    await expect(res().remove(id, owner)).rejects.toThrow(AdminRuleError);
    await expect(res().remove(id, owner)).rejects.toThrow(/1 label uses this ingredient/);
    expect((await res().list(owner)).some((r) => r.id === id)).toBe(true);
    await m.sql(`DELETE FROM expression_ingredients WHERE expression_id = $1`, label);
    await res().remove(id, owner);
    expect((await res().list(owner)).some((r) => r.id === id)).toBe(false);
  });

  it("locks a row that any label links as style-derived, on the server", async () => {
    await add("botanical", "Wormwood");
    const id = await idOf("Wormwood");
    expect((await res().list(owner)).find((r) => r.id === id)!.locked).toBeUndefined();
    await link(id, false);
    expect((await res().list(owner)).find((r) => r.id === id)!.locked?.tag).toBe("Fixed");
    expect(await res().save({ kind: "botanical", name: "Wormwood Two", family: "" }, id, owner)).toMatchObject({ ok: false });
    await expect(res().remove(id, owner)).rejects.toThrow(AdminRuleError);
  });

  it("locks a row whose name is a preset, and refuses to delete it", async () => {
    await m.sql(`INSERT INTO ingredients (owner_id, kind, name) VALUES ($1, 'rum_base', 'Honey')`, owner);
    const id = await idOf("Honey");
    expect((await res().list(owner)).find((r) => r.id === id)!.locked?.tag).toBe("Built-in");
    await expect(res().remove(id, owner)).rejects.toThrow(AdminRuleError);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `TOURNAMENT_TEST_DATABASE_URL=postgres://user:pass@localhost:5432/scratch npx vitest run src/lib/admin/__tests__/ingredients.integration.test.ts`
Expected: FAIL, `RESOURCES.ingredients` is undefined. Without the env var the file is skipped, which is not a pass: run it against a scratch database.

- [ ] **Step 3: Add `locked` to `AdminRow`**

In `src/lib/admin/types.ts`, after `deleteBlockedBy?: string;`:

```ts
  /** Cannot be edited or deleted, and why. The tag is the short word shown in the row. */
  locked?: { tag: string; reason: string };
```

- [ ] **Step 4: Register the resource**

In `src/lib/admin/registry.ts`:

1. Import `notExists` from `drizzle-orm` (add to the existing import list) and `expressionIngredients`, `ingredients`, `INGREDIENT_KINDS` from `@/db/schema`.
2. Add these imports:

```ts
import { AdminRuleError } from "./errors";
import { FAMILIES, INGREDIENT_KIND_LABELS, lockFor, reservedNameError } from "@/lib/expressions/ingredient-rules";
```

3. Add `ingredientSchema` to the `./schemas` import list.
4. Add `"ingredients"` to `RESOURCE_KEYS` after `"cooperages"`.
5. Add the config after `cooperagesConfig`:

```ts
// ------------------------------------------------------------
// Ingredients
// ------------------------------------------------------------

/** Links that exist only because an amaro style put the botanical there; a save re-adds them by name. */
const styleLinkCount = sql<number>`(select count(*)::int from expression_ingredients ei where ei.ingredient_id = ${ingredients.id} and ei.is_manual = false)`;
const labelsUsing = sql<number>`(select count(*)::int from expression_ingredients ei where ei.ingredient_id = ${ingredients.id})`;

const ingredientsConfig: ResourceConfig = {
  key: "ingredients",
  label: "Ingredients",
  singular: "Ingredient",
  description:
    "What goes into a spirit: rum and gin bases, botanicals, magueys, distillates and flavors. A name you add here is suggested in every label form for that kind.",
  columns: [
    nameColumn,
    { key: "kind", label: "Kind" },
    { key: "family", label: "Family", secondary: true },
    { key: "uses", label: "Labels", numeric: true, secondary: true },
  ],
  fields: [
    { kind: "text", name: "name", label: "Name", required: true, span: "half" },
    {
      kind: "select",
      name: "kind",
      label: "Kind",
      required: true,
      options: [
        { value: "", label: "Choose a kind" },
        ...INGREDIENT_KINDS.map((kind) => ({ value: kind, label: INGREDIENT_KIND_LABELS[kind] })),
      ],
      help: "Fixed once the ingredient exists.",
      span: "half",
    },
    {
      kind: "select",
      name: "family",
      label: "Family",
      options: [{ value: "", label: "Not set" }, ...FAMILIES.map((f) => ({ value: f, label: f[0]!.toUpperCase() + f.slice(1) }))],
      help: "Calvados takes apple or pear; Cognac and Armagnac take grape.",
      span: "half",
    },
  ],
  list: async (ownerId) => {
    const rows = await db
      .select({
        id: ingredients.id,
        name: ingredients.name,
        kind: ingredients.kind,
        family: ingredients.family,
        uses: labelsUsing,
        styleLinks: styleLinkCount,
      })
      .from(ingredients)
      .where(eq(ingredients.ownerId, ownerId))
      .orderBy(asc(ingredients.kind), asc(ingredients.name));
    return rows.map((r) => {
      const lock = lockFor(r);
      return {
        id: r.id,
        cells: { name: r.name, kind: INGREDIENT_KIND_LABELS[r.kind], family: r.family, uses: r.uses },
        values: { name: r.name, kind: r.kind, family: r.family ?? "" },
        ...(lock ? { locked: lock } : {}),
        ...(r.uses > 0 ? { deleteBlockedBy: `${r.uses} label${r.uses === 1 ? " uses" : "s use"} this ingredient` } : {}),
      };
    });
  },
  optionsFor: async () => ({}),
  save: async (raw, id, ownerId) => {
    let kind = raw.kind;
    if (id !== null) {
      const [existing] = await db
        .select({ kind: ingredients.kind, name: ingredients.name, styleLinks: styleLinkCount })
        .from(ingredients)
        .where(and(eq(ingredients.id, id), eq(ingredients.ownerId, ownerId)))
        .limit(1);
      if (!existing) return { ok: false, error: "That no longer exists." };
      const lock = lockFor(existing);
      if (lock) return { ok: false, error: lock.reason };
      // The form hides Kind on edit; a request that sends one anyway is overridden here.
      kind = existing.kind;
    }
    const parsed = ingredientSchema.safeParse({ ...raw, kind });
    if (!parsed.success) return invalid(parsed.error);
    const input = parsed.data;

    const reserved = reservedNameError(input.kind, input.name);
    if (reserved) return { ok: false, error: reserved, fieldErrors: { name: reserved } };

    const [clash] = await db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(
        and(
          eq(ingredients.ownerId, ownerId),
          eq(ingredients.kind, input.kind),
          eq(ingredients.name, input.name),
          id !== null ? ne(ingredients.id, id) : undefined,
        ),
      )
      .limit(1);
    if (clash) return { ok: false, error: "Already exists.", fieldErrors: { name: "Already exists." } };

    if (id === null) {
      const [row] = await db
        .insert(ingredients)
        .values({ ownerId, kind: input.kind, name: input.name, family: input.family })
        .returning({ id: ingredients.id });
      return { ok: true, id: row!.id };
    }
    const updated = await db
      .update(ingredients)
      .set({ name: input.name, family: input.family })
      .where(and(eq(ingredients.id, id), eq(ingredients.ownerId, ownerId)))
      .returning({ id: ingredients.id });
    return updated.length > 0 ? { ok: true, id } : { ok: false, error: "That no longer exists." };
  },
  remove: async (id, ownerId) => {
    const [row] = await db
      .select({ kind: ingredients.kind, name: ingredients.name, styleLinks: styleLinkCount, uses: labelsUsing })
      .from(ingredients)
      .where(and(eq(ingredients.id, id), eq(ingredients.ownerId, ownerId)))
      .limit(1);
    if (!row) return;
    const lock = lockFor(row);
    if (lock) throw new AdminRuleError(lock.reason);
    // One statement: a label saved between a check and a delete cannot be stripped by the cascade.
    const deleted = await db
      .delete(ingredients)
      .where(
        and(
          eq(ingredients.id, id),
          eq(ingredients.ownerId, ownerId),
          notExists(db.select({ one: sql`1` }).from(expressionIngredients).where(eq(expressionIngredients.ingredientId, id))),
        ),
      )
      .returning({ id: ingredients.id });
    if (deleted.length === 0) {
      const n = Math.max(row.uses, 1);
      throw new AdminRuleError(`${n} label${n === 1 ? " uses" : "s use"} this ingredient`);
    }
  },
};
```

6. Add `ingredients: ingredientsConfig,` to `RESOURCES` after `cooperages`.

- [ ] **Step 5: Add the nav entry**

In `src/lib/admin/nav.ts`, after the Finishes line:

```ts
  { href: "/admin/ingredients" as Route, label: "Ingredients" },
```

(Cooperages is missing from this list today. Leave it; it is unrelated.)

- [ ] **Step 6: Typecheck, then run the integration test**

Run: `npm run typecheck`, then `TOURNAMENT_TEST_DATABASE_URL=postgres://user:pass@localhost:5432/scratch npx vitest run src/lib/admin/__tests__/ingredients.integration.test.ts`
Expected: PASS. Fix any exhaustiveness error typecheck reports for `ResourceKey`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin
git commit -m "Add Ingredients to Configuration: list, add, rename, guarded delete

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Locked rows and the ingredient form

**Files:**
- Modify: `src/components/admin/resource-view.tsx` (lucide import at line 6; the actions cell at ~173)
- Modify: `src/components/admin/resource-form.tsx` (the field `.filter` chain at ~70; a note above the fields)

**Interfaces:**
- Consumes: `AdminRow.locked` (Task 5), `INGREDIENT_KIND_LABELS` (Task 2).

**Acceptance Criteria:**
- A locked row shows its tag ("Built-in" or "Fixed") instead of Edit and Delete, with the reason readable by keyboard and screen reader users.
- The ingredient form hides Kind on edit and shows it as text; Family appears only when the kind is Distillate.
- Other resources are unchanged.

- [ ] **Step 1: Locked rows in `ResourceView`**

Add `Lock` to the lucide import (line 6):

```tsx
import { ArrowDown, ArrowUp, ChevronsUpDown, Loader2, Lock, Pencil, Trash2 } from "lucide-react";
```

In the actions `TableCell`, replace the opening of the `<div className={cn("flex justify-end gap-1", readOnly && "hidden")}>` line with:

```tsx
                  <TableCell className="text-right">
                    {row.locked && !readOnly ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={row.locked.reason}>
                        <Lock className="size-3.5" aria-hidden="true" />
                        {row.locked.tag}
                        <span className="sr-only">: {row.locked.reason}</span>
                      </span>
                    ) : null}
                    <div className={cn("flex justify-end gap-1", (readOnly || row.locked) && "hidden")}>
```

(Keep the existing `<TableCell className="text-right">` opening only once: this replaces that line and the `<div ...>` line below it.)

- [ ] **Step 2: The ingredient form in `ResourceForm`**

Add the imports at the top of `resource-form.tsx`:

```tsx
import { INGREDIENT_KIND_LABELS } from "@/lib/expressions/ingredient-rules";
import type { IngredientKind } from "@/db/schema";
```

Add this filter directly after the existing distilleries `.filter(...)` and before `.map(...)`:

```tsx
          .filter((field) => {
            if (resourceKey !== "ingredients") return true;
            // Kind is chosen once; Family only means something for a distillate.
            if (field.name === "kind") return row === null;
            if (field.name === "family") return values.kind === "distillate";
            return true;
          })
```

Add this as the first child inside the grid `div`, above the mashbill grain editor comment:

```tsx
        {resourceKey === "ingredients" && row ? (
          <p className="col-span-full text-sm text-muted-foreground">
            Kind: {INGREDIENT_KIND_LABELS[String(values.kind) as IngredientKind] ?? ""}
          </p>
        ) : null}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS. Then start the dev server (use `localhost`, not `127.0.0.1`), open `/admin/ingredients` signed in, and confirm by eye: Add shows Name and Kind; picking Distillate reveals Family; a locked row shows its tag with no buttons; existing resources (Finishes, Tags) still show Edit and Delete.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin
git commit -m "Show locked ingredient rows and the kind-aware ingredient form

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The `ingredientIds` bottle filter

**Files:**
- Modify: `src/lib/bottles/filters.ts` (type ~68, defaults ~101, `parseFilters` ~189, `serialiseFilters` ~230, `activeFilterCount` ~272)
- Modify: `src/lib/bottles/grid.ts` (after the `finishIds` clause, ~143)
- Modify: `src/lib/bottles/__tests__/filters.test.ts`

**Interfaces:**
- Produces: `BottleFilters.ingredientIds: number[]`, URL parameter `ingredient`.

**Acceptance Criteria:**
- `?ingredient=3,7` parses to `[3, 7]`; junk and duplicates are dropped like the other id lists.
- It serialises back, counts as one active filter, and defaults to `[]`.
- The grid matches labels linked to any of the ids, through `expression_ingredients`.

- [ ] **Step 1: Write the failing tests** (append to `filters.test.ts`)

```ts
describe("ingredientIds", () => {
  it("reads the ingredient list and drops junk and duplicates", () => {
    expect(parse("ingredient=3,7,abc,3,-1").ingredientIds).toEqual([3, 7]);
  });

  it("defaults to none and survives a round trip", () => {
    expect(parse("").ingredientIds).toEqual([]);
    const filters: BottleFilters = { ...DEFAULT_FILTERS, ingredientIds: [4, 9] };
    expect(parse(serialiseFilters(filters)).ingredientIds).toEqual([4, 9]);
    expect(serialiseFilters(DEFAULT_FILTERS)).not.toContain("ingredient");
  });

  it("counts as one narrowing filter", () => {
    expect(activeFilterCount({ ...DEFAULT_FILTERS, ingredientIds: [1, 2] })).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/bottles/__tests__/filters.test.ts`
Expected: FAIL (property missing / undefined).

- [ ] **Step 3: Implement the filter plumbing**

In `filters.ts`:
- In the `BottleFilters` type, after `finishIds: number[];` add `ingredientIds: number[];`.
- In `DEFAULT_FILTERS`, after `finishIds: [],` add `ingredientIds: [],`.
- In `parseFilters`, after `finishIds: idList(params, "finish"),` add `ingredientIds: idList(params, "ingredient"),`.
- In `serialiseFilters`, after `ids("finish", filters.finishIds);` add `ids("ingredient", filters.ingredientIds);`.
- In `activeFilterCount`, after the `finishIds` line add `count += filters.ingredientIds.length > 0 ? 1 : 0;`.

In `grid.ts`, after the `finishIds` block:

```ts
  if (filters.ingredientIds.length > 0) {
    clauses.push(sql`EXISTS (
      SELECT 1 FROM expression_ingredients ei
       WHERE ei.expression_id = ${bottleList.expressionId}
         AND ei.ingredient_id IN (${sql.join(filters.ingredientIds.map((id) => sql`${id}`), sql`, `)})
    )`);
  }
```

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/bottles && npm run typecheck`
Expected: PASS. Typecheck lists any other place that builds a full `BottleFilters` literal; add `ingredientIds: []` there (the filter-bar `IdKey` union does not need it).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bottles
git commit -m "Add an ingredient filter to the bottle grid query

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The ingredient page, with "Also used as"

**Files:**
- Modify: `src/lib/entities/queries.ts` (imports; add after `getFinish`)
- Modify: `src/components/entities/entity-page.tsx` (new `extra` prop)
- Create: `src/app/(app)/ingredients/[id]/page.tsx`
- Create: `src/lib/entities/__tests__/ingredients.integration.test.ts`

**Interfaces:**
- Consumes: `ingredientIds` filter (Task 7), `INGREDIENT_KIND_LABELS` (Task 2).
- Produces: `getIngredient(id: number, ownerId: number)`, `getAlsoUsedAs(row: { id: number; name: string }, ownerId: number)` returning `Array<{ id: number; kind: IngredientKind; bottles: number }>`.

**Acceptance Criteria:**
- `/ingredients/[id]` shows the name, a kind badge, a family badge for distillates, an "Also used as" line, and the bottles via `EntityPage` with `preset={{ ingredientIds: [id] }}`.
- Another account's id, a non-integer id and a missing id are all 404.
- "Also used as" lists only this account's same-name rows of other kinds, with bottle counts.
- The grid with `ingredientIds` returns only bottles whose label links the ingredient.

- [ ] **Step 1: Write the failing integration test (opt-in)**

```ts
// src/lib/entities/__tests__/ingredients.integration.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";
import { DEFAULT_FILTERS } from "@/lib/bottles/filters";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ requireSession: async () => ({ id: 0 }) }));

/** Opt-in: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("ingredient pages against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let stranger: number;
  let queries: typeof import("../queries");
  let grid: typeof import("@/lib/bottles/grid");
  const mkIngredient = async (user: number, kind: string, name: string) =>
    (await m.sql<{ id: number }>(`INSERT INTO ingredients (owner_id, kind, name) VALUES ($1, $2, $3) RETURNING id`, user, kind, name))[0]!.id;
  const linkLabel = async (user: number, ingredient: number, name: string) => {
    const label = await fx.mkLabel(user, cat.rum, name);
    await m.sql(`INSERT INTO expression_ingredients (expression_id, ingredient_id, position, is_manual) VALUES ($1, $2, 0, true)`, label, ingredient);
    return label;
  };

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    owner = await fx.mkUser();
    stranger = await fx.mkUser();
    queries = await import("../queries");
    grid = await import("@/lib/bottles/grid");
  });
  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  it("finds the ingredient for its owner and for nobody else", async () => {
    const id = await mkIngredient(owner, "rum_base", "Palm Sugar");
    expect(await queries.getIngredient(id, owner)).toMatchObject({ id, name: "Palm Sugar", kind: "rum_base" });
    expect(await queries.getIngredient(id, stranger)).toBeNull();
  });

  it("lists same-name rows of other kinds with bottle counts, and never another account's", async () => {
    const rum = await mkIngredient(owner, "rum_base", "Wheatish");
    const vodka = await mkIngredient(owner, "vodka_base", "Wheatish");
    const theirs = await mkIngredient(stranger, "gin_base", "Wheatish");
    await fx.mkBottle(owner, await linkLabel(owner, vodka, "Vodka label"));
    await fx.mkBottle(owner, await linkLabel(owner, vodka, "Vodka label two"));
    await linkLabel(stranger, theirs, "Their label");
    const also = await queries.getAlsoUsedAs({ id: rum, name: "Wheatish" }, owner);
    expect(also).toEqual([{ id: vodka, kind: "vodka_base", bottles: 2 }]);
  });

  it("filters the grid to bottles whose label links the ingredient", async () => {
    const a = await mkIngredient(owner, "rum_base", "Filter A");
    const b = await mkIngredient(owner, "rum_base", "Filter B");
    await fx.mkBottle(owner, await linkLabel(owner, a, "Filter label A"));
    await fx.mkBottle(owner, await linkLabel(owner, b, "Filter label B"));
    // If every count here is 0, check that a new bottle's default status is in DEFAULT_STATUSES.
    expect((await grid.queryBottles({ ...DEFAULT_FILTERS, ingredientIds: [a] }, owner)).total).toBe(1);
    expect((await grid.queryBottles({ ...DEFAULT_FILTERS, ingredientIds: [a, b] }, owner)).total).toBe(2);
    expect((await grid.queryBottles({ ...DEFAULT_FILTERS, ingredientIds: [a] }, stranger)).total).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `TOURNAMENT_TEST_DATABASE_URL=postgres://user:pass@localhost:5432/scratch npx vitest run src/lib/entities/__tests__/ingredients.integration.test.ts`
Expected: FAIL, `getIngredient` is not a function.

- [ ] **Step 3: Add the queries**

In `src/lib/entities/queries.ts`: change the drizzle import to `import { and, asc, eq, ne, sql } from "drizzle-orm";`, add `ingredients` and `type IngredientKind` to the `@/db/schema` import, and add after `getFinish`:

```ts
export async function getIngredient(id: number, ownerId: number) {
  const [row] = await db
    .select({ id: ingredients.id, name: ingredients.name, kind: ingredients.kind, family: ingredients.family })
    .from(ingredients)
    .where(and(eq(ingredients.id, id), eq(ingredients.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

/**
 * The same name under other kinds (Wheat is a gin base and a vodka base), so a click on one can reach
 * the other. Scoped by owner twice: the rows themselves and the bottles counted under them.
 */
export async function getAlsoUsedAs(row: { id: number; name: string }, ownerId: number) {
  return db
    .select({
      id: ingredients.id,
      kind: ingredients.kind,
      bottles: sql<number>`(select count(distinct b.id)::int from bottles b join expression_ingredients ei on ei.expression_id = b.expression_id where ei.ingredient_id = ${ingredients.id} and b.owner_id = ${ownerId})`,
    })
    .from(ingredients)
    .where(and(eq(ingredients.ownerId, ownerId), eq(ingredients.name, row.name), ne(ingredients.id, row.id)))
    .orderBy(asc(ingredients.kind));
}
```

(`IngredientKind` is only needed if you annotate a return type; omit the import if unused.)

- [ ] **Step 4: Give `EntityPage` an `extra` slot**

In `entity-page.tsx` add `extra,` to the destructured props, `extra?: React.ReactNode;` to the prop types (after `badges`), and render it right after the badges block:

```tsx
        {badges ? <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div> : null}
        {extra}
```

- [ ] **Step 5: Create the page**

```tsx
// src/app/(app)/ingredients/[id]/page.tsx
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EntityPage } from "@/components/entities/entity-page";
import { requireSession } from "@/lib/auth";
import { getAlsoUsedAs, getIngredient } from "@/lib/entities/queries";
import { INGREDIENT_KIND_LABELS } from "@/lib/expressions/ingredient-rules";
import { humanise } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const [{ id }, user] = await Promise.all([params, requireSession()]);
  const row = Number.isInteger(Number(id)) ? await getIngredient(Number(id), user.id) : null;
  return { title: row?.name ?? "Ingredient" };
}

export default async function IngredientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, requireSession()]);
  const ingredientId = Number(id);
  if (!Number.isInteger(ingredientId) || ingredientId <= 0) notFound();

  const row = await getIngredient(ingredientId, user.id);
  if (!row) notFound();
  const also = await getAlsoUsedAs(row, user.id);

  return (
    <EntityPage
      kind="Ingredient"
      name={row.name}
      badges={
        <>
          <Badge>{INGREDIENT_KIND_LABELS[row.kind]}</Badge>
          {row.family ? <Badge>{humanise(row.family)}</Badge> : null}
        </>
      }
      extra={
        also.length > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Also used as{" "}
            {also.map((item, index) => (
              <Fragment key={item.id}>
                {index > 0 ? " · " : null}
                <Link href={`/ingredients/${item.id}` as Route} className="text-primary underline-offset-2 hover:underline">
                  {INGREDIENT_KIND_LABELS[item.kind]}
                </Link>{" "}
                ({item.bottles} {item.bottles === 1 ? "bottle" : "bottles"})
              </Fragment>
            ))}
          </p>
        ) : null
      }
      preset={{ ingredientIds: [ingredientId] }}
      searchParams={query}
      emptyMessage="No bottles on the shelf use this yet."
    />
  );
}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint`, then the integration test with the env var as in Step 2.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/entities src/components/entities "src/app/(app)/ingredients"
git commit -m "Add the ingredient page with an Also used as line

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Chips link to the page

**Files:**
- Modify: `src/app/(app)/expressions/[id]/page.tsx` (ingredient chips, lines ~253-261)
- Modify: `src/app/(app)/bottles/[id]/page.tsx` (ingredient chips, lines ~329-337)

**Interfaces:**
- Consumes: `ingredientHref` (Task 2).

**Acceptance Criteria:**
- Every ingredient chip on both pages links to `/ingredients/[id]`. The distillery, mashbill and finish chips are unchanged.

- [ ] **Step 1: Confirm the target set**

Run: `grep -rn "hrefFor={() => null}" src`
Expected: only the lines in these two files, all ingredient chips. If anything else matches, leave it alone.

- [ ] **Step 2: Replace them**

In each of the two files add `import { ingredientHref } from "@/lib/expressions/ingredient-rules";` and replace every `hrefFor={() => null}` with `hrefFor={ingredientHref}` (an Edit with `replace_all`).

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS. If `item.id` is not typed on `links.ingredients` for either page, the type in `src/lib/expressions/queries.ts:64` already carries `id`; the other `LabelLinks` type at line ~327 is for the catalog and is not used here.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/expressions" "src/app/(app)/bottles"
git commit -m "Link ingredient chips to the ingredient page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Ingredients API takes all eight kinds

**Files:**
- Modify: `src/app/api/v1/ingredients/route.ts`
- Create: `src/app/api/v1/ingredients/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `isIngredientKind` (Task 2).

**Acceptance Criteria:**
- All eight kinds return 200 with `{ ingredients: [...] }`; an unknown or missing kind returns 422; signed out returns 401.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/v1/ingredients/__tests__/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.fn();
const rows = [{ name: "Wheat", family: null, kind: "vodka_base" }];
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => rows }) }) }) } }));

import { GET } from "../route";

const get = (query: string) => GET(new NextRequest(`https://rickhouse.example.com/api/v1/ingredients${query}`));
const KINDS = ["maguey", "distillate", "rum_base", "botanical", "gin_base", "vodka_base", "flavor", "liqueur_base"];

beforeEach(() => {
  getCurrentUser.mockReset();
  getCurrentUser.mockResolvedValue({ id: 7 });
});

describe("GET /api/v1/ingredients", () => {
  it.each(KINDS)("answers 200 for %s", async (kind) => {
    const res = await get(`?kind=${kind}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ingredients: rows });
  });

  it("answers 422 for an unknown or missing kind", async () => {
    expect((await get("?kind=whiskey_base")).status).toBe(422);
    expect((await get("")).status).toBe(422);
  });

  it("answers 401 when signed out", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await get("?kind=flavor")).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/api/v1/ingredients`
Expected: FAIL for `vodka_base`, `flavor` and `liqueur_base` (422 instead of 200).

- [ ] **Step 3: Fix the route**

Replace the long `kind !== ... ` condition and the cast:

```ts
import { isIngredientKind } from "@/lib/expressions/ingredient-rules";
// ...
  const kind = request.nextUrl.searchParams.get("kind");
  if (!isIngredientKind(kind)) return apiError(422, "invalid", "Choose an ingredient kind.");
  const rows = await db.select({ name: ingredients.name, family: ingredients.family, kind: ingredients.kind })
    .from(ingredients)
    .where(and(eq(ingredients.ownerId, user.id), eq(ingredients.kind, kind)))
    .orderBy(asc(ingredients.name));
```

Remove the now-unused `type IngredientKind` import.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/app/api/v1/ingredients && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/ingredients
git commit -m "Let the ingredients API list all eight kinds

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Phase 1 end-to-end

**Files:**
- Create: `e2e/ingredients.spec.ts`

**Acceptance Criteria:**
- Add an ingredient in Configuration, find it in a rum label's Base picker, save the label, follow the chip to the ingredient page, and see delete blocked while the label uses it.

- [ ] **Step 1: Write the spec**

```ts
// e2e/ingredients.spec.ts
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { resetDatabase } from "./support/db";
import { openNewLabelForm } from "./support/new-label";

const stamp = () => Math.random().toString(36).slice(2, 8);

test.beforeAll(resetDatabase);
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

const EXISTING_OPTION = '[cmdk-item]:not([data-value="__create__"])';
async function pick(page: Page, comboboxLabel: string, search: string) {
  await page.getByRole("combobox", { name: comboboxLabel }).click();
  await page.locator("[cmdk-input]").fill(search);
  await page.locator(EXISTING_OPTION).filter({ has: page.getByText(search, { exact: true }) }).first().click();
}

async function addIngredient(page: Page, kind: string, name: string) {
  await page.goto("/admin/ingredients");
  await page.getByRole("button", { name: "Add ingredient" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Kind").selectOption(kind);
  await page.getByRole("button", { name: "Add ingredient" }).last().click();
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
}

test("an ingredient added in Configuration is offered on a rum label and its chip opens a page", async ({ page }) => {
  const base = `Palm Sugar ${stamp()}`;
  await addIngredient(page, "rum_base", base);
  await expect(page.getByRole("row").filter({ hasText: base })).toContainText("Rum base");

  await openNewLabelForm(page);
  await pick(page, "Brand", "Pursuit Spirits");
  await pick(page, "Category", "Rum");
  await page.getByLabel("Label Name").fill(`Palm Rum ${stamp()}`);
  // If the suggestion is not a button, match the markup in ingredient-picker.tsx instead.
  await page.getByRole("group", { name: "Base" }).getByRole("button", { name: base }).click();
  await page.getByRole("button", { name: "Create Label", exact: true }).click();
  await expect(page).toHaveURL(/\/expressions\/\d+$/);

  await page.getByRole("link", { name: base }).click();
  await expect(page).toHaveURL(/\/ingredients\/\d+$/);
  await expect(page.getByRole("heading", { name: base })).toBeVisible();
  await expect(page.getByText("Rum base", { exact: true })).toBeVisible();

  // Now in use, so Configuration will not let it go.
  await page.goto("/admin/ingredients");
  await page.getByRole("button", { name: `Delete ${base}` }).click();
  await expect(page.getByText(/1 label uses this ingredient/)).toBeVisible();
});

test("a built-in name is refused", async ({ page }) => {
  await page.goto("/admin/ingredients");
  await page.getByRole("button", { name: "Add ingredient" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("Molasses");
  await page.getByLabel("Kind").selectOption("rum_base");
  await page.getByRole("button", { name: "Add ingredient" }).last().click();
  await expect(page.getByText("Molasses is a built-in choice.").first()).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/ingredients.spec.ts`
Expected: PASS. Fix selectors against the real markup if a locator misses; do not weaken an assertion to make it pass.

- [ ] **Step 3: Full checks, then commit and open the PR**

```bash
npm run typecheck && npm run lint && npx vitest run
git add e2e/ingredients.spec.ts
git commit -m "Add the ingredients end-to-end spec

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Open Phase 1 as a PR from `claude/ingredients-config-phase-1`. Check the PR template under `.github/` first. Regression-check by hand that Finishes, Tags and Categories still list, add, edit and delete.

---

# Phase 2: unused built-ins and Merge (PR 2)

Branch `claude/ingredients-config-phase-2` from `origin/main` after Phase 1 merges (re-run the Task 0 preflight). Phase 2 changes the shared `ResourceView`, so Task 16 includes a regression pass over the other nine resources.

### Task 12: Unused built-ins section

**Files:**
- Modify: `src/lib/expressions/ingredient-rules.ts`, `__tests__/ingredient-rules.test.ts`
- Create: `src/components/admin/unused-built-ins.tsx`
- Modify: `src/components/admin/resource-view.tsx` (new `footer` prop)
- Modify: `src/app/(app)/admin/[resource]/page.tsx`

**Interfaces:**
- Produces: `unusedPresets(used: Array<{ kind: IngredientKind; name: string }>): Array<{ kind: IngredientKind; label: string; names: string[] }>`; `ResourceView` prop `footer?: React.ReactNode`.

**Acceptance Criteria:**
- Presets with no row appear under the table, grouped by kind, as plain read-only text. Presets that have a row do not.
- The Configuration card count is unchanged: it counts real rows only.

- [ ] **Step 1: Failing test** (append to `ingredient-rules.test.ts`; add `unusedPresets` to the import)

```ts
describe("unusedPresets", () => {
  it("lists presets that have no row, grouped by kind, in a stable order", () => {
    const groups = unusedPresets([{ kind: "rum_base", name: "molasses" }]);
    const rum = groups.find((g) => g.kind === "rum_base")!;
    expect(rum.label).toBe("Rum base");
    expect(rum.names).toEqual(["Sugarcane", "Honey"]);
    expect(groups.map((g) => g.kind)).toEqual(["rum_base", "gin_base", "botanical", "vodka_base", "maguey"]);
  });

  it("drops a kind once every preset has a row", () => {
    const groups = unusedPresets([{ kind: "maguey", name: "Blue Weber" }]);
    expect(groups.some((g) => g.kind === "maguey")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, see it fail, implement**

Run: `npx vitest run src/lib/expressions/__tests__/ingredient-rules.test.ts` (FAIL). Then change the presets import in `ingredient-rules.ts` to `import { INGREDIENT_PRESETS, isPreset, presetFor } from "./ingredient-presets";` and add:

```ts
const PRESET_ORDER: IngredientKind[] = ["rum_base", "gin_base", "botanical", "vodka_base", "maguey"];

/** Presets nobody has a row for yet, for the read-only list under the Ingredients table. */
export function unusedPresets(
  used: Array<{ kind: IngredientKind; name: string }>,
): Array<{ kind: IngredientKind; label: string; names: string[] }> {
  const have = new Set(used.map((u) => `${u.kind}:${u.name.toLocaleLowerCase()}`));
  return PRESET_ORDER.flatMap((kind) => {
    const names = (INGREDIENT_PRESETS[kind] ?? []).filter((name) => !have.has(`${kind}:${name.toLocaleLowerCase()}`));
    return names.length > 0 ? [{ kind, label: INGREDIENT_KIND_LABELS[kind], names: [...names] }] : [];
  });
}
```

Run again: PASS.

- [ ] **Step 3: The component and the slot**

```tsx
// src/components/admin/unused-built-ins.tsx
import { unusedPresets } from "@/lib/expressions/ingredient-rules";
import type { AdminRow } from "@/lib/admin/types";
import type { IngredientKind } from "@/db/schema";

/** The shipped choices nobody has used yet. Read-only: they are part of the app, not rows. */
export function UnusedBuiltIns({ rows }: { rows: AdminRow[] }) {
  const groups = unusedPresets(rows.map((row) => ({ kind: row.values.kind as IngredientKind, name: String(row.values.name ?? "") })));
  if (groups.length === 0) return null;
  return (
    <section className="mt-8 border-t border-border pt-6" aria-labelledby="built-ins-heading">
      <h2 id="built-ins-heading" className="text-lg">Built-in choices not used yet</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        These come with the app and are offered in label forms. They appear in the table above once a label uses them.
      </p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.kind}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{group.label}</dt>
            <dd className="text-sm">{group.names.join(" · ")}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

In `resource-view.tsx` add `footer?: React.ReactNode;` to the props type, destructure `footer`, and render `{footer}` as the last child of the outermost element `ResourceView` returns (after the two `Dialog`s).

In `src/app/(app)/admin/[resource]/page.tsx` import `UnusedBuiltIns` and pass:

```tsx
      footer={resource === "ingredients" ? <UnusedBuiltIns rows={rows} /> : undefined}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm run lint && npx vitest run src/lib/expressions`, then open `/admin/ingredients` and confirm the section lists presets and shrinks when a label uses one.

```bash
git add src
git commit -m "List unused built-in ingredient choices under the table

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Merge targets and tokens (pure)

**Files:**
- Modify: `src/lib/expressions/ingredient-rules.ts`, `__tests__/ingredient-rules.test.ts`

**Interfaces:**
- Produces: `type MergeToken = { id: number } | { preset: string }`, `type MergeTarget = { token: string; name: string; note: string | null }`, `parseMergeToken(token: string): MergeToken | null`, `mergeTargets(loser, rows): MergeTarget[]`.

**Acceptance Criteria:**
- Targets are the other rows of the same kind (same family for distillates), plus presets of that kind that have no row, never the loser itself, sorted by name; built-ins carry the note "Built-in".
- `parseMergeToken` accepts `id:12` and `preset:Sugarcane` and rejects everything else.

- [ ] **Step 1: Failing tests** (append; import `mergeTargets, parseMergeToken`)

```ts
describe("parseMergeToken", () => {
  it("reads ids and presets and rejects the rest", () => {
    expect(parseMergeToken("id:12")).toEqual({ id: 12 });
    expect(parseMergeToken("preset:Sugarcane")).toEqual({ preset: "Sugarcane" });
    for (const bad of ["", "id:", "id:0", "id:1.5", "id:abc", "preset:", "other:3", "12"]) expect(parseMergeToken(bad)).toBeNull();
  });
});

describe("mergeTargets", () => {
  const rows = [
    { id: 1, kind: "rum_base" as const, name: "Sugar cane", family: null },
    { id: 2, kind: "rum_base" as const, name: "Molasses", family: null },
    { id: 3, kind: "gin_base" as const, name: "Corn", family: null },
  ];

  it("offers same-kind rows and unused presets, never the loser or other kinds", () => {
    const targets = mergeTargets({ id: 1, kind: "rum_base", family: null }, rows);
    expect(targets.map((t) => t.name)).toEqual(["Honey", "Molasses", "Sugarcane"]);
    expect(targets.find((t) => t.name === "Molasses")).toEqual({ token: "id:2", name: "Molasses", note: "Built-in" });
    expect(targets.find((t) => t.name === "Honey")).toEqual({ token: "preset:Honey", name: "Honey", note: "Built-in" });
  });

  it("limits a distillate to the same family", () => {
    const distillates = [
      { id: 10, kind: "distillate" as const, name: "Muscat", family: "grape" },
      { id: 11, kind: "distillate" as const, name: "Ugni Blanc", family: "grape" },
      { id: 12, kind: "distillate" as const, name: "Perry Pear", family: "pear" },
    ];
    const targets = mergeTargets({ id: 10, kind: "distillate", family: "grape" }, distillates);
    expect(targets.map((t) => t.name)).toEqual(["Ugni Blanc"]);
  });
});
```

- [ ] **Step 2: Run, see it fail, implement**

Add to `ingredient-rules.ts`:

```ts
export type MergeToken = { id: number } | { preset: string };
export type MergeTarget = { token: string; name: string; note: string | null };

export function parseMergeToken(token: string): MergeToken | null {
  const [type, ...rest] = token.split(":");
  const value = rest.join(":");
  if (type === "id") {
    const id = Number(value);
    return value !== "" && Number.isInteger(id) && id > 0 ? { id } : null;
  }
  if (type === "preset" && value.trim() !== "") return { preset: value };
  return null;
}

/** Where a row can be merged to: its own kind (and family, for distillates), plus presets that have no row yet. */
export function mergeTargets(
  loser: { id: number; kind: IngredientKind; family: string | null },
  rows: Array<{ id: number; kind: IngredientKind; name: string; family: string | null }>,
): MergeTarget[] {
  const sameKind = rows.filter((row) => row.kind === loser.kind);
  const have = new Set(sameKind.map((row) => row.name.toLocaleLowerCase()));
  const targets: MergeTarget[] = sameKind
    .filter((row) => row.id !== loser.id && (loser.kind !== "distillate" || row.family === loser.family))
    .map((row) => ({ token: `id:${row.id}`, name: row.name, note: isPreset(row.kind, row.name) ? "Built-in" : null }));
  for (const name of INGREDIENT_PRESETS[loser.kind] ?? []) {
    if (!have.has(name.toLocaleLowerCase())) targets.push({ token: `preset:${name}`, name, note: "Built-in" });
  }
  return targets.sort((a, b) => a.name.localeCompare(b.name));
}
```

Run: `npx vitest run src/lib/expressions/__tests__/ingredient-rules.test.ts` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/expressions
git commit -m "Add pure merge target and token rules

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: The merge transaction

**Files:**
- Create: `src/lib/ingredients/merge.ts`
- Create: `src/lib/ingredients/__tests__/merge.integration.test.ts`

**Interfaces:**
- Consumes: `mergeTargets`, `lockFor`, `MergeToken` (Tasks 2, 13), `presetFor` (Task 1), `AdminRuleError` (Task 4).
- Produces: `mergeIngredient(ownerId: number, loserId: number, token: MergeToken): Promise<{ targetId: number; targetName: string; labels: number }>`, `listMergeTargets(ownerId: number, loserId: number): Promise<MergeTarget[]>`.

**Acceptance Criteria:**
- One transaction: loser and target locked `FOR UPDATE`, both scoped by `ownerId`.
- Labels move to the target keeping their order; a label linking both ends with one link whose `is_manual` is true if either was manual; the label's links are renumbered `0..n-1`; the loser row is deleted.
- Refused with a plain-language `AdminRuleError`: other kind, different distillate family, itself, another account's row, a locked loser, an unknown preset, a loser that no longer exists.
- An unused preset target is created inside the transaction.

- [ ] **Step 1: Write the failing integration test (opt-in)**

```ts
// src/lib/ingredients/__tests__/merge.integration.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";
import { AdminRuleError } from "@/lib/admin/errors";

vi.mock("server-only", () => ({}));

/** Opt-in: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("merging ingredients against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let stranger: number;
  let merge: typeof import("../merge");
  const ing = async (user: number, kind: string, name: string, family: string | null = null) =>
    (await m.sql<{ id: number }>(`INSERT INTO ingredients (owner_id, kind, name, family) VALUES ($1, $2, $3, $4) RETURNING id`, user, kind, name, family))[0]!.id;
  const label = (user: number, name: string) => fx.mkLabel(user, cat.rum, name);
  const link = (labelId: number, ingredientId: number, position: number, isManual = true) =>
    m.sql(`INSERT INTO expression_ingredients (expression_id, ingredient_id, position, is_manual) VALUES ($1, $2, $3, $4)`, labelId, ingredientId, position, isManual);
  const links = (labelId: number) =>
    m.sql<{ ingredient_id: number; position: number; is_manual: boolean }>(`SELECT ingredient_id, position, is_manual FROM expression_ingredients WHERE expression_id = $1 ORDER BY position`, labelId);
  const exists = async (id: number) => (await m.sql(`SELECT 1 FROM ingredients WHERE id = $1`, id)).length === 1;

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    owner = await fx.mkUser();
    stranger = await fx.mkUser();
    merge = await import("../merge");
  });
  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  it("moves labels to the target, keeps their order and deletes the loser", async () => {
    const loser = await ing(owner, "botanical", "Sugar cane x1");
    const target = await ing(owner, "botanical", "Sugarcane x1");
    const other = await ing(owner, "botanical", "Other x1");
    const a = await label(owner, "A");
    await link(a, other, 0);
    await link(a, loser, 1);
    const result = await merge.mergeIngredient(owner, loser, { id: target });
    expect(result).toMatchObject({ targetId: target, labels: 1 });
    expect(await links(a)).toEqual([
      { ingredient_id: other, position: 0, is_manual: true },
      { ingredient_id: target, position: 1, is_manual: true },
    ]);
    expect(await exists(loser)).toBe(false);
  });

  it("leaves one link when a label had both, manual if either was, and closes the gap", async () => {
    const loser = await ing(owner, "gin_base", "Dup loser x2");
    const target = await ing(owner, "gin_base", "Dup target x2");
    const tail = await ing(owner, "gin_base", "Tail x2");
    const a = await label(owner, "Both");
    await link(a, target, 0, false);
    await link(a, loser, 1, true);
    await link(a, tail, 2);
    await merge.mergeIngredient(owner, loser, { id: target });
    expect(await links(a)).toEqual([
      { ingredient_id: target, position: 0, is_manual: true },
      { ingredient_id: tail, position: 1, is_manual: true },
    ]);
  });

  it("creates an unused built-in as the target", async () => {
    const loser = await ing(owner, "rum_base", "Honey x3");
    const a = await label(owner, "Preset target");
    await link(a, loser, 0);
    const { targetId, targetName } = await merge.mergeIngredient(owner, loser, { preset: "Sugarcane" });
    expect(targetName).toBe("Sugarcane");
    expect((await links(a))[0]!.ingredient_id).toBe(targetId);
  });

  it("refuses other kinds, other families, itself, other accounts, locked rows and unknown presets", async () => {
    const rum = await ing(owner, "rum_base", "Refuse rum");
    const gin = await ing(owner, "gin_base", "Refuse gin");
    const grape = await ing(owner, "distillate", "Refuse grape", "grape");
    const pear = await ing(owner, "distillate", "Refuse pear", "pear");
    const theirs = await ing(stranger, "rum_base", "Refuse theirs");
    const locked = await ing(owner, "botanical", "Juniper");
    const rejects = (promise: Promise<unknown>, text: RegExp) => expect(promise).rejects.toThrow(text);
    await rejects(merge.mergeIngredient(owner, rum, { id: gin }), /same kind/);
    await rejects(merge.mergeIngredient(owner, grape, { id: pear }), /same family/);
    await rejects(merge.mergeIngredient(owner, rum, { id: rum }), /different ingredient/);
    await rejects(merge.mergeIngredient(owner, rum, { id: theirs }), /no longer exists/);
    await rejects(merge.mergeIngredient(owner, theirs, { id: rum }), /no longer exists/);
    await rejects(merge.mergeIngredient(owner, locked, { id: gin }), /can't be renamed or deleted/);
    await rejects(merge.mergeIngredient(owner, rum, { preset: "Not A Preset" }), /not a built-in/);
    await expect(merge.mergeIngredient(owner, rum, { id: gin })).rejects.toBeInstanceOf(AdminRuleError);
    expect(await exists(rum)).toBe(true);
  });

  it("offers targets of the same kind only, from this account", async () => {
    const loser = await ing(owner, "vodka_base", "Targets loser");
    await ing(owner, "vodka_base", "Targets mine");
    await ing(stranger, "vodka_base", "Targets theirs");
    const names = (await merge.listMergeTargets(owner, loser)).map((t) => t.name);
    expect(names).toContain("Targets mine");
    expect(names).not.toContain("Targets theirs");
    expect(names).not.toContain("Targets loser");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `TOURNAMENT_TEST_DATABASE_URL=postgres://user:pass@localhost:5432/scratch npx vitest run src/lib/ingredients`
Expected: FAIL, cannot resolve `../merge`.

- [ ] **Step 3: Implement**

```ts
// src/lib/ingredients/merge.ts
import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { expressionIngredients, ingredients } from "@/db/schema";
import { AdminRuleError } from "@/lib/admin/errors";
import { presetFor } from "@/lib/expressions/ingredient-presets";
import { lockFor, mergeTargets, type MergeTarget, type MergeToken } from "@/lib/expressions/ingredient-rules";

const styleLinks = sql<number>`(select count(*)::int from expression_ingredients ei where ei.ingredient_id = ${ingredients.id} and ei.is_manual = false)`;

export async function listMergeTargets(ownerId: number, loserId: number): Promise<MergeTarget[]> {
  const rows = await db
    .select({ id: ingredients.id, kind: ingredients.kind, name: ingredients.name, family: ingredients.family })
    .from(ingredients)
    .where(eq(ingredients.ownerId, ownerId))
    .orderBy(asc(ingredients.name));
  const loser = rows.find((row) => row.id === loserId);
  return loser ? mergeTargets(loser, rows) : [];
}

/**
 * Folds one ingredient into another and deletes it. Irreversible, so everything happens in one
 * transaction with both rows locked, and every read is scoped to the owner.
 */
export async function mergeIngredient(
  ownerId: number,
  loserId: number,
  token: MergeToken,
): Promise<{ targetId: number; targetName: string; labels: number }> {
  return db.transaction(async (tx) => {
    const own = (id: number) => and(eq(ingredients.id, id), eq(ingredients.ownerId, ownerId));
    const columns = { id: ingredients.id, kind: ingredients.kind, name: ingredients.name, family: ingredients.family };

    const [loser] = await tx.select({ ...columns, styleLinks }).from(ingredients).where(own(loserId)).for("update");
    if (!loser) throw new AdminRuleError("That ingredient no longer exists. Refresh and try again.");
    const lock = lockFor(loser);
    if (lock) throw new AdminRuleError(lock.reason);

    let target: { id: number; name: string };
    if ("id" in token) {
      if (token.id === loserId) throw new AdminRuleError("Choose a different ingredient to merge into.");
      const [row] = await tx.select(columns).from(ingredients).where(own(token.id)).for("update");
      if (!row) throw new AdminRuleError("That ingredient no longer exists. Refresh and try again.");
      if (row.kind !== loser.kind) throw new AdminRuleError("Only ingredients of the same kind can be merged.");
      if (loser.kind === "distillate" && row.family !== loser.family) {
        throw new AdminRuleError("Distillates can only be merged into the same family.");
      }
      target = row;
    } else {
      const name = presetFor(loser.kind, token.preset);
      if (!name) throw new AdminRuleError("That is not a built-in choice for this kind.");
      await tx.insert(ingredients).values({ ownerId, kind: loser.kind, name }).onConflictDoNothing();
      const [row] = await tx
        .select(columns)
        .from(ingredients)
        .where(and(eq(ingredients.ownerId, ownerId), eq(ingredients.kind, loser.kind), eq(ingredients.name, name)))
        .for("update");
      target = row!;
    }

    const affected = (
      await tx.select({ id: expressionIngredients.expressionId }).from(expressionIngredients).where(eq(expressionIngredients.ingredientId, loserId))
    ).map((row) => row.id);

    // A label that links both keeps the target's link, manual if either was; the loser's duplicate goes.
    await tx.execute(sql`UPDATE expression_ingredients t SET is_manual = t.is_manual OR l.is_manual
      FROM expression_ingredients l
      WHERE t.ingredient_id = ${target.id} AND l.ingredient_id = ${loserId} AND t.expression_id = l.expression_id`);
    await tx.execute(sql`DELETE FROM expression_ingredients l
      WHERE l.ingredient_id = ${loserId}
        AND EXISTS (SELECT 1 FROM expression_ingredients t WHERE t.ingredient_id = ${target.id} AND t.expression_id = l.expression_id)`);
    await tx.execute(sql`UPDATE expression_ingredients SET ingredient_id = ${target.id} WHERE ingredient_id = ${loserId}`);

    // A label's ingredients share one position sequence (gin keeps botanicals and bases together), so close the gaps across all of them.
    if (affected.length > 0) {
      await tx.execute(sql`UPDATE expression_ingredients ei SET position = r.n
        FROM (SELECT expression_id, ingredient_id,
                     row_number() OVER (PARTITION BY expression_id ORDER BY position, ingredient_id) - 1 AS n
                FROM expression_ingredients
               WHERE expression_id IN (${sql.join(affected.map((id) => sql`${id}`), sql`, `)})) r
        WHERE ei.expression_id = r.expression_id AND ei.ingredient_id = r.ingredient_id`);
    }

    await tx.delete(ingredients).where(own(loserId));
    return { targetId: target.id, targetName: target.name, labels: affected.length };
  });
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`, then the integration test as in Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingredients
git commit -m "Add the ingredient merge transaction

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Merge actions and dialog

**Files:**
- Create: `src/app/(app)/admin/ingredients-actions.ts`
- Create: `src/components/admin/merge-dialog.tsx`
- Modify: `src/components/admin/resource-view.tsx` (new `merge` prop, button, state)
- Modify: `src/app/(app)/admin/[resource]/page.tsx`
- Create: `src/app/(app)/admin/__tests__/ingredients-actions.test.ts`

**Interfaces:**
- Consumes: `mergeIngredient`, `listMergeTargets` (Task 14), `parseMergeToken` (Task 13), `AdminRuleError`.
- Produces: `mergeTargetsAction(loserId: number): Promise<MergeTarget[]>`, `mergeIngredientAction(loserId: number, token: string): Promise<ActionResult>`; `ResourceView` prop `merge?: { targets: typeof mergeTargetsAction; run: typeof mergeIngredientAction }`.

**Acceptance Criteria:**
- Both actions call `requireSession()` and pass only the session's id as owner.
- A bad token or id is rejected before touching the database. A rule error shows its own words; any other failure shows "Something changed while saving. Try again."
- Success revalidates Configuration, label pages and the collection.
- Each non-locked ingredient row has a Merge button; the dialog states the effect and the label count and requires a click on Merge.

- [ ] **Step 1: Write the failing action test**

```ts
// src/app/(app)/admin/__tests__/ingredients-actions.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRuleError } from "@/lib/admin/errors";

const mergeIngredient = vi.fn();
const listMergeTargets = vi.fn();
vi.mock("@/lib/auth", () => ({ requireSession: async () => ({ id: 9 }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ingredients/merge", () => ({
  mergeIngredient: (...args: unknown[]) => mergeIngredient(...args),
  listMergeTargets: (...args: unknown[]) => listMergeTargets(...args),
}));

import { mergeIngredientAction, mergeTargetsAction } from "../ingredients-actions";

beforeEach(() => {
  mergeIngredient.mockReset();
  listMergeTargets.mockReset();
});

describe("mergeIngredientAction", () => {
  it("merges as the signed-in account and reports where it went", async () => {
    mergeIngredient.mockResolvedValue({ targetId: 4, targetName: "Sugarcane", labels: 3 });
    expect(await mergeIngredientAction(2, "id:4")).toEqual({ ok: true, message: "Merged into Sugarcane." });
    expect(mergeIngredient).toHaveBeenCalledWith(9, 2, { id: 4 });
  });

  it("rejects a bad id or token without touching the database", async () => {
    expect(await mergeIngredientAction(0, "id:4")).toMatchObject({ ok: false });
    expect(await mergeIngredientAction(2, "nonsense")).toMatchObject({ ok: false });
    expect(mergeIngredient).not.toHaveBeenCalled();
  });

  it("shows a rule error's words and hides anything else behind a retry message", async () => {
    mergeIngredient.mockRejectedValueOnce(new AdminRuleError("Only ingredients of the same kind can be merged."));
    expect(await mergeIngredientAction(2, "id:4")).toEqual({ ok: false, error: "Only ingredients of the same kind can be merged." });
    mergeIngredient.mockRejectedValueOnce(new Error("insert or update on table violates foreign key constraint"));
    expect(await mergeIngredientAction(2, "id:4")).toEqual({ ok: false, error: "Something changed while saving. Try again." });
  });
});

describe("mergeTargetsAction", () => {
  it("returns nothing for a bad id and otherwise asks as the signed-in account", async () => {
    expect(await mergeTargetsAction(-1)).toEqual([]);
    listMergeTargets.mockResolvedValue([{ token: "id:4", name: "Sugarcane", note: null }]);
    expect(await mergeTargetsAction(2)).toEqual([{ token: "id:4", name: "Sugarcane", note: null }]);
    expect(listMergeTargets).toHaveBeenCalledWith(9, 2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run "src/app/(app)/admin/__tests__/ingredients-actions.test.ts"`
Expected: FAIL, cannot resolve `../ingredients-actions`.

- [ ] **Step 3: The actions**

```ts
// src/app/(app)/admin/ingredients-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { AdminRuleError } from "@/lib/admin/errors";
import type { ActionResult } from "@/lib/admin/types";
import { requireSession } from "@/lib/auth";
import { parseMergeToken, type MergeTarget } from "@/lib/expressions/ingredient-rules";
import { listMergeTargets, mergeIngredient } from "@/lib/ingredients/merge";

export async function mergeTargetsAction(loserId: number): Promise<MergeTarget[]> {
  const user = await requireSession();
  if (!Number.isInteger(loserId) || loserId <= 0) return [];
  return listMergeTargets(user.id, loserId);
}

export async function mergeIngredientAction(loserId: number, token: string): Promise<ActionResult> {
  const user = await requireSession();
  const parsed = parseMergeToken(token);
  if (!Number.isInteger(loserId) || loserId <= 0 || !parsed) return { ok: false, error: "Choose an ingredient to merge into." };
  try {
    const { targetName } = await mergeIngredient(user.id, loserId, parsed);
    revalidatePath("/admin/ingredients");
    revalidatePath("/expressions");
    revalidatePath("/");
    return { ok: true, message: `Merged into ${targetName}.` };
  } catch (error: unknown) {
    if (error instanceof AdminRuleError) return { ok: false, error: error.message };
    console.error("[rickhouse] ingredient merge failed", error);
    return { ok: false, error: "Something changed while saving. Try again." };
  }
}
```

- [ ] **Step 4: The dialog**

```tsx
// src/components/admin/merge-dialog.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
// Import the dialog parts from the same module resource-view.tsx imports them from (lines 9-16).
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MergeTarget } from "@/lib/expressions/ingredient-rules";
import type { ActionResult, AdminRow } from "@/lib/admin/types";

export type IngredientMerge = {
  targets: (loserId: number) => Promise<MergeTarget[]>;
  run: (loserId: number, token: string) => Promise<ActionResult>;
};

/** Merge is irreversible, so the dialog says exactly what will happen and waits for a click. */
export function MergeDialog({ row, merge, onClose }: { row: AdminRow | null; merge: IngredientMerge; onClose: () => void }) {
  const router = useRouter();
  const [targets, setTargets] = React.useState<MergeTarget[] | null>(null);
  const [token, setToken] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const id = row?.id;
  React.useEffect(() => {
    setTargets(null);
    setToken("");
    setError(null);
    if (id === undefined) return;
    let live = true;
    void merge.targets(id).then((items) => {
      if (live) setTargets(items);
    });
    return () => {
      live = false;
    };
  }, [id, merge]);

  const name = String(row?.cells.name ?? "");
  const labels = Number(row?.cells.uses ?? 0);
  const chosen = targets?.find((target) => target.token === token);

  async function run() {
    if (!row || !chosen) return;
    setPending(true);
    setError(null);
    const result = await merge.run(row.id, chosen.token);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Merge {name}</DialogTitle>
          <DialogDescription>Fold it into another ingredient of the same kind.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-6 pb-2">
          <label className="flex flex-col gap-1.5 text-sm">
            Merge into
            <select
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={targets === null}
              className="h-10 border border-input bg-card px-3 text-sm text-foreground"
            >
              <option value="">{targets === null ? "Loading…" : targets.length === 0 ? "Nothing to merge into" : "Choose…"}</option>
              {targets?.map((target) => (
                <option key={target.token} value={target.token}>
                  {target.name}
                  {target.note ? ` (${target.note})` : ""}
                </option>
              ))}
            </select>
          </label>
          {chosen ? (
            <p className="text-sm">
              Merge &lsquo;{name}&rsquo; into &lsquo;{chosen.name}&rsquo;? {labels} {labels === 1 ? "label" : "labels"} will use{" "}
              {chosen.name}. &lsquo;{name}&rsquo; will be deleted. This can&rsquo;t be undone.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={run} disabled={!chosen || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Wire it into `ResourceView` and the page**

In `resource-view.tsx`: import `Merge` from lucide-react and `MergeDialog, type IngredientMerge` from `./merge-dialog`; add `merge?: IngredientMerge;` to the props and destructuring; add `const [merging, setMerging] = React.useState<AdminRow | null>(null);` next to the other state; inside the actions `div`, before the Edit button:

```tsx
                      {merge ? (
                        <Button variant="ghost" size="sm" onClick={() => setMerging(row)} aria-label={`Merge ${String(row.cells.name ?? "")}`} title={`Merge ${String(row.cells.name ?? "")}`}>
                          <Merge className="size-4" />
                        </Button>
                      ) : null}
```

and render, next to the other dialogs: `{merge ? <MergeDialog row={merging} merge={merge} onClose={() => setMerging(null)} /> : null}`.

In `[resource]/page.tsx` import `mergeIngredientAction, mergeTargetsAction` from `../ingredients-actions` and pass:

```tsx
      merge={resource === "ingredients" ? { targets: mergeTargetsAction, run: mergeIngredientAction } : undefined}
```

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run "src/app/(app)/admin" && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src "src/app/(app)/admin"
git commit -m "Add Merge to the Ingredients list with a confirm dialog

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Merge pointer, end-to-end, regression pass

**Files:**
- Modify: `src/lib/expressions/ingredient-rules.ts`, `__tests__/ingredient-rules.test.ts`
- Modify: `src/lib/admin/__tests__/ingredients.integration.test.ts`
- Modify: `e2e/ingredients.spec.ts`

**Acceptance Criteria:**
- The reserved-name message ends with "Use Merge into… to combine." everywhere it appears.
- A merge through the UI moves a label's chip to the survivor.
- Finishes, Tags, Categories, Mashbills, Stores and the other resources still list, add, edit and delete.

- [ ] **Step 1: Update the message and its tests**

In `reservedNameError` return `` `${preset} is a built-in choice. Use Merge into… to combine.` ``. Update the expected strings in `ingredient-rules.test.ts` ("Sugarcane is a built-in choice. Use Merge into… to combine.") and in `ingredients.integration.test.ts` ("Molasses is a built-in choice. Use Merge into… to combine."). Update the e2e text match in the built-in test to `Molasses is a built-in choice. Use Merge into… to combine.`

- [ ] **Step 2: Add the merge e2e** (append to `e2e/ingredients.spec.ts`)

```ts
test("merging an ingredient moves a label to the survivor", async ({ page }) => {
  const from = `Sugar Cane ${stamp()}`;
  const into = `Cane Sugar ${stamp()}`;
  await addIngredient(page, "rum_base", from);
  await addIngredient(page, "rum_base", into);

  await openNewLabelForm(page);
  await pick(page, "Brand", "Pursuit Spirits");
  await pick(page, "Category", "Rum");
  await page.getByLabel("Label Name").fill(`Merge Rum ${stamp()}`);
  await page.getByRole("group", { name: "Base" }).getByRole("button", { name: from }).click();
  await page.getByRole("button", { name: "Create Label", exact: true }).click();
  await expect(page).toHaveURL(/\/expressions\/\d+$/);
  const labelUrl = page.url();

  await page.goto("/admin/ingredients");
  await page.getByRole("button", { name: `Merge ${from}` }).click();
  await page.getByLabel("Merge into").selectOption({ label: into });
  await expect(page.getByText(/1 label will use/)).toBeVisible();
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByRole("cell", { name: from, exact: true })).toBeHidden();

  await page.goto(labelUrl);
  await expect(page.getByRole("link", { name: into })).toBeVisible();
  await expect(page.getByText(from)).toBeHidden();
});
```

- [ ] **Step 3: Run everything**

```bash
npm run typecheck && npm run lint && npx vitest run
TOURNAMENT_TEST_DATABASE_URL=postgres://user:pass@localhost:5432/scratch npx vitest run integration
npx playwright test e2e/ingredients.spec.ts e2e/admin.spec.ts e2e/entities.spec.ts
```
Expected: all PASS. `admin.spec.ts` and `entities.spec.ts` are the regression check for the shared `ResourceView`.

- [ ] **Step 4: Hand regression pass**

Open each of `/admin/categories` (as admin and non-admin), `companies`, `brands`, `distilleries`, `mashbills`, `finishes`, `cooperages`, `stores`, `tags`. For each: the table renders, Edit and Delete show on every row, no Merge button, no stray footer, add and edit open the dialog. Confirm the Configuration index shows Ingredients with its real-row count.

- [ ] **Step 5: Commit and open PR 2**

```bash
git add src e2e
git commit -m "Point reserved-name errors at Merge and cover merge end to end

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
| --- | --- |
| `/ingredients/[id]` page, kind and family badges, 404 for other accounts | 8 |
| "Also used as" line, owner-scoped | 8 |
| `ingredientIds` filter (URL, grid clause, no filter-bar control) | 7 |
| Chips link by id; `Links.ingredients` carries `id` | 9 (id already present at `queries.ts:64`) |
| Ingredients resource: columns, add, edit name and family, kind immutable | 3, 5, 6 |
| Built-in names reserved | 2, 5 (Merge pointer added in 16) |
| Data-derived locks (`is_manual = false`, preset) | 2, 5, 6 |
| Server-side enforcement: kind ignored on edit, family rules, lock recheck, zero-row delete throws | 3, 4, 5 |
| Guarded single-statement delete | 5 |
| API accepts all eight kinds | 10 |
| One preset module | 1 |
| Unused built-ins in a read-only section, no synthetic ids, card count = real rows | 12 |
| Merge: same kind and family, built-in survivor created, dense renumber, confirm with count, revalidation, accepted limits | 13, 14, 15 |
| Security: `requireSession` + `ownerId` everywhere | 5, 8, 10, 14, 15 |
| Tests listed in the spec | 1 to 5, 7, 8, 10, 11, 13 to 16 |
| Phase independence, no schema change | structure of the plan |
| Out of scope (filter-bar control, iOS, preset sync, cross-kind merge) | not built, by design |

**Placeholder scan:** no TBD or TODO. Two steps say "if the markup differs, match it" (the e2e picker locator and the lint note on an unused import); both name the file to read.

**Type consistency:** `lockFor`, `reservedNameError`, `INGREDIENT_KIND_LABELS`, `FAMILIES`, `ingredientHref`, `isIngredientKind` (Task 2) are used by their exact names in Tasks 3, 5, 6, 9, 10. `AdminRow.locked` is `{ tag, reason }` in Tasks 5, 6, 12. `MergeToken`, `MergeTarget`, `parseMergeToken`, `mergeTargets` (Task 13) match Tasks 14 and 15. `getIngredient` and `getAlsoUsedAs` (Task 8) match their page usage.
