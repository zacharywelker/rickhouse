import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { planRounds } from "./rounds";
import { viewOf } from "./state";
import type { TournamentView } from "./view";

const { tournaments, tournamentEntries, tournamentHeats } = schema;

/** One tournament, as the API returns it, or null when it is not the owner's. */
export async function getTournament(ownerId: number, id: number): Promise<TournamentView | null> {
  return db.transaction((tx) => viewOf(tx, ownerId, id));
}

export type TournamentSummary = {
  id: number;
  name: string;
  status: "draft" | "active" | "complete";
  heatSize: number;
  blind: boolean;
  entryCount: number;
  /** The round being played, or null before the first. */
  currentRound: number | null;
  /** How many rounds there will be if nobody withdraws; 0 under two entries. */
  totalRounds: number;
  /** Heats of the current round that are decided, out of all of them. */
  progress: { done: number; total: number };
  createdAt: string;
  completedAt: string | null;
};

/** The owner's tournaments, newest first, each with enough to draw a progress row. */
export async function listTournaments(ownerId: number): Promise<TournamentSummary[]> {
  const rows = await db.select().from(tournaments).where(eq(tournaments.ownerId, ownerId)).orderBy(desc(tournaments.createdAt), desc(tournaments.id));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const entries = await db
    .select({ tournamentId: tournamentEntries.tournamentId, status: tournamentEntries.status })
    .from(tournamentEntries)
    .where(inArray(tournamentEntries.tournamentId, ids));
  const heats = await db
    .select({ tournamentId: tournamentHeats.tournamentId, round: tournamentHeats.round, status: tournamentHeats.status })
    .from(tournamentHeats)
    .where(inArray(tournamentHeats.tournamentId, ids));

  return rows.map((t) => {
    const mine = heats.filter((h) => h.tournamentId === t.id);
    const round = mine.length > 0 ? Math.max(...mine.map((h) => h.round)) : null;
    const current = mine.filter((h) => h.round === round);
    const active = entries.filter((e) => e.tournamentId === t.id && e.status === "active").length;
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      heatSize: t.heatSize,
      blind: t.blind,
      entryCount: entries.filter((e) => e.tournamentId === t.id).length,
      currentRound: round,
      totalRounds: active >= 2 ? planRounds(active, t.heatSize).length : 0,
      progress: { done: current.filter((h) => h.status !== "pending").length, total: current.length },
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    };
  });
}
