import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { tastingNotes, tournamentEntries } from "@/db/schema";

/**
 * A tasting and a tournament entry point at their bottle and its label together (tasting_notes_bottle_expression_fk
 * and tournament_entries_bottle_fk: (bottle_id, expression_id) -> bottles(id, expression_id), no ON UPDATE CASCADE).
 * Changing a bottle's label therefore has to move them in the SAME statement; both keys are checked at its end.
 * Use as `db.with(...movesHistory(...)).update(bottles)...` for every write that can change `bottles.expression_id`.
 * Label-only tastings and entries (bottle_id NULL) stay where they are. `ne` makes it a no-op when the label is unchanged.
 */
export function movesHistory(ownerId: number, bottleIds: number[], toExpressionId: number) {
  const moved = db.$with("moved_tastings").as(
    db
      .update(tastingNotes)
      .set({ expressionId: toExpressionId })
      .where(and(eq(tastingNotes.ownerId, ownerId), inArray(tastingNotes.bottleId, bottleIds), ne(tastingNotes.expressionId, toExpressionId)))
      .returning({ id: tastingNotes.id }),
  );
  const entries = db.$with("moved_entries").as(
    db
      .update(tournamentEntries)
      .set({ expressionId: toExpressionId })
      .where(and(eq(tournamentEntries.ownerId, ownerId), inArray(tournamentEntries.bottleId, bottleIds), ne(tournamentEntries.expressionId, toExpressionId)))
      .returning({ id: tournamentEntries.id }),
  );
  return [moved, entries] as const;
}
