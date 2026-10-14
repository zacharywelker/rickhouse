import { mashbillDisplay } from "./grains";
import { sortEntrants } from "./keys";
import type { Entrant, GroupKey } from "./types";

/**
 * The entrants cut into heats of `heatSize` in similarity order. Only the last heat may be short, and a heat of one
 * is a bye. Every flight is cut at `heatSize`, even where it straddles two groups of the first key.
 */
export function groupIntoHeats(entrants: readonly Entrant[], order: readonly GroupKey[], heatSize: number): Entrant[][] {
  const sorted = sortEntrants(entrants, order);
  const heats: Entrant[][] = [];
  for (let i = 0; i < sorted.length; i += heatSize) heats.push(sorted.slice(i, i + heatSize));
  return heats;
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

/** The one value every item shares, or null when any is missing or they differ. */
function shared(values: readonly (string | null)[]): string | null {
  const first = values[0];
  return first !== null && first !== undefined && values.every((v) => v === first) ? first : null;
}

/**
 * A heat's generated label, from what its bottles share: a shared mashbill (by name or recipe) with a shared
 * distillery in front of it. Null when they share neither, so the caller falls back to the proof band.
 */
export function autoLabel(heat: readonly Entrant[]): string | null {
  const distillery = shared(
    heat.map((e) => (e.distilleries.length === 0 ? null : e.distilleries.length > 1 ? "Blend" : e.distilleries[0]!.trim())),
  );
  const mashbill = shared(heat.map((e) => (e.mashbill === null ? null : mashbillDisplay(e.mashbill))));
  if (distillery !== null && mashbill !== null) {
    return mashbill.toLowerCase().includes(distillery.toLowerCase()) ? mashbill : `${distillery} ${mashbill}`;
  }
  return mashbill ?? distillery;
}
