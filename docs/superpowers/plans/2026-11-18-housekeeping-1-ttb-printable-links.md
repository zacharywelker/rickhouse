# Housekeeping 1: Printable-version link on TTB approvals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wherever a TTB approval is listed, give it a small image icon that opens TTB's printable form (the approved label), next to the existing TTB ID link.

**Architecture:** One small presentational component, `PrintableLink`, built on the existing `colaFormUrl`, dropped into the three tables that list approvals (the search window's results, the pending list on New Label, and the label/bottle "other approvals" table). No server code, no schema, no new dependency.

**Tech Stack:** React 19 / Next 15 client components, `lucide-react` (already used here), vitest with `renderToStaticMarkup` (same pattern as `src/components/bottles/__tests__/fill-gauge.test.tsx`).

**Spec:** `docs/superpowers/specs/2026-11-17-tidy-up-page-design.md`, section "Open the TTB page and the printable version" (concept B). This is plan 1 of 6 for the Housekeeping page: (1) this, (2) Photos, (3) Duplicates, (4) TTB approvals section, (5) Missing details: reference data, (6) Missing details: labels and bottles. It ships alone and improves the existing label page.

## Global Constraints

- The icon link opens `colaFormUrl(ttbId)` with `target="_blank"` and `rel="noreferrer"`; the server fetches nothing for it.
- Name shown on hover and focus: `Printable version` (via `title`); accessible name: `Printable version of <ttbId>`.
- The TTB ID stays a text link to `colaDetailUrl`, unchanged. The existing `Printable application ↗` text link in the approvals record (`cola-approvals.tsx`, near line 478) is left as it is.
- Only a 14-digit TTB ID is ever linked (`^[0-9]{14}$`, the same rule as the `expression_colas_ttb_id_check` constraint and `normalizeTtbId`).
- No new dependency. Imports use the `@/` alias. Square corners, `text-muted-foreground`, the app's existing focus ring classes.

## Review Focus

- **Icon-only link has no visible text.** It must carry an accessible name. Test pins `aria-label`.
- **A non-digit ID would put free text into a URL.** The component renders nothing unless the ID is exactly 14 digits. Test pins it.
- **Nested anchors are invalid HTML.** The icon must sit beside the ID link, never inside it. Test pins a single `<a` in the component; Task 2 places it as a sibling.
- **Narrow screens.** The ID cell is `whitespace-nowrap`; the ID and icon must stay on one line at 390 px. Checked by hand in Task 2.
- **Already-attached rows are muted in the search window.** The icon must still be clickable there. Checked by hand in Task 2.

---

### Task 1: The `PrintableLink` component

**Files:**
- Create: `src/components/expressions/cola-printable-link.tsx`
- Test: `src/components/expressions/__tests__/cola-printable-link.test.tsx`

**Interfaces:**
- Produces: `export function PrintableLink({ ttbId, className }: { ttbId: string; className?: string }): React.ReactElement | null`

- [ ] **Step 1: Set up the branch.** Per the repo's rules, first run `git fetch origin`, `git ls-remote origin 'refs/heads/claude/*'` and `gh pr list --state all --search "printable"`; build on a matching branch or PR if there is one. Otherwise create a worktree: `git worktree add .claude/worktrees/housekeeping-ttb-links -b claude/housekeeping-ttb-links origin/main`, run `npm ci` in it (a worktree has no `node_modules`), and work there.

- [ ] **Step 2: Write the failing test** in `src/components/expressions/__tests__/cola-printable-link.test.tsx`, using `renderToStaticMarkup`:
  - `"links to the printable form in a new tab"`: for `ttbId="21132001000620"`, the markup contains `href="` + `colaFormUrl("21132001000620")` (import it from `@/lib/cola/ids`), `target="_blank"`, `rel="noreferrer"`, `title="Printable version"`.
  - `"names itself for assistive tech"`: contains `aria-label="Printable version of 21132001000620"`.
  - `"is one anchor and hides its icon"`: exactly one `<a` in the markup; the `<svg` carries `aria-hidden="true"`.
  - `"renders nothing for an ID that is not 14 digits"`: `"123"` and `"21132001000620&x=1"` both give `""`.
  - `"passes a class through"`: `className="ml-2"` appears in the markup.

- [ ] **Step 3: Run it to see it fail.** Run: `npx vitest run src/components/expressions/__tests__/cola-printable-link.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 4: Implement `PrintableLink`** in `src/components/expressions/cola-printable-link.tsx` (no `"use client"` needed; it is pure). Return `null` unless `/^[0-9]{14}$/.test(ttbId)`. Otherwise an `<a>` with `href={colaFormUrl(ttbId)}`, `target="_blank"`, `rel="noreferrer"`, `title="Printable version"`, `aria-label`, and classes built with `cn` from `@/lib/utils`: `inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`. Child: lucide `ImageIcon` (`size-4`, `aria-hidden`).

- [ ] **Step 5: Run the test to see it pass.** Same command. Expected: PASS (5 tests).

- [ ] **Step 6: Commit.**
```bash
git add src/components/expressions/cola-printable-link.tsx src/components/expressions/__tests__/cola-printable-link.test.tsx
git commit -m "Add a printable-version link for TTB approvals"
```

---

### Task 2: Use it wherever approvals are listed

**Files:**
- Modify: `src/components/expressions/cola-search-dialog.tsx` (results table, the TTB ID cell near line 308)
- Modify: `src/components/expressions/cola-approvals.tsx` (the pending-list TTB ID cell near line 292, and the other-approvals table's TTB ID cell near line 174)

**Interfaces:**
- Consumes: `PrintableLink({ ttbId, className? })` from Task 1.

- [ ] **Step 1: Search window results.** In `cola-search-dialog.tsx`, import `PrintableLink` from `./cola-printable-link`. In the TTB ID `<td>`, wrap the existing `<a>` and a new `<PrintableLink ttbId={row.ttbId} />` in `<span className="inline-flex items-center gap-2">`. The anchor itself is unchanged. The icon is a sibling of the anchor, not a child, and is not dimmed for already-attached rows.

- [ ] **Step 2: Pending list and other-approvals table.** In `cola-approvals.tsx`, import it the same way. In both TTB ID cells, apply the same wrapper, passing `cola.ttbId`. Leave the record's `Printable application ↗` link and the `Row label="TTB ID"` link alone.

- [ ] **Step 3: Check every call site passes a normalised ID.** Run `grep -rn "PrintableLink" src` and confirm each `ttbId` comes from a search row, a pending row or a stored COLA (all 14-digit by `normalizeTtbId` or the table constraint). Expected: three usages, no free-text input.

- [ ] **Step 4: Typecheck, lint, test.** Run `npm run typecheck && npm run lint && npx vitest run src/components/expressions src/lib/cola`. Expected: all pass.

- [ ] **Step 5: Look at it.** Follow the dev-server recipe in memory (`dev-server-use-localhost.md`: use `localhost`, a throwaway database) with `COLA_LOOKUP=false npm run dev`. On New Label, add an approval by TTB ID `21132001000620`. Confirm: the image icon appears beside the ID in the pending list, hover shows "Printable version", Tab reaches it with a visible ring, a click opens the form address in a new tab, and at 390 px wide the ID and icon stay on one line. Where the machine can reach TTB, repeat the search window (`COLA_LOOKUP` unset) and check an already-attached row's icon still works. Record in the PR whether the printable form opened in a fresh tab without first visiting a TTB page (the spec's open question; the server fetches it with no prior session, which suggests it does).

- [ ] **Step 6: Commit.**
```bash
git add src/components/expressions/cola-search-dialog.tsx src/components/expressions/cola-approvals.tsx
git commit -m "Show the printable-version icon beside TTB IDs in approval lists"
```
