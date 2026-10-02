import type { Route } from "next";
import { BOTTLE_STATUSES } from "@/db/schema";
import { DEFAULT_FILTERS, serialiseFilters, type BottleFilters } from "@/lib/bottles/filters";
import { formatMoney, humanise } from "@/lib/utils";
import type { Acquiring, Money, Shelf, Stockpile } from "./numbers";

/**
 * Numbers as a field guide (surface brief: Field-Guide Chapters). Pure: the
 * page fetches the chapter facts and this turns them into sentences, each with
 * one figure and a link to the bottles behind it.
 *
 * Every finding carries a weight: how far its value sits from what would be
 * unremarkable for this collection (half the shelf sealed, spending at last
 * year's pace, paying list price, an even category spread). The lead is the
 * heaviest; ties go to the fixed chapter order below. Nothing is random, so the
 * same collection always opens on the same finding.
 */

export type ChapterId = "stockpile" | "money" | "acquiring" | "shelf";

export type Finding = {
  id: string;
  chapter: ChapterId;
  /** The big number, already formatted. */
  figure: string;
  sentence: string;
  href: Route;
  weight: number;
};

export type Chapter = {
  id: ChapterId;
  number: string;
  title: string;
  findings: Finding[];
  /** "Based on 31 of 41 bottles…", when the chapter could not count everything. */
  coverage: string | null;
  /** Fewer than three usable bottles: show one quiet line instead of a chart. */
  thin: boolean;
};

export type NumbersInput = {
  today: string;
  stockpile: Stockpile;
  money: Money;
  acquiring: Acquiring;
  shelf: Shelf;
  /** ISO 4217 code amounts are shown in. */
  currency?: string;
};

const MIN_SAMPLE = 3;

/**
 * The leader of rows sorted by count, descending — or null on a tie, because
 * "more than any other" is false when another one has just as many.
 */
