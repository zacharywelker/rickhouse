"use client";

import Link from "next/link";
import type { Route } from "next";
import { EyeOff, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canRename, type FlightControls } from "@/lib/tournaments/bracket-actions";
import type { FlightModel } from "@/lib/tournaments/bracket-model";
import { ColumnHeader, EntryRow, type Slots } from "./entry-row";
import { FlightTitle } from "./flight-title";
import { RemoveButton } from "./remove-button";
import { MoveMenu, type MoveTarget, type SwapTarget } from "./move-menu";
import type { BracketActions } from "./use-bracket-actions";
import { WithdrawButton } from "./withdraw-button";

export const rowDomId = (heatId: number, entryId: number) => `row-${heatId}-${entryId}`;
export const removeDomId = (heatId: number, entryId: number) => `remove-${heatId}-${entryId}`;
export const flightHeadingDomId = (heatId: number) => `flight-heading-${heatId}`;

/**
 * One flight: a heavy rule on top, its name and what it spans, then a hairline row per bottle, and under them what it
 * offers (Play, or Undo once decided). A hidden flight (a blind one not yet tasted) shows only its band and one blank row
 * per glass, and nothing that could name what is in it.
 */
export function FlightCard({
  tournamentId,
  flight,
  controls,
  moveTargets,
  swapTargets,
  marks,
  actions,
  draft,
  onRemoved,
}: {
  tournamentId: number;
  flight: FlightModel;
  controls: FlightControls;
  /** The other flights a bottle of this one can go to, when moving is allowed. */
  moveTargets: MoveTarget[];
  /** The bottles of those flights, which a bottle of this one can trade places with. */
  swapTargets: SwapTarget[];
  /** Search hits by entry id. */
  marks: ReadonlyMap<number, "match" | "current">;
  actions: BracketActions;
  /** A draft: every row has a Remove button. */
  draft: boolean;
  /** A row's Remove was pressed: the ids to give focus to once the page has refreshed, best first. */
  onRemoved: (focusCandidates: string[]) => void;
}) {
  const withdrawable = new Set(controls.withdraw);
  // Places (and the advance arrow) belong to a decided flight; a lone bottle in a draft has not been decided.
  const places = flight.status === "decided" || (flight.status === "bye" && !draft);
  const removable = draft && !flight.hidden;
  const slots = Math.min(2, (controls.move ? 1 : 0) + (withdrawable.size > 0 ? 1 : 0) + (removable ? 1 : 0)) as Slots;
  return (
    <article aria-label={flight.title.text} className="mb-5 border-t-2 border-foreground">
      <FlightTitle
        title={flight.title}
        headingId={flightHeadingDomId(flight.id)}
        number={flight.number}
        editable={canRename(flight)}
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
          <ColumnHeader decided={places} slots={slots} />
          <ul className="border-b border-border">
            {flight.rows.map((row, i) => (
              <EntryRow
                key={row.entryId}
                row={row}
                flight={flight}
                slots={slots}
                places={places}
                domId={rowDomId(flight.id, row.entryId)}
                mark={marks.get(row.entryId)}
                action={
                  slots > 0 ? (
                    <>
                      {controls.move ? (
                        <MoveMenu
                          name={row.name}
                          busy={actions.pending}
                          targets={moveTargets}
                          swaps={swapTargets}
                          onMove={(heatId, done) => actions.move(row.entryId, heatId, done)}
                          onSwap={(withEntryId, done) => actions.swap(row.entryId, withEntryId, done)}
                        />
                      ) : null}
                      {removable ? (
                        <RemoveButton
                          id={removeDomId(flight.id, row.entryId)}
                          entryId={row.entryId}
                          name={row.name}
                          actions={actions}
                          onRemove={() => {
                            const next = flight.rows[i + 1];
                            onRemoved([...(next ? [removeDomId(flight.id, next.entryId)] : []), flightHeadingDomId(flight.id)]);
                          }}
                        />
                      ) : null}
                      {withdrawable.has(row.entryId) ? <WithdrawButton entryId={row.entryId} name={row.name} actions={actions} /> : null}
                    </>
                  ) : undefined
                }
              />
            ))}
          </ul>
        </>
      )}
      {controls.play || controls.undo ? (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {controls.play ? (
            <Button asChild variant="outline" className="min-h-11">
              <Link href={`/tournaments/${tournamentId}/play/${flight.id}` as Route}>Play</Link>
            </Button>
          ) : null}
          {controls.undo ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={actions.pending}
              title="Undo this result (removes the next round)"
              aria-label={`Undo this result (removes the next round): ${flight.title.text}`}
              onClick={() => actions.undo(flight.id)}
            >
              <Undo2 className="size-4" aria-hidden />
              Undo
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
