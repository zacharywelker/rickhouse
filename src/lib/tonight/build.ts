import {
  BANDS,
  MIN_SPIRIT_TASTINGS,
  MIN_TOTAL_TASTINGS,
  bandCounts,
  drawUniform,
  drawWeighted,
  inBands,
  proofApplies,
  reasonsFor,
  spiritQualifies,
  weightOf,
  type BandKey,
  type Candidate,
} from "./rules";

/**
 * What to drink tonight, from plain rows. `queries.ts` loads them; everything here is a function of them, so the
 * steps and the draw can be tested without a database.
 */

export type ShelfBottle = {
  id: number;
  expressionId: number;
  brand: string;
  name: string;
  categoryId: number;
  category: string;
  /** Not opened yet. */
  sealed: boolean;
  fillPct: number;
  proof: number | null;
  dateAcquired: string | null;
  thumbPath: string | null;
  /** The bottle is muted while this is after today. */
  mutedUntil: string | null;
};

export type TastingRow = {
  expressionId: number;
  categoryId: number;
  tags: string[];
  tastedOn: string;
  rating: number | null;
};

export type TonightData = {
  /** Today as YYYY-MM-DD, in the server's calendar. */
  today: string;
  /** Bottles on the shelf (owned or open, not empty). */
  bottles: ShelfBottle[];
  /** Every tasting of the account. */
  tastings: TastingRow[];
  /** Whether a category has a flavor wheel. */
  hasWheel: (categoryId: number) => boolean;
  flavorLabel: (key: string) => string;
};

export type Selection = {
  /** Empty means every spirit. */
  categories: number[];
  /** Include sealed bottles. */
  sealed: boolean;
  bands: BandKey[];
  flavors: string[];
};

/** What the steps before proof need of a selection. */
type SpiritChoice = { categories: number[] };
type ShelfChoice = { categories: number[]; sealed: boolean };

const DAY_MS = 86_400_000;

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function isMuted(b: ShelfBottle, today: string): boolean {
  return b.mutedUntil !== null && b.mutedUntil > today;
}

function chosen(sel: SpiritChoice, b: ShelfBottle): boolean {
  return sel.categories.length === 0 || sel.categories.includes(b.categoryId);
}

/** Bottles of the chosen spirits that are not muted and, unless asked, not sealed. Proof and flavors not applied. */
function inPlay(data: TonightData, sel: ShelfChoice): ShelfBottle[] {
  return data.bottles.filter((b) => chosen(sel, b) && !isMuted(b, data.today) && (sel.sealed || !b.sealed));
}

// ---- Per-spirit and per-label facts ----

type Facts = {
  tastingsByCategory: Map<number, number>;
  totalTastings: number;
  /** Per label: tags across its tastings, and its latest tasting. */
  labels: Map<number, { tags: Set<string>; last: TastingRow }>;
};

function factsOf(data: TonightData): Facts {
  const tastingsByCategory = new Map<number, number>();
  const labels = new Map<number, { tags: Set<string>; last: TastingRow }>();
  for (const t of data.tastings) {
    tastingsByCategory.set(t.categoryId, (tastingsByCategory.get(t.categoryId) ?? 0) + 1);
    const entry = labels.get(t.expressionId) ?? { tags: new Set<string>(), last: t };
    for (const tag of t.tags) entry.tags.add(tag);
    if (t.tastedOn > entry.last.tastedOn) entry.last = t;
    labels.set(t.expressionId, entry);
  }
  return { tastingsByCategory, totalTastings: data.tastings.length, labels };
}

function qualifies(data: TonightData, facts: Facts, categoryId: number): boolean {
  return spiritQualifies({ tastings: facts.tastingsByCategory.get(categoryId) ?? 0, hasWheel: data.hasWheel(categoryId) }, facts.totalTastings);
}

function candidateOf(data: TonightData, facts: Facts, b: ShelfBottle): Candidate {
  const label = facts.labels.get(b.expressionId);
  return {
    id: b.id,
    categoryId: b.categoryId,
    sealed: b.sealed,
    proof: b.proof,
    tags: label ? [...label.tags] : [],
    daysSinceTasted: label ? daysBetween(label.last.tastedOn, data.today) : null,
    spiritQualifies: qualifies(data, facts, b.categoryId),
  };
}

// ---- The steps ----

export type TonightOptions = {
  limits: { minSpiritTastings: number; minTotalTastings: number };
  spirits: { categoryId: number; name: string; open: number; sealed: number; muted: number; tastings: number; flavors: boolean }[];
  proof: { applies: boolean; lo: number | null; hi: number | null; bands: { key: BandKey; label: string; range: string; count: number }[] };
  flavors: {
    enabled: boolean;
    /** Flavors tasted most for the chosen spirits that qualify, most first. */
    tags: { key: string; label: string; count: number }[];
    /** Chosen spirits left out of the list for having too few tastings or no wheel. */
    skipped: { categoryId: number; name: string; tastings: number }[];
  };
  /** When flavors are off: what "Time to open a new bottle?" offers. */
  fallback: { tastings: number; spirits: string[]; open: number; sealed: number } | null;
};

