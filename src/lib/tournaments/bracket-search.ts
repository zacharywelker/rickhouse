import type { TournamentView } from "./view";

export type Match = { entryId: number; heatId: number; round: number };

/** Lower case with accents removed, so "Pappy" finds "Pàppy" and either case finds either. */
export const fold = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Where a bottle is, by name: every word of the query must be in the name. Rounds in order, flights in order, so
 * "next" walks the page top to bottom. A hidden flight has no names in the view, so it can never match.
 */
export function matchEntries(view: Pick<TournamentView, "rounds">, query: string): Match[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const out: Match[] = [];
  for (const { round, heats } of view.rounds) {
    for (const heat of heats) {
      if (heat.hidden) continue;
      for (const e of heat.entries) {
        const name = fold(e.name);
        if (words.every((w) => name.includes(w))) out.push({ entryId: e.entryId, heatId: heat.id, round });
      }
    }
  }
  return out;
}

/** The match after (1) or before (-1) the current one, wrapping round; null when there is none. */
export function stepMatch(count: number, current: number | null, direction: 1 | -1): number | null {
  if (count === 0) return null;
  if (current === null) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}
