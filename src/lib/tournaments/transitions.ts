import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadEntrants } from "./facts";
import { groupAtRandom, groupIntoHeats } from "./grouping";
import { nextPool, type HeatResult } from "./rounds";
import { fail, GONE, lockTournament, readState, viewOf, type Failure, type Tx } from "./state";
import type { GroupKey } from "./types";
import type { TournamentRow, TournamentView } from "./view";

const { tournaments, tournamentEntries, tournamentHeats, tournamentHeatEntries } = schema;
const NO_HEAT = "That flight is gone.";
const NO_ENTRY = "That entry is gone.";

export type Done = { ok: true; view: TournamentView };

/**
 * Cuts the given entries into heats and adds them to `round`, numbered on after any heats already there. Similar
 * seeding matches them by the tournament's key order; random shuffles them. A heat of one is a bye.
 */
async function generateRound(tx: Tx, ownerId: number, t: TournamentRow, round: number, entryIds: number[]): Promise<void> {
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
/** @internal Called after a running flight is edited in the same transaction. */
export async function settleRound(tx: Tx, ownerId: number, t: TournamentRow): Promise<void> {
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

/** @internal Makes the round 1 preview inside draft creation or update. Call with no heats. */
export async function previewRound(tx: Tx, ownerId: number, id: number): Promise<void> {
  const t = await lockTournament(tx, ownerId, id);
  const { entries } = await readState(tx, id);
  const active = entries.filter((e) => e.status === "active").map((e) => e.id);
  if (t && active.length >= 2) await generateRound(tx, ownerId, t, 1, active);
}

/** Locks the field and starts the tournament, making round 1 if the draft has no preview. Needs two entries. */
export async function startTournament(ownerId: number, id: number): Promise<{ ok: true; view: TournamentView } | Failure> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, ownerId, id);
    if (!t) return fail(404, GONE);
    if (t.status !== "draft") return fail(409, "This tournament has already started.");
    const { entries, heats } = await readState(tx, id);
    const active = entries.filter((e) => e.status === "active").map((e) => e.id);
    if (active.length < 2) return fail(422, "A tournament needs at least two entries.", { entries: "Add at least two entries." });
    if (heats.length === 0) await generateRound(tx, ownerId, t, 1, active);
    await tx.update(tournaments).set({ status: "active", startedAt: new Date() }).where(eq(tournaments.id, id));
    await settleRound(tx, ownerId, { ...t, status: "active" });
    return { ok: true as const, view: (await viewOf(tx, ownerId, id))! };
  });
}

/**
 * Regroups to the automatic choice. In a draft that is all of round 1; once running it is the entries of the current
 * round's undecided heats (a decided heat is never touched). Heats you renamed or moved bottles between lose both.
 */
export async function resetRound(ownerId: number, id: number): Promise<{ ok: true; view: TournamentView } | Failure> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, ownerId, id);
    if (!t) return fail(404, GONE);
    if (t.status === "complete") return fail(409, "This tournament is finished.");
    const { entries, heats, heatEntries } = await readState(tx, id);
    const activeIds = new Set(entries.filter((e) => e.status === "active").map((e) => e.id));

    if (t.status === "draft") {
      if (activeIds.size < 2) return fail(422, "A tournament needs at least two entries.", { entries: "Add at least two entries." });
      await tx.delete(tournamentHeats).where(eq(tournamentHeats.tournamentId, id));
      await generateRound(tx, ownerId, t, 1, entries.filter((e) => e.status === "active").map((e) => e.id));
    } else {
      const round = Math.max(...heats.map((h) => h.round));
      const undecided = heats.filter((h) => h.round === round && h.status !== "decided");
      const regroup = [...new Set(heatEntries.filter((r) => undecided.some((h) => h.id === r.heatId) && activeIds.has(r.entryId)).map((r) => r.entryId))];
      if (undecided.length > 0) {
        await tx.delete(tournamentHeats).where(inArray(tournamentHeats.id, undecided.map((h) => h.id)));
        await generateRound(tx, ownerId, t, round, regroup);
        await settleRound(tx, ownerId, t);
      }
    }
    return { ok: true as const, view: (await viewOf(tx, ownerId, id))! };
  });
}

/**
 * Records a heat's result: its entries best first, either by entry id (`ranking`) or, for a heat poured blind, by
 * glass letter (`glasses`). Every entry must appear exactly once. A finished round makes the next one, or finishes
 * the tournament.
 */
