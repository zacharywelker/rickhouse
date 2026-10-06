import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bottles, tastingNotes } from "@/db/schema";
import type { z } from "zod";
import { fillUpdate } from "./fill-rules";
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

export type TastingNoteInput = z.infer<typeof tastingNoteSchema>;

/** The new note's id, or null when the bottle isn't this account's. */
export async function addTastingNote(bottleId: number, ownerId: number, data: TastingNoteInput): Promise<number | null> {
  if (!(await ownsBottle(bottleId, ownerId))) return null;
  const [row] = await db.insert(tastingNotes).values({ bottleId, ...data }).returning({ id: tastingNotes.id });
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
