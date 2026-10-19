import { randomInt } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadEntrants } from "./facts";
import { fail, GONE, lockTournament, readState, settle, viewOf, type Failure } from "./state";
import { mashbillDisplay } from "./grains";
import { heatBand } from "./grouping";
import type { TournamentView, ViewHeatEntry } from "./view";

const { tournaments, tournamentEntries, tournamentHeats, tournamentHeatEntries } = schema;

const NO_HEAT = "That flight is gone.";
const NO_ENTRY = "That entry is gone.";
const LETTERS = ["A", "B", "C", "D", "E", "F"];

export type Done = { ok: true; view: TournamentView };

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
    await settle(tx, ownerId, t);
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
    await settle(tx, ownerId, t);
    return { ok: true as const, view: (await viewOf(tx, ownerId, t.id))! };
  });
}

/** Removes an entry from the current round's undecided heats; a heat left with one becomes a bye, with none is deleted. */
async function removeFromUndecided(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], tournamentId: number, entryId: number): Promise<void> {
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
    await settle(tx, ownerId, t);
    return { ok: true as const, view: (await viewOf(tx, ownerId, t.id))! };
  });
}

/** A flight as the pourer sees it: every glass with what is in it. */
export type DrawnHeat = {
  heatId: number;
  round: number;
  slot: number;
  band: string;
  glasses: { glass: string; entry: Pick<ViewHeatEntry, "entryId" | "name" | "proof" | "mashbill" | "ageYears" | "distilleries"> }[];
};

/**
 * Picks a pending flight of the current round at random, labels its glasses at random and keeps the letters, so the
 * pourer knows what is in each glass and the taster sees only letters. Drawing again returns the same flight until it is recorded.
 * With `heatId` it opens that pending flight of the current round instead (keeping letters it already has).
 */
export async function drawHeat(ownerId: number, tournamentId: number, heatId?: number): Promise<{ ok: true; heat: DrawnHeat } | Failure> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, ownerId, tournamentId);
    if (!t) return fail(404, GONE);
    if (t.status !== "active") return fail(409, "This tournament is not running.");
    const state = await readState(tx, t.id);
    const round = Math.max(...state.heats.map((h) => h.round));
    const open = state.heats.filter((h) => h.round === round && h.status === "pending");
    const hasLetters = (h: { id: number }) => {
      const r = state.heatEntries.filter((x) => x.heatId === h.id);
      return r.length > 0 && r.every((x) => x.glass);
    };
    let chosen: (typeof open)[number] | undefined;
    if (heatId !== undefined) {
      const named = state.heats.find((h) => h.id === heatId);
      if (!named) return fail(404, NO_HEAT);
      if (named.status !== "pending") return fail(409, "That flight is already decided.");
      if (named.round !== round) return fail(409, "That flight is not in the current round.");
      chosen = named;
    } else if (open.length === 0) {
      return fail(409, "No flight is waiting to be tasted.");
    }

    // A flight already drawn and not yet recorded keeps its letters, so a retried request cannot re-letter poured glasses.
    const drawn = chosen ? (hasLetters(chosen) ? chosen : undefined) : open.find(hasLetters);
    const heat = chosen ?? drawn ?? open[randomInt(open.length)]!;
    const rows = state.heatEntries.filter((r) => r.heatId === heat.id);
    let letters: string[];
    if (drawn) {
      letters = rows.map((r) => r.glass!);
    } else {
      letters = LETTERS.slice(0, rows.length);
      for (let i = letters.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [letters[i], letters[j]] = [letters[j]!, letters[i]!];
      }
      await tx.update(tournamentHeatEntries).set({ glass: null }).where(eq(tournamentHeatEntries.heatId, heat.id));
      for (const [i, row] of rows.entries()) {
        await tx
          .update(tournamentHeatEntries)
          .set({ glass: letters[i]! })
          .where(and(eq(tournamentHeatEntries.heatId, heat.id), eq(tournamentHeatEntries.entryId, row.entryId)));
      }
    }

    const entrants = await loadEntrants(tx, ownerId, state.entries.filter((e) => rows.some((r) => r.entryId === e.id)));
    const glasses = rows
      .map((row, i) => {
        const e = entrants.get(row.entryId)!;
        return {
          glass: letters[i]!,
          entry: {
            entryId: row.entryId,
            name: state.entries.find((x) => x.id === row.entryId)!.displayName,
            proof: e.proof,
            mashbill: e.mashbill ? mashbillDisplay(e.mashbill) || null : null,
            ageYears: e.ageYears,
            distilleries: e.distilleries,
          },
        };
      })
      .sort((a, b) => a.glass.localeCompare(b.glass));
    return { ok: true as const, heat: { heatId: heat.id, round: heat.round, slot: heat.slot, band: heatBand([...entrants.values()]), glasses } };
  });
}

