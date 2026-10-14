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

/** How many heats each round has, from the field's size to the final (no withdrawals). 12 bottles of 4: [3, 2, 1]. Throws unless heatSize is a whole number of at least 1. */
export function planRounds(entrantCount: number, heatSize: number): number[] {
  if (!Number.isInteger(heatSize) || heatSize < 1) throw new RangeError("heatSize must be a whole number of at least 1");
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