export async function recordHeat(
  ownerId: number,
  tournamentId: number,
  heatId: number,
  input: { ranking: number[] } | { glasses: string[] },
  userId: number,
): Promise<Done | Failure> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, ownerId, tournamentId);
    if (!t) return fail(404, GONE);
    if (t.status !== "active") return fail(409, "This tournament is not running.");
    const state = await readState(tx, t.id);
    const heat = state.heats.find((h) => h.id === heatId);
    if (!heat) return fail(404, NO_HEAT);
    if (heat.round !== Math.max(...state.heats.map((h) => h.round))) return fail(409, "That flight is not in the current round.");
    if (heat.status !== "pending") return fail(409, "That flight already has a result.");

    const rows = state.heatEntries.filter((r) => r.heatId === heat.id);
    let order: number[];
    if ("glasses" in input) {
      const entryOfGlass = new Map(rows.flatMap((r) => (r.glass !== null ? [[r.glass, r.entryId] as const] : [])));
      if (entryOfGlass.size !== rows.length) return fail(422, "Set the glasses before ranking them.", { glasses: "Set the glasses first." });
      const ok = input.glasses.length === rows.length && new Set(input.glasses).size === rows.length && input.glasses.every((g) => entryOfGlass.has(g));
      if (!ok) return fail(422, "Rank every glass exactly once.", { glasses: "Rank every glass exactly once." });
      order = input.glasses.map((g) => entryOfGlass.get(g)!);
    } else {
      const ids = new Set(rows.map((r) => r.entryId));
      const ok = input.ranking.length === rows.length && new Set(input.ranking).size === rows.length && input.ranking.every((id) => ids.has(id));
      if (!ok) return fail(422, "Rank every bottle in the flight exactly once.", { ranking: "Rank every bottle exactly once." });
      order = input.ranking;
    }

    for (const [index, entryId] of order.entries()) {
      await tx
        .update(tournamentHeatEntries)
        .set({ place: index + 1 })
        .where(and(eq(tournamentHeatEntries.heatId, heat.id), eq(tournamentHeatEntries.entryId, entryId)));
    }
    await tx.update(tournamentHeats).set({ status: "decided", decidedAt: new Date(), decidedBy: userId }).where(eq(tournamentHeats.id, heat.id));
    await settleRound(tx, ownerId, t);
    return { ok: true as const, view: (await viewOf(tx, ownerId, t.id))! };
  });
}

/**
 * Takes a result back. Allowed until a heat of the next round has a result; the next round, which is made from this
 * one, is then discarded. A finished tournament becomes a running one again.
 */
export async function undoHeat(ownerId: number, tournamentId: number, heatId: number): Promise<Done | Failure> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, ownerId, tournamentId);
    if (!t) return fail(404, GONE);
    if (t.status === "draft") return fail(409, "This tournament has not started.");
    const state = await readState(tx, t.id);
    const heat = state.heats.find((h) => h.id === heatId);
    if (!heat) return fail(404, NO_HEAT);
    if (heat.status !== "decided") return fail(409, "That flight has no result to take back.");
    const later = state.heats.filter((h) => h.round > heat.round);
    if (later.some((h) => h.status === "decided")) return fail(409, "A flight in the next round already has a result. Take that back first.");

    if (later.length > 0) await tx.delete(tournamentHeats).where(and(eq(tournamentHeats.tournamentId, t.id), gt(tournamentHeats.round, heat.round)));
    await tx.update(tournamentHeatEntries).set({ place: null }).where(eq(tournamentHeatEntries.heatId, heat.id));
    await tx.update(tournamentHeats).set({ status: "pending", decidedAt: null, decidedBy: null }).where(eq(tournamentHeats.id, heat.id));
    await tx.update(tournaments).set({ status: "active", completedAt: null }).where(eq(tournaments.id, t.id));
    // An entry withdrawn after this heat was decided is still listed in it; it must not be asked for again.
    for (const e of state.entries.filter((e) => e.status === "withdrawn")) await removeFromUndecided(tx, t.id, e.id);
    await settleRound(tx, ownerId, t);
    return { ok: true as const, view: (await viewOf(tx, ownerId, t.id))! };
  });
}

/** Removes an entry from the current round's undecided heats; a heat left with one becomes a bye, with none is deleted. */
async function removeFromUndecided(tx: Tx, tournamentId: number, entryId: number): Promise<void> {
  const state = await readState(tx, tournamentId);
  if (state.heats.length === 0) return;
  const round = Math.max(...state.heats.map((h) => h.round));
  for (const heat of state.heats.filter((h) => h.round === round && h.status !== "decided")) {
    const rows = state.heatEntries.filter((r) => r.heatId === heat.id);
    if (!rows.some((r) => r.entryId === entryId)) continue;
    await tx.delete(tournamentHeatEntries).where(and(eq(tournamentHeatEntries.heatId, heat.id), eq(tournamentHeatEntries.entryId, entryId)));
    const left = rows.length - 1;
    if (left === 0) await tx.delete(tournamentHeats).where(eq(tournamentHeats.id, heat.id));
    else await tx.update(tournamentHeats).set({ status: left === 1 ? "bye" : "pending" }).where(eq(tournamentHeats.id, heat.id));
  }
}

/** Takes an entry out of a running tournament (a bottle ran out). Its decided heats stand; it plays no more. */
export async function withdrawEntry(ownerId: number, tournamentId: number, entryId: number): Promise<Done | Failure> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, ownerId, tournamentId);
    if (!t) return fail(404, GONE);
    if (t.status !== "active") return fail(409, "Only a running tournament has entries to withdraw.");
    const [entry] = await tx
      .select({ id: tournamentEntries.id, status: tournamentEntries.status })
      .from(tournamentEntries)
      .where(and(eq(tournamentEntries.id, entryId), eq(tournamentEntries.tournamentId, t.id)));
    if (!entry) return fail(404, NO_ENTRY);
    if (entry.status === "withdrawn") return fail(409, "That entry is already withdrawn.");

    await tx.update(tournamentEntries).set({ status: "withdrawn" }).where(eq(tournamentEntries.id, entryId));
    await removeFromUndecided(tx, t.id, entryId);
    await settleRound(tx, ownerId, t);
    return { ok: true as const, view: (await viewOf(tx, ownerId, t.id))! };
  });
}
