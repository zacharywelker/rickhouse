import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadEntrants } from "./facts";
import { groupAtRandom, groupIntoHeats } from "./grouping";
import { nextPool, type HeatResult } from "./rounds";
import type { GroupKey } from "./types";
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

/**
 * Cuts the given entries into heats and adds them to `round`, numbered on after any heats already there. Similar
 * seeding matches them by the tournament's key order; random shuffles them. A heat of one is a bye.
 */
export async function generateRound(tx: Tx, ownerId: number, t: TournamentRow, round: number, entryIds: number[]): Promise<void> {
  if (entryIds.length === 0) return;
  const rows = await tx
    .select({
      id: tournamentEntries.id,
      displayName: tournamentEntries.displayName,
      bottleId: tournamentEntries.bottleId,
      expressionId: tournamentEntries.expressionId,
    })
    .from(tournamentEntries)
    .where(and(eq(tournamentEntries.tournamentId, t.id), inArray(tournamentEntries.id, entryIds)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = entryIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const entrants = await loadEntrants(tx, ownerId, ordered);
  const list = ordered.map((r) => entrants.get(r.id)!);
  const groups = t.seeding === "random" ? groupAtRandom(list, t.heatSize) : groupIntoHeats(list, t.groupOrder as GroupKey[], t.heatSize);

  const [top] = await tx
    .select({ slot: sql<number>`coalesce(max(${tournamentHeats.slot}), 0)`.mapWith(Number) })
    .from(tournamentHeats)
    .where(and(eq(tournamentHeats.tournamentId, t.id), eq(tournamentHeats.round, round)));
  let slot = top?.slot ?? 0;
  for (const group of groups) {
    slot += 1;
    const [heat] = await tx
      .insert(tournamentHeats)
      .values({ tournamentId: t.id, round, slot, status: group.length === 1 ? "bye" : "pending" })
      .returning({ id: tournamentHeats.id });
    await tx.insert(tournamentHeatEntries).values(group.map((e) => ({ heatId: heat!.id, entryId: e.id, tournamentId: t.id })));
  }
}

/**
 * Moves a finished round on. When every heat of the current round is decided (a bye counts), the next round is made
 * from the advancers, less anyone withdrawn; and when the round was a single heat, or fewer than two remain, the
 * tournament is complete. Does nothing while any heat of the round is still pending.
 */
export async function settle(tx: Tx, ownerId: number, t: TournamentRow): Promise<void> {
  const { entries, heats, heatEntries } = await readState(tx, t.id);
  if (heats.length === 0) return;
  const round = Math.max(...heats.map((h) => h.round));
  const roundHeats = heats.filter((h) => h.round === round);
  if (roundHeats.some((h) => h.status === "pending")) return;

  const withdrawn = new Set(entries.filter((e) => e.status === "withdrawn").map((e) => e.id));
  const results: HeatResult[] = roundHeats.map((h) => ({
    round,
    kind: h.status === "bye" ? "bye" : "ranked",
    entries: heatEntries.filter((r) => r.heatId === h.id).map((r) => ({ entryId: r.entryId, place: r.place })),
  }));
  const pool = nextPool(results, withdrawn);
  if (roundHeats.length === 1 || pool.length < 2) {
    await tx.update(tournaments).set({ status: "complete", completedAt: new Date() }).where(eq(tournaments.id, t.id));
    return;
  }
  await generateRound(tx, ownerId, t, round + 1, pool);
}
