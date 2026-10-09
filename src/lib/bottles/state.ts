import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bottles, stores, tastingNotes } from "@/db/schema";
import type { z } from "zod";
import { fillUpdate } from "./fill-rules";
import { openedUpdate, type OpenedChoice } from "./opened-rules";
import type { tastingNoteSchema } from "@/lib/expressions/schema";

/**
 * Every write is scoped to the signed-in account. A bottle id that is
 * someone else's matches nothing, so it reads as "gone", the same answer a
 * deleted bottle gets, which gives nothing away.
 */
export function ownedBottle(id: number, ownerId: number) {
  return and(eq(bottles.id, id), eq(bottles.ownerId, ownerId));
}

export async function ownsBottle(bottleId: number, ownerId: number): Promise<boolean> {
  return (await db.$count(bottles, ownedBottle(bottleId, ownerId))) > 0;
}

export type FillResult = { fillPct: number; isOpen: boolean; status: string; dateOpened: string | null };

/** Sets the level. Null when the bottle isn't this account's. Killing a bottle is a separate, explicit act. */
export async function setFill(bottleId: number, ownerId: number, fillPct: number): Promise<FillResult | null> {
  const [current] = await db
    .select({ isOpen: bottles.isOpen, dateOpened: bottles.dateOpened, status: bottles.status })
    .from(bottles)
    .where(ownedBottle(bottleId, ownerId))
    .limit(1);
  if (!current) return null;

  const [updated] = await db
    .update(bottles)
    .set(fillUpdate(current, fillPct, new Date().toISOString().slice(0, 10)))
    .where(ownedBottle(bottleId, ownerId))
    .returning({ fillPct: bottles.fillPct, isOpen: bottles.isOpen, status: bottles.status, dateOpened: bottles.dateOpened });
  return updated ?? null;
}

/** The bottle's own columns the phone may edit; each already validated and in its column's type. */
export type BottleColumns = Partial<
  Pick<typeof bottles.$inferInsert, "pricePaid" | "storeId" | "dateAcquired" | "location" | "notes" | "batch" | "releaseYear" | "barrelNumber" | "pickName">
>;
export type BottlePatch = { fillPct?: number; dateOpened?: string | null; ifOpenedCleared?: OpenedChoice; columns?: BottleColumns };
export type BottleUpdate =
  | { ok: true; result: FillResult }
  | { ok: false; code: "opened_cleared" | "invalid"; message: string; field?: string };

/**
 * One change to a bottle: its level, its Opened date and its own facts together, so an undo can put all of
 * them back in one request. The open/sealed rules are `openedUpdate` and `fillUpdate`; this applies them to
 * the bottle as it is right now, under a row lock. Null when the bottle isn't this account's.
 */
export async function updateBottle(bottleId: number, ownerId: number, patch: BottlePatch): Promise<BottleUpdate | null> {
  const today = new Date().toISOString().slice(0, 10);
  return db.transaction(async (tx): Promise<BottleUpdate | null> => {
    const [current] = await tx
      .select({
        isOpen: bottles.isOpen,
        dateOpened: bottles.dateOpened,
        dateKilled: bottles.dateKilled,
        status: bottles.status,
        fillPct: bottles.fillPct,
        releaseId: bottles.releaseId,
      })
      .from(bottles)
      .where(ownedBottle(bottleId, ownerId))
      .for("update")
      .limit(1);
    if (!current) return null;

    const columns = patch.columns ?? {};
    // A bottle on a chosen release shows the release's batch and year, so editing its own would look like nothing happened.
    if (current.releaseId !== null && (columns.batch !== undefined || columns.releaseYear !== undefined)) {
      return { ok: false, code: "invalid", message: "This bottle's batch and year come from its release.", field: columns.batch !== undefined ? "batch" : "releaseYear" };
    }
    // The foreign key only names a store; whose it is has to be checked here.
    if (columns.storeId != null && (await tx.$count(stores, and(eq(stores.id, columns.storeId), eq(stores.ownerId, ownerId)))) === 0) {
      return { ok: false, code: "invalid", message: "Choose one of your stores.", field: "storeId" };
    }

    let state = current;
    const set: Record<string, unknown> = {};
    if (patch.fillPct !== undefined) {
      const change = fillUpdate(state, patch.fillPct, today);
      Object.assign(set, change);
      state = { ...state, ...change };
    }
    if (patch.dateOpened !== undefined) {
      const opened = openedUpdate(state, patch.dateOpened, patch.ifOpenedCleared, today);
      if (!opened.ok) return opened;
      if (opened.set.fillPct !== undefined && patch.fillPct !== undefined && patch.fillPct !== opened.set.fillPct) {
        return { ok: false, code: "invalid", message: "Marking it sealed sets the level to full.", field: "fillPct" };
      }
      Object.assign(set, opened.set);
    }
    Object.assign(set, columns);

    const returning = { fillPct: bottles.fillPct, isOpen: bottles.isOpen, status: bottles.status, dateOpened: bottles.dateOpened };
    if (Object.keys(set).length === 0) {
      const [same] = await tx.select(returning).from(bottles).where(ownedBottle(bottleId, ownerId)).limit(1);
      return same ? { ok: true, result: same } : null;
    }
    const [updated] = await tx.update(bottles).set(set).where(ownedBottle(bottleId, ownerId)).returning(returning);
    return updated ? { ok: true, result: updated } : null;
  });
}

export type TastingNoteInput = z.infer<typeof tastingNoteSchema>;

/** The new note's id, or null when the bottle isn't this account's. */
export async function addTastingNote(bottleId: number, ownerId: number, data: TastingNoteInput): Promise<number | null> {
  const [bottle] = await db.select({ expressionId: bottles.expressionId }).from(bottles).where(ownedBottle(bottleId, ownerId)).limit(1);
  if (!bottle) return null;
  // A note on one of your own bottles takes its label from the bottle and is "owned".
  const [row] = await db
    .insert(tastingNotes)
    .values({ ownerId, expressionId: bottle.expressionId, bottleId, source: "owned", ...data })
    .returning({ id: tastingNotes.id });
  return row?.id ?? null;
}

/** False when the bottle isn't this account's or the note isn't on it. */
export async function updateTastingNote(
  bottleId: number,
  noteId: number,
  ownerId: number,
  data: TastingNoteInput,
): Promise<boolean> {
  if (!(await ownsBottle(bottleId, ownerId))) return false;
  const rows = await db
    .update(tastingNotes)
    .set(data)
    .where(and(eq(tastingNotes.id, noteId), eq(tastingNotes.bottleId, bottleId)))
    .returning({ id: tastingNotes.id });
  return rows.length > 0;
}

/** False when the bottle isn't this account's or the note isn't on it. */
export async function deleteTastingNote(bottleId: number, noteId: number, ownerId: number): Promise<boolean> {
  if (!(await ownsBottle(bottleId, ownerId))) return false;
  const rows = await db
    .delete(tastingNotes)
    .where(and(eq(tastingNotes.id, noteId), eq(tastingNotes.bottleId, bottleId)))
    .returning({ id: tastingNotes.id });
  return rows.length > 0;
}
