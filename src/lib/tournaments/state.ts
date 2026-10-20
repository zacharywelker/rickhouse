import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadEntrants } from "./facts";
import { buildView, type EntryRow, type HeatEntryRow, type HeatRow, type TournamentRow, type TournamentView } from "./view";

const { tournaments, tournamentEntries, tournamentHeats, tournamentHeatEntries } = schema;

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A command that could not be done: the API answers with `status` and `message` (and `fields` for a bad input). */
export type Failure = { ok: false; status: 404 | 409 | 422; message: string; fields?: Record<string, string> };
export const fail = (status: Failure["status"], message: string, fields?: Record<string, string>): Failure => ({
  ok: false,
  status,
  message,
  ...(fields ? { fields } : {}),
});

export const GONE = "That tournament is gone.";

function toRow(row: typeof tournaments.$inferSelect): TournamentRow {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    heatSize: row.heatSize,
    seeding: row.seeding,
    groupOrder: row.groupOrder,
    blind: row.blind,
    fieldNote: row.fieldNote,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

/** The owner's tournament, locked for the rest of the transaction so two commands cannot interleave; null when it is not theirs. */
export async function lockTournament(tx: Tx, ownerId: number, id: number): Promise<TournamentRow | null> {
  const [row] = await tx
    .select()
    .from(tournaments)
    .where(and(eq(tournaments.id, id), eq(tournaments.ownerId, ownerId)))
    .for("update");
  return row ? toRow(row) : null;
}

export async function readState(tx: Tx, id: number): Promise<{ entries: EntryRow[]; heats: HeatRow[]; heatEntries: HeatEntryRow[] }> {
  const entries = await tx
    .select({
      id: tournamentEntries.id,
      displayName: tournamentEntries.displayName,
      status: tournamentEntries.status,
      bottleId: tournamentEntries.bottleId,
      expressionId: tournamentEntries.expressionId,
      seed: tournamentEntries.seed,
    })
    .from(tournamentEntries)
    .where(eq(tournamentEntries.tournamentId, id))
    .orderBy(asc(tournamentEntries.seed), asc(tournamentEntries.id));
  const heats = await tx
    .select({
      id: tournamentHeats.id,
      round: tournamentHeats.round,
      slot: tournamentHeats.slot,
      label: tournamentHeats.label,
      status: tournamentHeats.status,
    })
    .from(tournamentHeats)
    .where(eq(tournamentHeats.tournamentId, id))
    .orderBy(asc(tournamentHeats.round), asc(tournamentHeats.slot));
  const heatEntries = await tx
    .select({
      heatId: tournamentHeatEntries.heatId,
      entryId: tournamentHeatEntries.entryId,
      place: tournamentHeatEntries.place,
      glass: tournamentHeatEntries.glass,
    })
    .from(tournamentHeatEntries)
    .where(eq(tournamentHeatEntries.tournamentId, id));
  return { entries, heats, heatEntries };
}

/** The tournament as the API returns it, read fresh; null when it is not the owner's. */
export async function viewOf(tx: Tx, ownerId: number, id: number): Promise<TournamentView | null> {
  const [row] = await tx
    .select()
    .from(tournaments)
    .where(and(eq(tournaments.id, id), eq(tournaments.ownerId, ownerId)));
  if (!row) return null;
  const { entries, heats, heatEntries } = await readState(tx, id);
  const entrants = await loadEntrants(tx, ownerId, entries);
  return buildView({ tournament: toRow(row), entries, heats, heatEntries, entrants });
}
