import type { Route } from "next";
import { formatMoney } from "@/lib/utils";
import type { Bin, Headline, Ranked, Slice, longHeldCount, longestHeldBottle, mostExpensiveBottle } from "./queries";

/**
 * Numbers begins with curiosity rather than a dashboard (DESIGN-BRIEF.MD §22):
 * short, specific claims about the collection, each pointing at the bottles
 * behind it rather than a KPI grid nobody clicks. Pure — the page fetches the
 * rows (the same ones its charts already need) and hands them here.
 */
export type Observation = { id: string; text: string; detail?: string; href: Route | null };

function bottleHref(id: number): Route {
  return `/bottles/${id}` as Route;
}

function filterHref(params: Record<string, string>): Route {
  const search = new URLSearchParams(params).toString();
  return `/bottles?${search}` as Route;
}

function fromCategory(top: Slice | undefined): Observation | null {
  if (!top || top.categoryIds.length === 0) return null;
  return {
    id: "top-category",
    // "Most" only when it is: a plurality is "more than anything else".
    text:
      top.share > 50
        ? `Most of the collection is ${top.label.toLowerCase()} — ${top.share}% of it.`
        : `There is more ${top.label.toLowerCase()} than anything else — ${top.share}% of the collection.`,
    detail: `${top.count} bottle${top.count === 1 ? "" : "s"}`,
    href: filterHref({ category: top.categoryIds.join(",") }),
  };
}

function fromProof(bins: Bin[]): Observation | null {
  if (bins.length === 0) return null;
  const mode = bins.reduce((best, bin) => (bin.count > best.count ? bin : best), bins[0]!);
  if (mode.count === 0) return null;
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  return {
    id: "proof-mode",
    // "Most" only when it is: a plurality is "more than any other band".
    text:
      mode.count * 2 > total
        ? `Most of your bottles are ${mode.label} proof.`
        : `More of your bottles are ${mode.label} proof than any other band.`,
    detail: `${mode.count} bottle${mode.count === 1 ? "" : "s"}`,
    href: filterHref({ proofMin: String(mode.min), proofMax: String(mode.max) }),
  };
}

function fromDistillery(top: Ranked | undefined): Observation | null {
  if (!top) return null;
  return {
    id: "top-distillery",
    text: `${top.label} shows up in more of your bottles than any other distillery.`,
    detail: `${top.count} bottle${top.count === 1 ? "" : "s"}`,
    href: filterHref({ distillery: String(top.id) }),
  };
}

function fromExpensive(item: Awaited<ReturnType<typeof mostExpensiveBottle>>): Observation | null {
  if (!item) return null;
  return {
    id: "most-expensive",
    text: `Your most expensive bottle is ${item.name}.`,
    detail: formatMoney(item.price),
    href: bottleHref(item.id),
  };
}

function fromLongestHeld(item: Awaited<ReturnType<typeof longestHeldBottle>>): Observation | null {
  if (!item || item.years < 1) return null;
  return {
    id: "longest-held",
    text: `You've had ${item.name} the longest.`,
    detail: `${item.years} year${item.years === 1 ? "" : "s"}`,
    href: bottleHref(item.id),
  };
}

function fromLongHeldCount(count: number, years: number): Observation | null {
  if (count === 0) return null;
  return {
    id: "long-held-count",
    text: `You have ${count} bottle${count === 1 ? "" : "s"} you've owned for ${years}+ years.`,
    href: filterHref({ sort: "acquired", dir: "asc" }),
  };
}

function fromTotal(stats: Headline): Observation | null {
  if (stats.bottles === 0) return null;
  return {
    id: "total",
    text: `Your collection has ${stats.bottles} bottle${stats.bottles === 1 ? "" : "s"} across ${stats.expressions} label${stats.expressions === 1 ? "" : "s"}.`,
    href: filterHref({}),
  };
}

function fromSpend(stats: Headline): Observation | null {
  const spend = Number(stats.spend);
  const msrp = Number(stats.msrp);
  if (spend === 0) return null;
  // Only over bottles where a price was recorded, so gifts do not read as savings.
  const delta = msrp > 0 ? spend - msrp : null;
  const deltaText =
    delta === null
      ? ""
      : delta === 0
        ? " — exactly MSRP."
        : delta > 0
          ? ` — ${formatMoney(String(delta))} over MSRP.`
          : ` — ${formatMoney(String(Math.abs(delta)))} under MSRP.`;
  return {
    id: "spend",
    text: `You've spent ${formatMoney(stats.spend)} on this collection${deltaText}`,
    href: filterHref({ sort: "price", dir: "desc" }),
  };
}

function fromOpen(stats: Headline): Observation | null {
  if (stats.open === 0) return null;
  return {
    id: "open",
    text: `${stats.open} bottle${stats.open === 1 ? "" : "s"} ${stats.open === 1 ? "is" : "are"} open right now.`,
    href: filterHref({ open: "open" }),
  };
}

export function buildObservations(input: {
  stats: Headline;
  categories: Slice[];
  proof: Bin[];
  distilleries: Ranked[];
  expensive: Awaited<ReturnType<typeof mostExpensiveBottle>>;
  longestHeld: Awaited<ReturnType<typeof longestHeldBottle>>;
  longHeldYears: number;
  longHeldCount: Awaited<ReturnType<typeof longHeldCount>>;
}): Observation[] {
  if (input.stats.bottles === 0) return [];

  const candidates = [
    fromTotal(input.stats),
    fromExpensive(input.expensive),
    fromCategory(input.categories[0]),
    fromProof(input.proof),
    fromDistillery(input.distilleries[0]),
    fromLongestHeld(input.longestHeld),
    fromLongHeldCount(input.longHeldCount, input.longHeldYears),
    fromOpen(input.stats),
    fromSpend(input.stats),
  ];

  return candidates.filter((item): item is Observation => item !== null);
}
