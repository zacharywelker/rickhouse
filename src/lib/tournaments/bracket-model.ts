import { GROUP_KEY_LABELS } from "./priority";
import { advanceCount, advancers } from "./rounds";
import type { GroupKey } from "./types";
import type { TournamentView, ViewHeat, ViewHeatEntry } from "./view";

export type FlightTitle = { text: string; yours: boolean };

export type RowModel = {
  entryId: number;
  name: string;
  proof: string;
  mashbill: string;
  age: string;
  /** The spirit category ("Bourbon", "Rye"); null for an outside entry or when unknown. */
  category: string | null;
  distilleries: string[];
  finishes: string[];
  /** True when no proof is recorded, so the grouping put the bottle last. */
  unknownProof: boolean;
  place: number | null;
  /** In a decided flight: this bottle goes through to the next round. */
  advanced: boolean;
  glass: string | null;
};

export type FlightModel = {
  id: number;
  /** Its position in the round, from 1; slots can have gaps after a flight is emptied. */
  number: number;
  status: ViewHeat["status"];
  title: FlightTitle;
  /** The line under the title: "Flight 2 · 90 to 100 proof". */
  meta: string;
  hidden: boolean;
  /** How many bottles it holds, also for a hidden flight. */
  count: number;
  /** For a hidden flight: how many glasses have a letter so far. */
  glassesSet: number;
  rows: RowModel[];
};

export type RoundColumn = {
  kind: "round";
  round: number;
  /** "Round 1", or "Final" when the round is one flight. */
  heading: string;
  /** "decided" or "now" once the tournament runs; null while it is a preview. */
  state: "decided" | "now" | null;
  count: string;
  note: string;
  flights: FlightModel[];
};

export type PlannedColumn = {
  kind: "planned";
  round: number;
  heading: string;
  count: string;
  note: string;
  title: string;
  fill: string;
};