export function outright<T extends { count: number }>(rows: readonly T[]): T | null {
  const [first, second] = rows;
  return first && (!second || first.count > second.count) ? first : null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** The noun alone, for sentences that continue from the figure. */
const noun = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Money and acquisition findings count everything acquired, so their links must too. */
const EVER_ACQUIRED = BOTTLE_STATUSES.filter((s) => s !== "wishlist");

function href(patch: Partial<BottleFilters>): Route {
  const query = serialiseFilters({ ...DEFAULT_FILTERS, ...patch });
  return (query === "" ? "/bottles" : `/bottles?${query}`) as Route;
}

function yearsAgo(today: string, years: number): string {
  const [y, m, d] = today.split("-");
  return `${Number(y) - years}-${m}-${d}`;
}

function stockpileFindings({ today, stockpile: s }: NumbersInput): Finding[] {
  const out: Finding[] = [];
  if (s.onShelf >= MIN_SAMPLE && s.sealed > 0) {
    const share = s.sealed / s.onShelf;
    out.push({
      id: "sealed",
      chapter: "stockpile",
      figure: String(s.sealed),
      sentence:
        s.sealed === s.onShelf
          ? `${noun(s.sealed, "bottle")} on the shelf, and not one of them opened yet.`
          : `${noun(s.sealed, "bottle")} on the shelf ${verb(s.sealed, "has", "have")} never been opened${s.sealedSince ? `, the oldest since ${s.sealedSince}` : ""}.`,
      href: href({ open: "closed" }),
      weight: clamp01((share - 0.5) * 2),
    });
  }
  if (s.sealedTwoYears >= MIN_SAMPLE) {
    out.push({
      id: "sealed-long",
      chapter: "stockpile",
      figure: String(s.sealedTwoYears),
      sentence: `sealed ${noun(s.sealedTwoYears, "bottle")} ${verb(s.sealedTwoYears, "has", "have")} been waiting more than two years to be opened.`,
      href: href({ open: "closed", acquired: { from: null, to: yearsAgo(today, 2) }, sort: "acquired", desc: false }),
      weight: clamp01((s.sealedTwoYears / Math.max(1, s.onShelf)) * 1.5),
    });
  }
  if (s.medianWaitDays !== null && s.waitSample >= MIN_SAMPLE) {
    const months = Math.round(s.medianWaitDays / 30.4);
    out.push({
      id: "wait",
      chapter: "stockpile",
      figure: months >= 1 ? plural(months, "month") : plural(s.medianWaitDays, "day"),
      sentence: `is how long a bottle typically waits between coming home and being opened.`,
      href: href({ open: "open", sort: "acquired", desc: false }),
      weight: clamp01(s.medianWaitDays / 730),
    });
  }
  if (s.lastPour > 0 && s.open >= MIN_SAMPLE) {
    out.push({
      id: "last-pour",
      chapter: "stockpile",
      figure: String(s.lastPour),
      sentence: `${noun(s.lastPour, "open bottle")} ${verb(s.lastPour, "is", "are")} down to the last pour or two.`,
      href: href({ open: "open", fill: { min: null, max: 10 }, sort: "fill", desc: false }),
      weight: clamp01(s.lastPour / s.open),
    });
  }
  if (s.finished > 0) {
    const thisYear = s.finishedByYear.find((r) => String(r.year) === today.slice(0, 4))?.count ?? 0;
    out.push({
      id: "finished",
      chapter: "stockpile",
      figure: String(s.finished),
      sentence:
        thisYear > 0
          ? `${noun(s.finished, "bottle")} finished for good, ${thisYear} of ${verb(s.finished, "it", "them")} this year.`
          : `${noun(s.finished, "bottle")} finished for good.`,
      href: href({ statuses: ["killed"] }),
      weight: 0.1,
    });
  }
  return out;
}

function moneyFindings({ today, money: m, currency }: NumbersInput): Finding[] {
  const out: Finding[] = [];
  const acquiredLinks = { statuses: [...EVER_ACQUIRED] };
  if (m.thisYear > 0 && m.lastYearToDate > 0) {
    const ratio = m.thisYear / m.lastYearToDate;
    const delta = Math.round(Math.abs(ratio - 1) * 100);
    out.push({
      id: "pace",
      chapter: "money",
      figure: formatMoney(String(m.thisYear), currency),
      sentence:
        delta === 0
          ? `spent so far this year, exactly last year's pace.`
          : `spent so far this year, ${delta}% ${ratio > 1 ? "ahead of" : "behind"} last year's pace.`,
      href: href({ ...acquiredLinks, acquired: { from: `${today.slice(0, 4)}-01-01`, to: null }, sort: "price" }),
      weight: clamp01(Math.abs(ratio - 1)),
    });
  }
  if (m.msrpSample >= MIN_SAMPLE && m.msrpList > 0) {
    const premium = (m.msrpPaid - m.msrpList) / m.msrpList;
    const rounded = Math.round(Math.abs(premium) * 100);
    out.push({
      id: "msrp",
      chapter: "money",
      figure: rounded === 0 ? "MSRP" : `${premium > 0 ? "+" : "−"}${rounded}%`,
      sentence:
        rounded === 0
          ? `is what you pay, near enough, across ${plural(m.msrpSample, "bottle")} with a known MSRP.`
          : `${premium > 0 ? "over" : "under"} list price overall, across ${plural(m.msrpSample, "bottle")} with a known MSRP${m.overMsrp > 0 ? `; ${m.overMsrp} cost more than list` : ""}.`,
      href: href({ ...acquiredLinks, overMsrp: m.overMsrp > 0, sort: "price" }),
      weight: clamp01(Math.abs(premium)),
    });
  }
  if (m.topStore && m.storedCount >= MIN_SAMPLE && m.storedSpend > 0) {
    const share = m.topStore.spend / m.storedSpend;
    out.push({
      id: "top-store-spend",
      chapter: "money",
      figure: pct(share),
      sentence: `of the money spent at stores you've recorded went to ${m.topStore.name}.`,
      href: href({ ...acquiredLinks, storeIds: [m.topStore.id], sort: "price" }),
      weight: clamp01((share - 0.5) * 2),
    });
  }
  if (m.openValue + m.sealedValue > 0) {
    out.push({
      id: "sealed-value",
      chapter: "money",
      figure: formatMoney(String(m.sealedValue), currency),
      sentence: `is sitting in sealed bottles, against ${formatMoney(String(m.openValue), currency)} in open ones.`,
      href: href({ open: "closed", sort: "price" }),
      weight: 0.15,
    });
  }
  if (m.priciest) {
    out.push({
      id: "priciest",
      chapter: "money",
      figure: formatMoney(m.priciest.price, currency),
      sentence: `is the most you've paid for one bottle: ${m.priciest.name}.`,
      href: `/bottles/${m.priciest.id}` as Route,
      weight: 0.1,
    });
  }
  return out;
}

function acquiringFindings({ acquiring: a }: NumbersInput): Finding[] {
  const out: Finding[] = [];
  if (a.acquired >= MIN_SAMPLE) {
    const other = a.mix.filter((r) => r.kind !== "purchase");
    const otherCount = other.reduce((sum, r) => sum + r.count, 0);
    if (otherCount > 0) {
      const share = otherCount / a.acquired;
      out.push({
        id: "not-bought",
        chapter: "acquiring",
        figure: pct(share),
        sentence: `of the bottles weren't simply bought off a shelf: ${other.map((r) => `${r.count} ${humanise(r.kind).toLowerCase()}`).join(", ")}.`,
        href: href({ statuses: [...EVER_ACQUIRED], acquisitions: other.map((r) => r.kind) }),
        weight: clamp01(share * 1.5),
      });
    }
  }
  if (a.favouriteStore && a.favouriteStore.stores >= 2) {
    const share = a.favouriteStore.count / a.acquired;
    out.push({
      id: "favourite-store",
      chapter: "acquiring",
      figure: String(a.favouriteStore.count),
      sentence: `${noun(a.favouriteStore.count, "bottle")} came from ${a.favouriteStore.name}, more than from any of the other ${plural(a.favouriteStore.stores - 1, "store")}.`,
      href: href({ statuses: [...EVER_ACQUIRED], storeIds: [a.favouriteStore.id] }),
      weight: clamp01((share - 0.5) * 2),
    });
  }
  if (a.picks > 0) {
    out.push({
      id: "picks",
      chapter: "acquiring",
      figure: String(a.picks),
      sentence: a.topPicker
        ? `single-barrel ${noun(a.picks, "pick")} on the shelf; ${a.topPicker.name} picked ${a.topPicker.count} of them.`
        : `single-barrel ${noun(a.picks, "pick")} on the shelf.`,
      href: href({ pick: true }),
      weight: clamp01((a.picks / Math.max(1, a.acquired)) * 2),
    });
  }
  return out;
}

function shelfFindings({ shelf: s }: NumbersInput): Finding[] {
  const out: Finding[] = [];
  const top = s.categories[0];
  if (top && top.categoryIds.length > 0 && s.onShelf >= MIN_SAMPLE) {
    out.push({
      id: "top-category",
      chapter: "shelf",
      figure: `${Math.round(top.share)}%`,
      // "Most" only when it is: a plurality is "more than anything else".
      sentence:
        top.share > 50
          ? `of the shelf is ${top.label.toLowerCase()}.`
          : `of the shelf is ${top.label.toLowerCase()}, more than any other spirit.`,
      href: href({ categoryIds: top.categoryIds }),
      weight: clamp01((top.share / 100 - 0.5) * 2),
    });
  }
  if (s.proof.length > 0) {
    const total = s.proof.reduce((sum, bin) => sum + bin.count, 0);
    const mode = s.proof.reduce((best, bin) => (bin.count > best.count ? bin : best), s.proof[0]!);
    if (total >= MIN_SAMPLE && mode.count > 0) {
      out.push({
        id: "proof-band",
        chapter: "shelf",
        figure: mode.label,
        sentence:
          mode.count * 2 > total
            ? `proof is where most of the shelf sits: ${plural(mode.count, "bottle")}.`
            : `proof is the most common band, with ${plural(mode.count, "bottle")}.`,
        href: href({ proof: { min: mode.min, max: mode.max } }),
        weight: 0.1,
      });
    }
  }
  if (s.caskStrength >= MIN_SAMPLE) {
    const share = s.caskStrength / s.onShelf;
    out.push({
      id: "cask-strength",
      chapter: "shelf",
      figure: pct(share),
      sentence: `of the shelf is cask strength (${plural(s.caskStrength, "bottle")}).`,
      href: href({ caskStrength: true }),
      weight: clamp01(share * 1.2),
    });
  }
  if (s.bottledInBond >= MIN_SAMPLE) {
    out.push({
      id: "bib",
      chapter: "shelf",
      figure: String(s.bottledInBond),
      sentence: `${noun(s.bottledInBond, "bottle")} on the shelf ${verb(s.bottledInBond, "is", "are")} bottled in bond.`,
      href: href({ bottledInBond: true }),
      weight: 0.1,
    });
  }
  if (s.medianAge !== null && s.ageSample >= MIN_SAMPLE) {
    out.push({
      id: "age",
      chapter: "shelf",
      figure: plural(Math.round(s.medianAge * 10) / 10, "year"),
      sentence: `is the median age of the ${plural(s.ageSample, "bottle")} that state one.`,
      href: href({ sort: "age" }),
      weight: 0.1,
    });
  }
  // One bottle is not "more than any other"; a winner needs a few.
  if (s.topDistillery && s.topDistillery.count >= MIN_SAMPLE) {
    out.push({
      id: "top-distillery",
      chapter: "shelf",
      figure: String(s.topDistillery.count),
      sentence: `${noun(s.topDistillery.count, "bottle")} ${verb(s.topDistillery.count, "carries", "carry")} spirit from ${s.topDistillery.label}, more than any other distillery.`,
      href: href({ distilleryIds: [s.topDistillery.id] }),
      weight: 0.05,
    });
  }
  if (s.liquidMl > 0) {
    const litres = s.liquidMl / 1000;
    // A standard 1.5 oz (44 ml) pour: a stated conversion, not a claim.
    const pours = Math.floor(s.liquidMl / 44);
    out.push({
      id: "liquid",
      chapter: "shelf",
      figure: `${litres >= 10 ? Math.round(litres) : Math.round(litres * 10) / 10} L`,
      sentence: `of spirit on the shelf, about ${pours.toLocaleString("en-US")} one-and-a-half-ounce pours.`,
      href: href({ sort: "fill" }),
      weight: 0.2,
    });
  }
  return out;
}

const CHAPTER_META: Array<{ id: ChapterId; number: string; title: string }> = [
  { id: "stockpile", number: "01", title: "Stockpile" },
  { id: "money", number: "02", title: "Money" },
  { id: "acquiring", number: "03", title: "Acquiring" },
  { id: "shelf", number: "04", title: "Shelf" },
];

/** The fixed order ties fall back to: chapter order, then each chapter's own order. */
function byWeight(findings: Finding[]): Finding[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => b.finding.weight - a.finding.weight || a.index - b.index)
    .map(({ finding }) => finding);
}

