---
version: 1
slug: "src-app-app-numbers-page-tsx"
primary_target: "src/app/(app)/numbers/page.tsx"
related_targets: []
---

# Numbers — surface brief

Mode: **Read.** Confirmed with the user 2026-09-28 via `/impeccable shape`.

## Job and audience
A self-hosting collector opens Numbers for fun, mostly on desktop, sometimes on a phone. They are reading their own shelf, not operating it. The page lives inside the established DESIGN.md world. Rick does not appear on Numbers.

## Outcome and proof
Curiosity, then why, then the bottles: "huh, that's interesting" → a pattern → the filtered Collection behind it. Every finding is computed from the user's own records and links to the Collection grid pre-filtered to its bottles. No invented comparisons, benchmarks or market values.

## Selected direction: Field-Guide Chapters
- One lead finding at display scale (a very large number plus a sentence). It is the most surprising available finding for that collection, chosen by a deterministic score with a fixed fallback order.
- A chapter index `01 Stockpile · 02 Money · 03 Acquiring · 04 Shelf` with jump links: sticky on desktop, a horizontal scroller on phones.
- Each chapter opens with its strongest finding beside one chart, then 2–4 secondary findings, then "see these bottles" links.
- It reads as an editorial document, not a dashboard: no card grids (DESIGN.md: "Numbers is not KPI-card soup"). DESIGN.md §5.4 permits unusually large numerals.

## Chapter content (existing schema fields only)
- **Stockpile:** bottles never opened and for how long; median wait from acquisition to opening; bottles finished per year (`date_killed`); bottles on their last pour (low `fill_pct`).
- **Money:** spend by month and this year's pace against last year's; price paid against MSRP; spend by store; the value of open bottles against sealed ones.
- **Acquiring:** the mix of purchase, gift, allocation, lottery, trade and secondary; the favourite store; single-barrel and store picks, and who picked them.
- **Shelf:** category share; proof and age spread; share of cask-strength and bottled-in-bond; total liquid on hand (fill × size).
- The existing observations and four charts are folded into these chapters or retired.

## States and ranges
- 1 to ~1,000 bottles; the e2e fixture has 41.
- A finding whose inputs are missing is omitted, never shown as "$0" or "n/a". A chapter that uses only some of the bottles shows its coverage ("based on 31 of 41 bottles").
- A chapter with fewer than 3 usable bottles shows one quiet line instead of a chart.
- An empty collection gets one empty state pointing to adding a bottle.
- Only owned and open bottles count.
- Charts carry text equivalents and respect `prefers-reduced-motion`. WCAG 2.2 AA.

## Constraints and decisions made
- The drill-down uses Collection URL filters. New filters are added to `src/lib/bottles/filters.ts`, with chips in the filter bar: acquisition type, date-acquired range, fill range, cask strength, bottled-in-bond, single-barrel pick, and over MSRP.
- Lead-finding score: how far a value sits from what is typical for that collection, ranked by a fixed order, with no randomness.
- Spend over time comes from `date_acquired` only; undated bottles are excluded and counted in the coverage note.
- Out of scope: tasting notes and the pour log (M9).

## Direction contract
THESIS: Numbers is a chapter of the collector's own field guide: findings written as sentences, proven by one chart each, and ending at the bottles. It refuses the dashboard of equal KPI tiles.
OWN-WORLD: DESIGN.md's lived-in Swiss world. Paper ground, ink type in Aileron, hairline ruled sections, category colours as the only chart colour, tabular numerals, chapter numerals as structure. No cards, shadows or rounded tiles.
STORY: The reader meets one surprising fact about their shelf, learns which chapter explains it, reads the pattern in one chart, and taps through to the exact bottles.
FIRST VIEWPORT: The page title is small. The lead number runs across most of the content width at display scale, with its sentence directly below and a "see these bottles" link. The chapter index is a ruled row beneath it, and the top of chapter 01 is visible below the fold line on desktop.
FORM: Field-Guide Chapters, position 1 of 7 on the ordered list; seed key f5ae31e3.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