export type BracketModel = {
  columns: (RoundColumn | PlannedColumn)[];
  /** Bottles in the first round that have no proof, for the preview note. */
  unknownProof: number;
  /** Flights you named yourself, in the rounds shown. */
  renamed: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const bottlesText = (n: number) => plural(n, "bottle");

export const formatProof = (proof: number | null): string => (proof === null ? "—" : String(proof));
export const formatAge = (years: number | null): string => (years === null ? "—" : `${Number(years.toFixed(1))} yr`);

/** Lowest to highest proof for the pour, unknown proof last; ties by name, then id, so the order is stable. */
export function pourOrder(entries: ViewHeatEntry[]): ViewHeatEntry[] {
  return [...entries].sort(
    (a, b) =>
      (a.proof ?? Number.POSITIVE_INFINITY) - (b.proof ?? Number.POSITIVE_INFINITY) || a.name.localeCompare(b.name) || a.entryId - b.entryId,
  );
}

/**
 * A flight's title: your own name wins and is marked yours; else what its bottles share (the engine's generated name,
 * never the proof band, which the meta line carries); else its number. A hidden
 * flight (pending in a running blind tournament) shows only its band: even a name you gave it could give the glass away.
 */
export function flightTitle(heat: ViewHeat, number: number): FlightTitle {
  if (heat.hidden) return { text: heat.band || `Flight ${number}`, yours: false };
  const custom = heat.label?.trim();
  if (custom) return { text: custom, yours: true };
  return { text: heat.autoLabel ?? `Flight ${number}`, yours: false };
}

function flightModel(heat: ViewHeat, number: number, final: boolean, draft: boolean): FlightModel {
  const title = flightTitle(heat, number);
  const metaParts: string[] = [];
  if (title.text !== `Flight ${number}`) metaParts.push(`Flight ${number}`);
  if (heat.band && title.text !== heat.band) metaParts.push(heat.band);
  if (!heat.hidden && !heat.band && heat.entries.length > 0) metaParts.push("Proof unknown for some");
  if (heat.status === "bye") metaParts.push("Bye");

  // Nobody advances out of a final; the champion line shows who won. A draft decides nothing, so a lone bottle (a bye) has not advanced yet.
  const finished = heat.status !== "pending" && !final && !draft;
  const through = new Set(
    finished
      ? advancers({
          round: heat.round,
          kind: heat.status === "bye" ? "bye" : "ranked",
          entries: heat.entries.map((e) => ({ entryId: e.entryId, place: e.place })),
        })
      : [],
  );
  const ordered = heat.status === "decided" ? heat.entries : pourOrder(heat.entries);
  return {
    id: heat.id,
    number,
    status: heat.status,
    title,
    meta: metaParts.join(" · "),
    hidden: heat.hidden,
    count: heat.entryCount,
    glassesSet: heat.glasses.length,
    rows: ordered.map((e) => ({
      entryId: e.entryId,
      name: e.name,
      proof: formatProof(e.proof),
      mashbill: e.spiritFact ?? e.mashbill ?? "—",
      age: e.ageDisplay ?? formatAge(e.ageYears),
      category: e.category,
      distilleries: e.distilleries,
      finishes: e.finishes,
      unknownProof: e.proof === null,
      place: e.place,
      advanced: through.has(e.entryId),
      glass: e.glass,
    })),
  };
}

/** "Top 2 of each flight advance"; with short flights in the mix, "Flights of 4 advance 2, flights of 3 advance 1". */
export function advanceNote(sizes: readonly number[], past: boolean): string {
  const verb = past ? "advanced" : "advance";
  const bySize = [...new Set(sizes)].sort((a, b) => b - a);
  if (new Set(bySize.map(advanceCount)).size <= 1) return `Top ${advanceCount(bySize[0] ?? 1)} of each flight ${verb}`;
  const parts = bySize.map((size) => `${size === 1 ? "byes" : `flights of ${size}`} ${verb} ${advanceCount(size)}`).join(", ");
  return parts.charAt(0).toUpperCase() + parts.slice(1);
}

/** The rounds after the last real one, as bottle and flight counts: each round's advancers are cut into flights of `heatSize`. */
export function plannedRounds(lastSizes: readonly number[], heatSize: number): { bottles: number; flights: number }[] {
  const out: { bottles: number; flights: number }[] = [];
  if (lastSizes.length <= 1 || heatSize < 2) return out;
  let pool = lastSizes.reduce((sum, s) => sum + advanceCount(s), 0);
  while (pool >= 2) {
    out.push({ bottles: pool, flights: Math.ceil(pool / heatSize) });
    if (pool <= heatSize) break;
    let next = 0;
    for (let left = pool; left > 0; left -= heatSize) next += advanceCount(Math.min(heatSize, left));
    pool = next;
  }
  return out;
}

/** Turns a tournament into what the bracket draws: a column per round (real flights, then the rounds still to come as counts). */
export function buildBracketModel(view: Pick<TournamentView, "status" | "heatSize" | "seeding" | "groupOrder" | "rounds" | "currentRound">): BracketModel {
  const columns: BracketModel["columns"] = [];
  let renamed = 0;
  for (const { round, heats } of view.rounds) {
    const final = heats.length === 1;
    const flights = heats.map((h, i) => flightModel(h, i + 1, final, view.status === "draft"));
    renamed += heats.filter((h) => h.label?.trim()).length;
    const allDone = heats.every((h) => h.status !== "pending");
    columns.push({
      kind: "round",
      round,
      heading: final ? "Final" : `Round ${round}`,
      state: view.status === "draft" ? null : allDone ? "decided" : round === view.currentRound ? "now" : null,
      count: bottlesText(heats.reduce((sum, h) => sum + h.entryCount, 0)),
      note: final ? "Place 1 is the champion" : advanceNote(heats.map((h) => h.entryCount), allDone),
      flights,
    });
  }

  const last = view.rounds[view.rounds.length - 1];
  if (last) {
    const first = view.groupOrder[0] as GroupKey | undefined;
    const regroup = view.seeding === "random" ? "Reshuffled" : `Regrouped by ${(first ? GROUP_KEY_LABELS[first] : "proof").toLowerCase()}`;
    const later = plannedRounds(last.heats.map((h) => h.entryCount), view.heatSize);
    let before = columns[columns.length - 1]!.heading;
    later.forEach((p, i) => {
      const final = i === later.length - 1;
      const heading = final ? "Final" : `Round ${last.round + 1 + i}`;
      columns.push({
        kind: "planned",
        round: last.round + 1 + i,
        heading,
        count: bottlesText(p.bottles),
        note: final ? "Place 1 is the champion" : `${regroup} once ${before.toLowerCase()} is decided`,
        title: final ? "Final flight" : plural(p.flights, "flight"),
        fill: `Fills after ${before.toLowerCase()}`,
      });
      before = heading;
    });
  }

  const firstColumn = columns[0];
  const unknownProof = firstColumn?.kind === "round" ? firstColumn.flights.reduce((n, f) => n + f.rows.filter((r) => r.unknownProof).length, 0) : 0;
  return { columns, unknownProof, renamed };
}
