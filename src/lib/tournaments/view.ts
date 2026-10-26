import { mashbillDisplay } from "./grains";
import { autoLabel, heatBand } from "./grouping";
import { entryKind, type EntryKind } from "./entrants";
import { planRounds, standings, type HeatResult } from "./rounds";
import type { Entrant } from "./types";

export type TournamentRow = {
  id: number;
  name: string;
  status: "draft" | "active" | "complete";
  heatSize: number;
  seeding: "similar" | "random";
  groupOrder: string[];
  blind: boolean;
  fieldNote: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};
export type EntryRow = {
  id: number;
  displayName: string;
  status: "active" | "withdrawn";
  bottleId: number | null;
  expressionId: number | null;
  seed: number;
};
export type HeatRow = { id: number; round: number; slot: number; label: string | null; status: "pending" | "decided" | "bye" };
export type HeatEntryRow = { heatId: number; entryId: number; place: number | null; glass: string | null };

/** What the view is built from: the rows, and what the grouping knows about each entry (see `loadEntrants`). */
export type ViewInput = {
  tournament: TournamentRow;
  entries: EntryRow[];
  heats: HeatRow[];
  heatEntries: HeatEntryRow[];
  entrants: ReadonlyMap<number, Entrant>;
};

export type ViewEntry = {
  id: number;
  name: string;
  status: "active" | "withdrawn";
  kind: EntryKind;
  bottleId: number | null;
  expressionId: number | null;
  /** The leaf category name of the entry's label ("Bourbon"); null for an outside entry. */
  category: string | null;
  /** The label's finish names in listed order. */
  finishes: string[];
};

/** A heat's entry as the owner sees it. */
export type ViewHeatEntry = {
  entryId: number;
  name: string;
  place: number | null;
  glass: string | null;
  proof: number | null;
  mashbill: string | null;
  ageYears: number | null;
  ageDisplay?: string | null;
  ageInferred?: boolean;
  spiritFact?: string | null;
  distilleries: string[];
  category: string | null;
  finishes: string[];
};

export type ViewHeat = {
  id: number;
  round: number;
  slot: number;
  status: "pending" | "decided" | "bye";
  /** The owner's own name for the heat, or null; withheld (null) for a hidden heat, since a name chosen at draft time can give the glass away. */
  label: string | null;
  /** The heat's generated name from what its bottles share ("Buffalo Trace · High rye bourbons"; "Mixed" when nothing is shared); null only for an empty or hidden heat. Never the proof band. */
  autoLabel: string | null;
  /** "90 to 94 proof"; empty when a proof is unknown. Shown even for a hidden heat. */
  band: string;
  /** True for a pending heat of an active blind tournament: names, facts and entry ids are withheld. */
  hidden: boolean;
  entryCount: number;
  /** The glass letters set so far, in order; for a hidden heat this is all that is known of its entries. */
  glasses: string[];
  entries: ViewHeatEntry[];
};

export type ViewStanding = { entryId: number; name: string; rank: number; round: number; place: number | null };