/** Sets the glass letters of a pending flight by hand (the solo flow): every entry gets a different letter from A up. */
export async function setGlasses(
  ownerId: number,
  tournamentId: number,
  heatId: number,
  assign: { entryId: number; glass: string }[],
): Promise<Done | Failure> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, ownerId, tournamentId);
    if (!t) return fail(404, GONE);
    if (t.status !== "active") return fail(409, "This tournament is not running.");
    const state = await readState(tx, t.id);
    const heat = state.heats.find((h) => h.id === heatId);
    if (!heat) return fail(404, NO_HEAT);
    if (heat.status !== "pending") return fail(409, "That flight is already decided.");
    const rows = state.heatEntries.filter((r) => r.heatId === heat.id);
    const allowed = new Set(LETTERS.slice(0, rows.length));
    const ok =
      assign.length === rows.length &&
      new Set(assign.map((a) => a.entryId)).size === rows.length &&
      new Set(assign.map((a) => a.glass)).size === rows.length &&
      assign.every((a) => allowed.has(a.glass) && rows.some((r) => r.entryId === a.entryId));
    if (!ok) return fail(422, `Give each bottle in the flight a different letter from ${LETTERS[0]} to ${LETTERS[rows.length - 1]}.`, { assign: "Give each bottle its own letter." });

    await tx.update(tournamentHeatEntries).set({ glass: null }).where(eq(tournamentHeatEntries.heatId, heat.id));
    for (const a of assign) {
      await tx
        .update(tournamentHeatEntries)
        .set({ glass: a.glass })
        .where(and(eq(tournamentHeatEntries.heatId, heat.id), eq(tournamentHeatEntries.entryId, a.entryId)));
    }
    return { ok: true as const, view: (await viewOf(tx, ownerId, t.id))! };
  });
}

/**
 * Moves an entry to another undecided flight of the current round (round 1 in a draft). The flight it joins must have
 * room; one it leaves with a single entry becomes a bye, with none is removed. Refused in a running blind tournament,
 * whose flights are hidden; reset the round instead.
 */