function coverageFor(id: ChapterId, input: NumbersInput): string | null {
  const { stockpile: s, money: m, shelf: sh } = input;
  if (id === "stockpile" && s.sealed > 0 && s.sealedDated < s.sealed) {
    return `The chart counts the ${s.sealedDated} of ${plural(s.sealed, "sealed bottle")} with a purchase date.`;
  }
  if (id === "money" && m.priced < m.acquired) {
    return `Based on the ${m.priced} of ${plural(m.acquired, "bottle")} with a price recorded.`;
  }
  if (id === "shelf" && sh.proofSample < sh.onShelf) {
    return `Proof is known for ${sh.proofSample} of ${plural(sh.onShelf, "bottle")}.`;
  }
  return null;
}

function usableFor(id: ChapterId, input: NumbersInput): number {
  switch (id) {
    case "stockpile":
      return input.stockpile.sealedDated;
    case "money":
      return input.money.priced;
    case "acquiring":
      return input.acquiring.acquired;
    case "shelf":
      return input.shelf.onShelf;
  }
}

export function buildNumbers(input: NumbersInput): { lead: Finding | null; chapters: Chapter[] } {
  const all = [
    ...stockpileFindings(input),
    ...moneyFindings(input),
    ...acquiringFindings(input),
    ...shelfFindings(input),
  ];
  const lead = byWeight(all)[0] ?? null;

  const chapters = CHAPTER_META.map((meta) => ({
    ...meta,
    // The lead already opened the page; its chapter starts with the next one.
    findings: byWeight(all.filter((f) => f.chapter === meta.id && f.id !== lead?.id)),
    coverage: coverageFor(meta.id, input),
    thin: usableFor(meta.id, input) < MIN_SAMPLE,
  }));

  return { lead, chapters };
}
