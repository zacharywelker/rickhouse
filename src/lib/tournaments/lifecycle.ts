import { eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { entryDisplayName } from "./entrants";
import { fail, generateRound, GONE, lockTournament, readState, settle, viewOf, type Failure, type Tx } from "./state";
import type { TournamentView } from "./view";

const { tournaments, tournamentEntries, tournamentHeats } = schema;

/** How an entry is named when a tournament is made: one of your bottles, one of your labels with no bottle, or a name typed in. */
export type EntryInput = { bottleId: number } | { expressionId: number } | { name: string };

export type TournamentSettings = {
  name: string;
  heatSize: number;
  seeding: "similar" | "random";
  groupOrder: string[];
  blind: boolean;
  fieldNote: string | null;
};

type NewEntry = { bottleId: number | null; expressionId: number | null; displayName: string; seed: number };

const list = (ids: number[]): SQL => sql.join(ids.map((id) => sql`${id}`), sql`, `);
const repeats = (ids: number[]) => new Set(ids).size !== ids.length;

/** The entries to store: each id checked to be the owner's, and each named as it will read in the tournament. */
async function resolveEntries(tx: Tx, ownerId: number, inputs: EntryInput[]): Promise<{ ok: true; rows: NewEntry[] } | Failure> {
  const bottleIds = inputs.flatMap((i) => ("bottleId" in i ? [i.bottleId] : []));
  const labelIds = inputs.flatMap((i) => ("expressionId" in i ? [i.expressionId] : []));
  if (repeats(bottleIds)) return fail(422, "A bottle is listed twice.", { entries: "A bottle is listed twice." });
  if (repeats(labelIds)) return fail(422, "A label is listed twice.", { entries: "A label is listed twice." });

  const run = async <T>(query: SQL): Promise<T[]> => (await tx.execute(query)) as unknown as T[];
  const bottles = bottleIds.length
    ? await run<{ id: number; expression_id: number; brand: string; name: string; pick_name: string | null; barrel_number: string | null; release_name: string | null; batch: string | null }>(
        sql`SELECT b.id, b.expression_id, br.name AS brand, e.name, b.pick_name, b.barrel_number, r.name AS release_name, b.batch
          FROM bottles b JOIN expressions e ON e.id = b.expression_id JOIN brands br ON br.id = e.brand_id
          LEFT JOIN expression_releases r ON r.id = b.release_id
          WHERE b.owner_id = ${ownerId} AND b.id IN (${list(bottleIds)})`,
      )
    : [];
  const labels = labelIds.length
    ? await run<{ id: number; brand: string; name: string }>(
        sql`SELECT e.id, br.name AS brand, e.name FROM expressions e JOIN brands br ON br.id = e.brand_id
          WHERE e.owner_id = ${ownerId} AND e.id IN (${list(labelIds)})`,
      )
    : [];
  const bottleById = new Map(bottles.map((b) => [b.id, b]));
  const labelById = new Map(labels.map((l) => [l.id, l]));

  const rows: NewEntry[] = [];
  for (const [seed, input] of inputs.entries()) {
    if ("bottleId" in input) {
      const b = bottleById.get(input.bottleId);
      if (!b) return fail(422, "One of those bottles is gone.", { entries: "One of those bottles is gone." });
      rows.push({
        bottleId: b.id,
        expressionId: b.expression_id,
        displayName: entryDisplayName({ brand: b.brand, name: b.name, pickName: b.pick_name, barrelNumber: b.barrel_number, releaseName: b.release_name, batch: b.batch }),
        seed,
      });
    } else if ("expressionId" in input) {
      const l = labelById.get(input.expressionId);
      if (!l) return fail(422, "One of those labels is gone.", { entries: "One of those labels is gone." });
      rows.push({ bottleId: null, expressionId: l.id, displayName: `${l.brand} ${l.name}`, seed });
    } else {
      const name = input.name.trim();
      if (name === "" || name.length > 120) return fail(422, "An outside entry needs a name of up to 120 characters.", { entries: "Name every outside entry." });
      rows.push({ bottleId: null, expressionId: null, displayName: name, seed });
    }
  }
  return { ok: true, rows };
}

/** Makes a draft tournament with its field. Needs no minimum field yet; starting does. */
export async function createTournament(
  ownerId: number,
  settings: TournamentSettings,
  entries: EntryInput[],
): Promise<{ ok: true; id: number } | Failure> {
  return db.transaction(async (tx) => {
    const resolved = await resolveEntries(tx, ownerId, entries);
    if (!resolved.ok) return resolved;
    const [row] = await tx.insert(tournaments).values({ ownerId, ...settings }).returning({ id: tournaments.id });
    if (resolved.rows.length > 0) {
      await tx.insert(tournamentEntries).values(resolved.rows.map((r) => ({ tournamentId: row!.id, ownerId, ...r })));
    }
    return { ok: true as const, id: row!.id };
  });
}

/**
 * Changes a draft: its settings and/or its whole field. A change to the field or to how flights are matched makes the
 * round 1 preview stale, so it is made again (when there was one and at least two entries remain).
 */
export async function updateDraft(
  ownerId: number,
  id: number,
  patch: Partial<TournamentSettings> & { entries?: EntryInput[] },
): Promise<{ ok: true; view: TournamentView } | Failure> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, ownerId, id);
    if (!t) return fail(404, GONE);
    const { entries, ...settings } = patch;
    if (t.status === "active") {
      // The grouping priority may change at any time: it only applies to rounds made afterwards and to Reset.
      const onlyGrouping = entries === undefined && Object.keys(settings).every((k) => k === "groupOrder" || k === "seeding");
      if (!onlyGrouping) return fail(409, "Only a draft can be changed, except the grouping priority.");
      if (Object.keys(settings).length > 0) await tx.update(tournaments).set(settings).where(eq(tournaments.id, id));
      return { ok: true as const, view: (await viewOf(tx, ownerId, id))! };
    }
    if (t.status !== "draft") return fail(409, "Only a draft can be changed.");

    const regroup = entries !== undefined || settings.heatSize !== undefined || settings.seeding !== undefined || settings.groupOrder !== undefined;
    const before = await readState(tx, id);
    const hadPreview = before.heats.length > 0;

    if (entries !== undefined) {
      const resolved = await resolveEntries(tx, ownerId, entries);
      if (!resolved.ok) return resolved;
      await tx.delete(tournamentHeats).where(eq(tournamentHeats.tournamentId, id));
      await tx.delete(tournamentEntries).where(eq(tournamentEntries.tournamentId, id));
      if (resolved.rows.length > 0) {
        await tx.insert(tournamentEntries).values(resolved.rows.map((r) => ({ tournamentId: id, ownerId, ...r })));
      }
    } else if (regroup) {
      await tx.delete(tournamentHeats).where(eq(tournamentHeats.tournamentId, id));
    }
    if (Object.keys(settings).length > 0) await tx.update(tournaments).set(settings).where(eq(tournaments.id, id));

    if (regroup && hadPreview) {
      const fresh = await lockTournament(tx, ownerId, id);
      const after = await readState(tx, id);
      const active = after.entries.filter((e) => e.status === "active").map((e) => e.id);
      if (fresh && active.length >= 2) await generateRound(tx, ownerId, fresh, 1, active);
    }
    return { ok: true as const, view: (await viewOf(tx, ownerId, id))! };
  });
}

/** Deletes a draft or a finished tournament. A running one is refused. */
export async function deleteTournament(ownerId: number, id: number): Promise<{ ok: true } | Failure> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, ownerId, id);
    if (!t) return fail(404, GONE);
    if (t.status === "active") return fail(409, "A running tournament cannot be deleted. Finish it first.");
    await tx.delete(tournaments).where(eq(tournaments.id, id));
    return { ok: true as const };
  });
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
    await settle(tx, ownerId, { ...t, status: "active" });
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
        await settle(tx, ownerId, t);
      }
    }
    return { ok: true as const, view: (await viewOf(tx, ownerId, id))! };
  });
}