export async function moveEntry(ownerId: number, tournamentId: number, entryId: number, toHeatId: number): Promise<Done | Failure> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, ownerId, tournamentId);
    if (!t) return fail(404, GONE);
    if (t.status === "complete") return fail(409, "This tournament is finished.");
    if (t.status === "active" && t.blind) return fail(409, "The flights of a blind tournament are hidden. Reset the round to regroup it.");
    const state = await readState(tx, t.id);
    if (state.heats.length === 0) return fail(409, "There are no flights yet. Reset the round to make them.");
    const round = Math.max(...state.heats.map((h) => h.round));
    const entry = state.entries.find((e) => e.id === entryId);
    if (!entry) return fail(404, NO_ENTRY);
    if (entry.status !== "active") return fail(409, "A withdrawn entry cannot be moved.");

    const from = state.heatEntries.find((r) => r.entryId === entryId && state.heats.some((h) => h.id === r.heatId && h.round === round));
    const fromHeat = from ? state.heats.find((h) => h.id === from.heatId) : undefined;
    const toHeat = state.heats.find((h) => h.id === toHeatId);
    if (!fromHeat || fromHeat.status === "decided") return fail(409, "That entry is not in an undecided flight of the current round.");
    if (!toHeat || toHeat.round !== round) return fail(404, NO_HEAT);
    if (toHeat.status === "decided") return fail(409, "That flight is already decided.");
    if (toHeat.id === fromHeat.id) return fail(409, "That entry is already in that flight.");
    const toCount = state.heatEntries.filter((r) => r.heatId === toHeat.id).length;
    if (toCount >= t.heatSize) return fail(409, `That flight is full (${t.heatSize} bottles).`);

    await tx.delete(tournamentHeatEntries).where(and(eq(tournamentHeatEntries.heatId, fromHeat.id), eq(tournamentHeatEntries.entryId, entryId)));
    await tx.insert(tournamentHeatEntries).values({ heatId: toHeat.id, entryId, tournamentId: t.id });
    await tx.update(tournamentHeats).set({ status: "pending" }).where(eq(tournamentHeats.id, toHeat.id));
    const left = state.heatEntries.filter((r) => r.heatId === fromHeat.id).length - 1;
    if (left === 0) await tx.delete(tournamentHeats).where(eq(tournamentHeats.id, fromHeat.id));
    else await tx.update(tournamentHeats).set({ status: left === 1 ? "bye" : "pending" }).where(eq(tournamentHeats.id, fromHeat.id));
    if (t.status === "active") await settle(tx, ownerId, t);
    return { ok: true as const, view: (await viewOf(tx, ownerId, t.id))! };
  });
}

/**
 * Swaps two entries between two different undecided flights of the current round (round 1 in a draft): each takes
 * the other's place, so both flights keep their size, which makes it the way to rearrange when every flight is full.
 * Glass letters belong to the positions: the entry swapped in takes the letter of the one it replaces. If that
 * leaves a flight with only some letters (one flight had them and the other did not), both flights lose their
 * letters so no flight is half lettered. Refused in a running blind tournament, as moveEntry is.
 */
export async function swapEntries(ownerId: number, tournamentId: number, entryId: number, otherEntryId: number): Promise<Done | Failure> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, ownerId, tournamentId);
    if (!t) return fail(404, GONE);
    if (t.status === "complete") return fail(409, "This tournament is finished.");
    if (t.status === "active" && t.blind) return fail(409, "The flights of a blind tournament are hidden. Reset the round to regroup it.");
    const state = await readState(tx, t.id);
    if (state.heats.length === 0) return fail(409, "There are no flights yet. Reset the round to make them.");
    const round = Math.max(...state.heats.map((h) => h.round));
    const place = (entryId: number) => {
      const entry = state.entries.find((e) => e.id === entryId);
      const row = state.heatEntries.find((r) => r.entryId === entryId && state.heats.some((h) => h.id === r.heatId && h.round === round));
      return { entry, row, heat: row ? state.heats.find((h) => h.id === row.heatId) : undefined };
    };
    const a = place(entryId);
    const b = place(otherEntryId);
    if (!a.entry || !b.entry) return fail(404, NO_ENTRY);
    if (a.entry.status !== "active" || b.entry.status !== "active") return fail(409, "A withdrawn entry cannot be moved.");
    if (!a.heat || !b.heat || a.heat.status === "decided" || b.heat.status === "decided") return fail(409, "Both entries must be in undecided flights of the current round.");
    if (a.heat.id === b.heat.id) return fail(409, "Those entries are already in the same flight.");

    const at = (heatId: number, entry: number) => and(eq(tournamentHeatEntries.heatId, heatId), eq(tournamentHeatEntries.entryId, entry));
    const lettered = (heatId: number) => state.heatEntries.filter((r) => r.heatId === heatId).every((r) => r.glass !== null);
    const keepLetters = lettered(a.heat.id) && lettered(b.heat.id);
    // A letter is unique within its flight, so the two rows let go of theirs before changing flights.
    await tx.update(tournamentHeatEntries).set({ glass: null }).where(at(a.heat.id, entryId));
    await tx.update(tournamentHeatEntries).set({ glass: null }).where(at(b.heat.id, otherEntryId));
    await tx.update(tournamentHeatEntries).set({ heatId: b.heat.id }).where(at(a.heat.id, entryId));
    await tx.update(tournamentHeatEntries).set({ heatId: a.heat.id }).where(at(b.heat.id, otherEntryId));
    if (keepLetters) {
      await tx.update(tournamentHeatEntries).set({ glass: b.row!.glass }).where(at(b.heat.id, entryId));
      await tx.update(tournamentHeatEntries).set({ glass: a.row!.glass }).where(at(a.heat.id, otherEntryId));
    } else {
      await tx.update(tournamentHeatEntries).set({ glass: null }).where(inArray(tournamentHeatEntries.heatId, [a.heat.id, b.heat.id]));
    }
    return { ok: true as const, view: (await viewOf(tx, ownerId, t.id))! };
  });
}

