import { sortEntrants } from "./keys";
import type { Entrant, GroupKey } from "./types";

/** The list cut into heats of `heatSize`: only the last may be short, and a heat of one is a bye. */
function cutIntoHeats(list: readonly Entrant[], heatSize: number): Entrant[][] {
  if (!Number.isInteger(heatSize) || heatSize < 2 || heatSize > 6) throw new RangeError("heatSize must be a whole number from 2 to 6");
  const heats: Entrant[][] = [];
  for (let i = 0; i < list.length; i += heatSize) heats.push(list.slice(i, i + heatSize));
  return heats;
}

/**
 * The entrants cut into heats of `heatSize` in similarity order. Only the last heat may be short, and a heat of one
 * is a bye. Every flight is cut at `heatSize`, even where it straddles two groups of the first key.
 * Throws a RangeError unless `heatSize` is a whole number from 2 to 6.
 */
export function groupIntoHeats(entrants: readonly Entrant[], order: readonly GroupKey[], heatSize: number): Entrant[][] {
  return cutIntoHeats(sortEntrants(entrants, order), heatSize);
}

/**
 * The entrants shuffled and cut into heats of `heatSize` (seeding "random"). `random` returns a number from 0 up to
 * but not including 1; pass a seeded one to get the same shuffle again. Same size rules as `groupIntoHeats`.
 */
export function groupAtRandom(entrants: readonly Entrant[], heatSize: number, random: () => number = Math.random): Entrant[][] {
  const shuffled = [...entrants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return cutIntoHeats(shuffled, heatSize);
}

/** A heat's proof span as it reads: "90 to 94 proof", "100 proof", or empty when any proof is unknown. */
export function heatBand(heat: readonly Entrant[]): string {
  const proofs = heat.map((e) => e.proof);
  if (heat.length === 0 || proofs.some((p) => p === null)) return "";
  const known = proofs as number[];
  const low = Math.min(...known);
  const high = Math.max(...known);
  return low === high ? `${low} proof` : `${low} to ${high} proof`;
}

export { autoLabel } from "./flight-title";