/** Everything the steps show for the selection so far (spirits and the sealed switch; proof and flavors come later). */
export function optionsFor(data: TonightData, sel: ShelfChoice): TonightOptions {
  const facts = factsOf(data);

  const byCategory = new Map<number, { name: string; open: number; sealed: number; muted: number }>();
  for (const b of data.bottles) {
    const row = byCategory.get(b.categoryId) ?? { name: b.category, open: 0, sealed: 0, muted: 0 };
    if (isMuted(b, data.today)) row.muted++;
    else if (b.sealed) row.sealed++;
    else row.open++;
    byCategory.set(b.categoryId, row);
  }
  const spirits = [...byCategory.entries()]
    .map(([categoryId, row]) => ({ categoryId, ...row, tastings: facts.tastingsByCategory.get(categoryId) ?? 0, flavors: qualifies(data, facts, categoryId) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const play = inPlay(data, sel);
  const proofs = play.map((b) => b.proof);
  const counts = bandCounts(proofs);
  const known = proofs.filter((p): p is number => p !== null);

  // Flavors come from the chosen spirits that qualify; the rest are skipped, and say so.
  const inSelection = spirits.filter((s) => sel.categories.length === 0 || sel.categories.includes(s.categoryId));
  const qualifying = inSelection.filter((s) => s.flavors);
  const skipped = inSelection.filter((s) => !s.flavors).map((s) => ({ categoryId: s.categoryId, name: s.name, tastings: s.tastings }));
  const qualifyingIds = new Set(qualifying.map((s) => s.categoryId));
  const tagCounts = new Map<string, number>();
  for (const t of data.tastings) {
    if (!qualifyingIds.has(t.categoryId)) continue;
    for (const tag of new Set(t.tags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const tags = [...tagCounts.entries()]
    .map(([key, count]) => ({ key, label: data.flavorLabel(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const enabled = facts.totalTastings >= MIN_TOTAL_TASTINGS && tags.length > 0;

  let fallback: TonightOptions["fallback"] = null;
  if (!enabled) {
    // Normally the spirits short of tastings. If they all qualify but none has chosen a flavor yet, all of them.
    const short = inSelection.filter((s) => !s.flavors);
    const left = short.length > 0 ? short : inSelection;
    const ids = new Set(left.map((s) => s.categoryId));
    const mine = data.bottles.filter((b) => ids.has(b.categoryId) && !isMuted(b, data.today));
    fallback = {
      tastings: left.reduce((sum, s) => sum + s.tastings, 0),
      spirits: left.map((s) => s.name),
      open: mine.filter((b) => !b.sealed).length,
      sealed: mine.filter((b) => b.sealed).length,
    };
  }

  return {
    limits: { minSpiritTastings: MIN_SPIRIT_TASTINGS, minTotalTastings: MIN_TOTAL_TASTINGS },
    spirits,
    proof: {
      applies: proofApplies(proofs),
      lo: known.length ? Math.min(...known) : null,
      hi: known.length ? Math.max(...known) : null,
      bands: BANDS.map((band) => ({ key: band.key, label: band.label, range: band.range, count: counts[band.key] })),
    },
    flavors: { enabled, tags, skipped },
    fallback,
  };
}

// ---- The pick ----

export type PickRequest = Selection & {
  mode: "flow" | "roulette";
  /** The fallback's two buttons: only sealed bottles, or only open ones, whatever the switch says. */
  only?: "sealed" | "open";
  /** Bottle ids already shown tonight. */
  exclude: number[];
};

export type TonightPick = {
  bottle: {
    id: number;
    expressionId: number;
    brand: string;
    name: string;
    categoryId: number;
    category: string;
    sealed: boolean;
    fillPct: number;
    proof: number | null;
    dateAcquired: string | null;
    thumbPath: string | null;
    lastTasted: { on: string; rating: number | null; daysAgo: number } | null;
  };
  why: string[];
  /** How many more bottles could still be drawn after this one. */
  left: number;
} | null;

/** The pool a request draws from, before anything is excluded or weighed. */
function poolFor(data: TonightData, req: PickRequest): ShelfBottle[] {
  if (req.mode === "roulette") return inPlay(data, { categories: [], sealed: req.sealed });
  const sealedOk = req.only === "sealed" || (req.only !== "open" && req.sealed);
  const play = data.bottles.filter((b) => chosen(req, b) && !isMuted(b, data.today) && (b.sealed ? sealedOk : req.only !== "sealed"));
  return play.filter((b) => inBands(b.proof, req.bands));
}

export function pickFor(data: TonightData, req: PickRequest, random: () => number = Math.random): TonightPick {
  const facts = factsOf(data);
  const pool = poolFor(data, req).filter((b) => !req.exclude.includes(b.id));
  const flavors = req.mode === "flow" && !req.only ? req.flavors : [];

  const candidates = new Map(pool.map((b) => [b.id, candidateOf(data, facts, b)]));
  const bottle =
    req.mode === "roulette"
      ? drawUniform(pool, random)
      : drawWeighted(pool, (b) => weightOf(candidates.get(b.id)!, flavors), random);
  if (!bottle) return null;

  const candidate = candidates.get(bottle.id)!;
  const label = facts.labels.get(bottle.expressionId);
  return {
    bottle: {
      id: bottle.id,
      expressionId: bottle.expressionId,
      brand: bottle.brand,
      name: bottle.name,
      categoryId: bottle.categoryId,
      category: bottle.category,
      sealed: bottle.sealed,
      fillPct: bottle.fillPct,
      proof: bottle.proof,
      dateAcquired: bottle.dateAcquired,
      thumbPath: bottle.thumbPath,
      lastTasted: label ? { on: label.last.tastedOn, rating: label.last.rating, daysAgo: daysBetween(label.last.tastedOn, data.today) } : null,
    },
    // Roulette is not steered by anything, so it has nothing to explain beyond how long ago it was tasted.
    why: req.mode === "roulette" ? [] : reasonsFor({ candidate, flavors, flavorLabel: data.flavorLabel, spiritName: bottle.category }),
    left: pool.length - 1,
  };
}
