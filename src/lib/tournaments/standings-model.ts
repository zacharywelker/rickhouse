import type { TournamentView } from "./view";

export type StandingRow = {
  entryId: number;
  /** "1", or "2=" when it shares the place with another. */
  place: string;
  name: string;
  /** "Champion", "Out in round 2", or "Out in the final" for second place on. */
  left: string;
  champion: boolean;
};

/**
 * Display rows from the view's standings: the engine's ranks (1, 2, 2, 4) shown as places, a shared one marked "2=".
 * Empty until a flight has been decided. The champion is only called one once the tournament is finished.
 */
export function standingRows(view: Pick<TournamentView, "standings" | "champion" | "rounds" | "status">): StandingRow[] {
  const shared = new Map<number, number>();
  for (const s of view.standings) shared.set(s.rank, (shared.get(s.rank) ?? 0) + 1);
  const finalRound = view.rounds.length > 0 ? view.rounds[view.rounds.length - 1]!.round : null;
  return view.standings.map((s) => {
    const champion = view.champion?.entryId === s.entryId;
    return {
      entryId: s.entryId,
      place: (shared.get(s.rank) ?? 1) > 1 ? `${s.rank}=` : String(s.rank),
      name: s.name,
      // While it runs, a bottle that advanced has not left: say only where it last poured.
      left: view.status !== "complete" ? `Last flight: round ${s.round}` : champion ? "Champion" : s.round === finalRound && view.champion ? "Out in the final" : `Out in round ${s.round}`,
      champion,
    };
  });
}
