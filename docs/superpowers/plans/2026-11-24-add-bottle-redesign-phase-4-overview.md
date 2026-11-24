# Add-bottle redesign, phase 4: the forms and the add page (overview)

This is a roadmap, not a task list. Phase 4 is five pieces that can each be built, reviewed and shipped on their own, so each gets its own plan (the planning rule: one plan per independent subsystem). The first, **4A**, is written in full: `2026-11-24-add-bottle-redesign-phase-4a-rule-gaps.md`. The others are scoped here, with what has to be settled before each is planned.

**Spec:** `docs/superpowers/specs/2026-11-23-add-bottle-redesign-design.md` (sections 3, 4, 7 to 11, 12 and 15).

## What phase 3 left us

- The tree, the kinds and the migration are built (#408, #409). The matrix is data and its test lists the 32 places today's rules differ (`src/lib/expressions/field-matrix-gaps.ts`, #410).
- That list is the executable to-do for 4A: every fix deletes its entries and the test keeps passing.
- Two things in the design are **not** form-rule changes and are not in that list: new fields and new behaviours (4B), and the page itself (4C and 4D).

## The five pieces

| | Piece | What it is | Size | Risk | Depends on |
|---|---|---|---|---|---|
| **4A** | Rule gaps | Make today's forms follow the matrix: hide the retired fields, cask strength, NAS, cooperage and peat rules, the bottle rules in one function, the Still link for every spirit, the rum Aged toggle, Barrel type | 6 small PRs | Medium: two data migrations (still type, rum aged) | Phase 3 |
| **4B** | New per-spirit behaviour | The rules in section 9 that are not just show or hide: Solera low and high age in years, Cachaça / Agricole / Spiced rum, Tennessee, Cognac, Armagnac, Calvados and Pisco derived values, mezcal production and class, Chilean pisco class from ABV, Acholado | Large, but each spirit is separate | Medium: some need schema columns | 4A |
| **4C** | The data-sheet layout | The visual language of section 3: rows with small-caps labels, property chips, dashed "+" chips for optional fields, toggle chips, "More" lines, one photo slot (the slot itself is phase 5), tables with a Share column | Large | Medium: touches every label and bottle form | 4A |
| **4D** | One add page | "1 The label" then "2 The bottle in your hand" on one page, the search-first start, the bottle section (Bought, Which one, Sealed / Opened), inherited bottle fields hidden on a new label | Large | High: it replaces the page you use most | 4A, 4C |
| **4E** | Walkthrough leftovers | The "Vintage" naming clash, prefill from the label when a vintage is added, anything the owner finds using 4D | Small | Low | 4D |

**Why this order.** 4A removes the differences first, one small reviewable PR each, so 4C and 4D can be built on rules that are already right, and the matrix test shrinks to nothing as proof. 4B can run beside 4C because they touch different code (rule modules and spirit sections, against layout components). 4D comes last because it replaces the page the owner uses daily; it should arrive on forms that already behave.

## Things to settle before planning each piece

**Before 4A (needed now; my recommendation in the 4A plan):**
1. The still type's `blend` value is dropped. Existing rows with it become empty (recommended), or are mapped to `column`?
2. Existing aged rum labels get the new Aged toggle switched on (recommended: any label with an age value, a statement or a finish), or all start off?
3. Barrel type for Corn and Light whiskey: the options **Uncharred** and **Used** are two finishes (recommended: seed them as ordinary finishes so the existing picker and pairing code keep working), or a separate field?

**Before 4B:** verify what already exists. Several section 9 rules were built in October (Calvados fruit table, Pisco grapes, brandy designations from age, tequila class from age; see the October per-spirit specs). 4B's first task is an audit that turns section 9 into a checklist marked built, partly built or not built, and only the last two become tasks. The solera range (`solera_range` is a text column today) and the sugar-cane rum rules need schema work.

**Before 4C:** the visual language is DESIGN.md's target, which the app does not use yet (the popups used the app's current tokens). Settle whether 4C moves the label and bottle forms to the target tokens or keeps today's, and what the Configuration and Labels pages (#393, #394) will share with it.

**Before 4D:** the bottle photo flow (phase 5) and the iOS add flow (separate work). Decide whether 4D ships behind a toggle so the old page stays until the owner has used the new one.

## Constraints that hold for every piece

- A retired field leaves the forms but its column stays dormant, and the phone API keeps accepting it until the app is updated (the owner decided to drop the columns in a later migration).
- The API contract: `GET /api/v1/categories` keeps `group` and `kind`; a new kind string is treated by old iOS builds as other.
- Hand-written migrations (`drizzle-kit generate` fails here); a rollback script for any that changes data.
- `npm run lint`, `tsc` and vitest before each push; database tests run in a database the test creates; e2e only against a throwaway database whose name is checked before a reset.
- Codex gets pure functions and vitest only (no localhost, no `.git` writes, shell started inside its worktree); Haiku the mechanical edits; a Sonnet review after each task; no Opus.
