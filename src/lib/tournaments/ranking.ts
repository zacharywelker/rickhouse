import { PROOF_BAND } from "./keys";

/** Fewer heats than this and a competitor's rank is provisional, not firm. */
export const FIRM_HEATS = 3;
/** How strongly strengths are pulled toward the average, in pseudo-heats against a fixed average competitor. */
export const PRIOR_WEIGHT = 0.5;

/** Code-unit order, so ids sort the same on every host (localeCompare depends on the locale). */
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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
  const ids = [...new Set(heats.flat())].sort(compareText);
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
  const ordered = [...members.values()].map((m) => m.sort(compareText)).sort((a, b) => b.length - a.length || compareText(a[0]!, b[0]!));
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
  // A competitor counts once per heat, at its best place; a heat left with fewer than two is no contest.
  const deduped = heats.map((h) => ({ ranking: h.ranking.filter((c, i) => h.ranking.findIndex((o) => o.id === c.id) === i) }));
  const usable = deduped.filter((h) => h.ranking.length >= 2);
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
    .sort((a, b) => a.group - b.group || a.rank - b.rank || compareText(a.id, b.id));
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
  return rows.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || compareText(a.id, b.id));
}
