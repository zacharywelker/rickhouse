import type { TournamentSummary } from "./queries";

type Summary = Pick<TournamentSummary, "status" | "currentRound" | "totalRounds" | "progress">;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The short status line of the list: "Draft", "Round 2 of 4 · 3 of 6 flights decided", "Complete". The champion's name
 * needs the whole tournament, so the list says only that it is complete.
 */
export function statusLine(summary: Summary): string {
  if (summary.status === "draft") return "Draft";
  if (summary.status === "complete") return "Complete";
  const { currentRound, totalRounds, progress } = summary;
  if (currentRound === null) return "Running";
  const round = totalRounds >= currentRound ? `Round ${currentRound} of ${totalRounds}` : `Round ${currentRound}`;
  return `${round} · ${progress.done} of ${plural(progress.total, "flight", "flights")} decided`;
}

export const entriesLabel = (count: number): string => plural(count, "entry", "entries");

export const heatSizeLabel = (heatSize: number): string => `flights of ${heatSize}`;
