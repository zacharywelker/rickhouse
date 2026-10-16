"use client";

import { EyeOff } from "lucide-react";
import type { FlightModel } from "@/lib/tournaments/bracket-model";
import { ColumnHeader, EntryRow } from "./entry-row";
import { FlightTitle } from "./flight-title";
import { MoveMenu, type MoveTarget } from "./move-menu";
import type { BracketActions } from "./use-bracket-actions";

/**
 * One flight: a heavy rule on top, its name and what it spans, then a hairline row per bottle. A hidden flight (a blind
 * one not yet tasted) shows only its band and one blank row per glass, and nothing that could name what is in it.
 */
export function FlightCard({
  flight,
  editable,
  moveTargets,
  actions,
}: {
  flight: FlightModel;
  editable: boolean;
  /** The other flights a bottle of this one can go to, when moving is allowed. */
  moveTargets: MoveTarget[];
  actions: BracketActions;
}) {
  const canEdit = editable && flight.status === "pending";
  return (
    <article aria-label={flight.title.text} className="mb-5 border-t-2 border-foreground">
      <FlightTitle
        title={flight.title}
        number={flight.number}
        editable={canEdit}
        busy={actions.pending}
        onRename={(label, done) => actions.rename(flight.id, label, done)}
      />
      {flight.meta ? <p className="pb-1 text-xs tabular-nums text-muted-foreground">{flight.meta}</p> : <div className="pb-1" />}
      {flight.hidden ? (
        <ul>
          {Array.from({ length: flight.count }, (_, i) => (
            <li key={i} className="flex min-h-11 items-center gap-3 border-t border-border py-1 text-sm text-muted-foreground">
              <EyeOff className="size-4 shrink-0" aria-hidden />
              Hidden until it&apos;s tasted
            </li>
          ))}
          <li className="border-t border-border" aria-hidden />
        </ul>
      ) : (
        <>
          <ColumnHeader decided={flight.status !== "pending"} editable={canEdit} />
          <ul className="border-b border-border">
            {flight.rows.map((row) => (
              <EntryRow
                key={row.entryId}
                row={row}
                flight={flight}
                action={
                  canEdit ? (
                    <MoveMenu name={row.name} targets={moveTargets} onMove={(heatId, done) => actions.move(row.entryId, heatId, done)} />
                  ) : undefined
                }
              />
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