export type TournamentView = {
  id: number;
  name: string;
  status: TournamentRow["status"];
  heatSize: number;
  seeding: TournamentRow["seeding"];
  groupOrder: string[];
  blind: boolean;
  fieldNote: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  entries: ViewEntry[];
  rounds: { round: number; heats: ViewHeat[] }[];
  /** Heats per round, from the field's size to the final, assuming no one withdraws. Empty under two entrants. */
  plan: number[];
  currentRound: number | null;
  /** Heats of the current round that are decided or byes, out of all of them. */
  progress: { done: number; total: number };
  /** Who finished where, once at least one heat has a result. Names are revealed, since those heats are decided. */
  standings: ViewStanding[];
  champion: { entryId: number; name: string } | null;
};

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** A tournament as the API returns it, with the blind rule applied: a pending heat of an active blind one is hidden. */
export function buildView(input: ViewInput): TournamentView {
  const { tournament, entries, heats, heatEntries, entrants } = input;
  const nameOf = new Map(entries.map((e) => [e.id, e.displayName]));
  const byHeat = new Map<number, HeatEntryRow[]>();
  for (const row of heatEntries) byHeat.set(row.heatId, [...(byHeat.get(row.heatId) ?? []), row]);

  const hideBlind = tournament.status === "active" && tournament.blind;
  const viewHeat = (heat: HeatRow): ViewHeat => {
    const rows = [...(byHeat.get(heat.id) ?? [])].sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || a.entryId - b.entryId);
    const members = rows.map((r) => entrants.get(r.entryId)).filter((e): e is Entrant => e !== undefined);
    const hidden = hideBlind && heat.status === "pending";
    const glasses = rows.map((r) => r.glass).filter((g): g is string => g !== null).sort();
    return {
      id: heat.id,
      round: heat.round,
      slot: heat.slot,
      status: heat.status,
      label: hidden ? null : heat.label,
      autoLabel: hidden ? null : autoLabel(members),
      band: heatBand(members),
      hidden,
      entryCount: rows.length,
      glasses,
      entries: hidden
        ? []
        : rows.map((r) => {
            const e = entrants.get(r.entryId);
            return {
              entryId: r.entryId,
              name: nameOf.get(r.entryId) ?? "",
              place: r.place,
              glass: r.glass,
              proof: e?.proof ?? null,
              mashbill: e?.mashbill ? mashbillDisplay(e.mashbill) || null : null,
              ageYears: e?.ageYears ?? null,
              ageDisplay: e?.ageDisplay ?? null,
              ageInferred: e?.ageInferred ?? false,
              spiritFact: e?.spiritFact ?? null,
              distilleries: e?.distilleries ?? [],
              category: e?.category ?? null,
              finishes: e?.finishes ?? [],
            };
          }),
    };
  };

  const ordered = [...heats].sort((a, b) => a.round - b.round || a.slot - b.slot);
  const rounds = [...new Set(ordered.map((h) => h.round))].map((round) => ({
    round,
    heats: ordered.filter((h) => h.round === round).map(viewHeat),
  }));
  const currentRound = rounds.length > 0 ? rounds[rounds.length - 1]!.round : null;
  const currentHeats = rounds.length > 0 ? rounds[rounds.length - 1]!.heats : [];

  const results: HeatResult[] = ordered
    .filter((h) => h.status !== "pending")
    .map((h) => ({
      round: h.round,
      kind: h.status === "bye" ? "bye" : "ranked",
      entries: (byHeat.get(h.id) ?? []).map((r) => ({ entryId: r.entryId, place: r.place })),
    }));
  const rankedAnything = results.some((r) => r.kind === "ranked");
  const standing = rankedAnything
    ? standings(results).map((s) => ({ entryId: s.entryId, name: nameOf.get(s.entryId) ?? "", rank: s.rank, round: s.round, place: s.place }))
    : [];

  const activeCount = entries.filter((e) => e.status === "active").length;
  const champion = tournament.status === "complete" ? standing.find((s) => s.rank === 1) : undefined;
  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    heatSize: tournament.heatSize,
    seeding: tournament.seeding,
    groupOrder: tournament.groupOrder,
    blind: tournament.blind,
    fieldNote: tournament.fieldNote,
    createdAt: tournament.createdAt.toISOString(),
    startedAt: iso(tournament.startedAt),
    completedAt: iso(tournament.completedAt),
    entries: [...entries]
      .sort((a, b) => a.seed - b.seed || a.id - b.id)
      .map((e) => {
        const facts = entrants.get(e.id);
        return {
          id: e.id,
          name: e.displayName,
          status: e.status,
          kind: entryKind(e),
          bottleId: e.bottleId,
          expressionId: e.expressionId,
          category: facts?.category ?? null,
          finishes: facts?.finishes ?? [],
        };
      }),
    rounds,
    plan: activeCount >= 2 ? planRounds(activeCount, tournament.heatSize) : [],
    currentRound,
    progress: { done: currentHeats.filter((h) => h.status !== "pending").length, total: currentHeats.length },
    standings: standing,
    champion: champion ? { entryId: champion.entryId, name: champion.name } : null,
  };
}