/** Matches an outside entry to one of the owner's bottles or labels, so its heats count toward the long-term ranking. */
export async function promoteEntry(
  ownerId: number,
  tournamentId: number,
  entryId: number,
  to: { bottleId: number } | { expressionId: number },
): Promise<Done | Failure> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, ownerId, tournamentId);
    if (!t) return fail(404, GONE);
    const [entry] = await tx
      .select({ id: tournamentEntries.id, bottleId: tournamentEntries.bottleId, expressionId: tournamentEntries.expressionId })
      .from(tournamentEntries)
      .where(and(eq(tournamentEntries.id, entryId), eq(tournamentEntries.tournamentId, t.id)));
    if (!entry) return fail(404, NO_ENTRY);
    if (entry.bottleId !== null || entry.expressionId !== null) return fail(409, "Only an outside entry can be matched.");

    let expressionId: number;
    let bottleId: number | null = null;
    if ("bottleId" in to) {
      const rows = (await tx.execute(sql`SELECT id, expression_id FROM bottles WHERE id = ${to.bottleId} AND owner_id = ${ownerId}`)) as unknown as { id: number; expression_id: number }[];
      if (rows.length === 0) return fail(422, "That bottle is gone.", { bottleId: "That bottle is gone." });
      bottleId = rows[0]!.id;
      expressionId = rows[0]!.expression_id;
    } else {
      const rows = (await tx.execute(sql`SELECT id FROM expressions WHERE id = ${to.expressionId} AND owner_id = ${ownerId}`)) as unknown as { id: number }[];
      if (rows.length === 0) return fail(422, "That label is gone.", { expressionId: "That label is gone." });
      expressionId = rows[0]!.id;
    }
    const taken = await tx
      .select({ id: tournamentEntries.id, bottleId: tournamentEntries.bottleId, expressionId: tournamentEntries.expressionId })
      .from(tournamentEntries)
      .where(and(eq(tournamentEntries.tournamentId, t.id), eq(tournamentEntries.expressionId, expressionId)));
    if (taken.some((e) => (bottleId !== null ? e.bottleId === bottleId : e.bottleId === null))) {
      return fail(409, "That bottle or label is already in this tournament.");
    }
    await tx.update(tournamentEntries).set({ bottleId, expressionId }).where(eq(tournamentEntries.id, entryId));
    return { ok: true as const, view: (await viewOf(tx, ownerId, t.id))! };
  });
}

/** Names a flight, or clears its name with an empty one. */
export async function renameHeat(ownerId: number, tournamentId: number, heatId: number, label: string | null): Promise<Done | Failure> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, ownerId, tournamentId);
    if (!t) return fail(404, GONE);
    const [heat] = await tx
      .select({ id: tournamentHeats.id })
      .from(tournamentHeats)
      .where(and(eq(tournamentHeats.id, heatId), eq(tournamentHeats.tournamentId, t.id)));
    if (!heat) return fail(404, NO_HEAT);
    const clean = label === null ? null : label.trim() === "" ? null : label.trim();
    if (clean !== null && clean.length > 80) return fail(422, "A flight's name can be up to 80 characters.", { label: "Up to 80 characters." });
    await tx.update(tournamentHeats).set({ label: clean }).where(eq(tournamentHeats.id, heat.id));
    return { ok: true as const, view: (await viewOf(tx, ownerId, t.id))! };
  });
}
