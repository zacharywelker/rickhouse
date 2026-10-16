"use client";

import Link from "next/link";
import type { Route } from "next";
import { EyeOff, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FlightControls } from "@/lib/tournaments/bracket-actions";
import type { FlightModel } from "@/lib/tournaments/bracket-model";
import { ColumnHeader, EntryRow, type Slots } from "./entry-row";
import { FlightTitle } from "./flight-title";
import { MoveMenu, type MoveTarget, type SwapTarget } from "./move-menu";
import type { BracketActions } from "./use-bracket-actions";
import { WithdrawButton } from "./withdraw-button";

export const rowDomId = (heatId: number, entryId: number) => `row-${heatId}-${entryId}`;

/**
 * One flight: a heavy rule on top, its name and what it spans, then a hairline row per bottle, and under them what it
 * offers (Play, or Undo once decided). A hidden flight (a blind one not yet tasted) shows only its band and one blank row
 * per glass, and nothing that could name what is in it.
 */
export function FlightCard({
  tournamentId,
  flight,
  controls,
  renamable,
  moveTargets,
  swapTargets,
  marks,
  actions,
}: {
  tournamentId: number;
  flight: FlightModel;
  controls: FlightControls;
  /** A draft: its flights can be named. */
  renamable: boolean;
  /** The other flights a bottle of this one can go to, when moving is allowed. */
  moveTargets: MoveTarget[];
  /** The bottles of those flights, which a bottle of this one can trade places with. */
  swapTargets: SwapTarget[];
  /** Search hits by entry id. */
  marks: ReadonlyMap<number, "match" | "current">;
  actions: BracketActions;
}) {
  const withdrawable = new Set(controls.withdraw);
  const slots = ((controls.move ? 1 : 0) + (withdrawable.size > 0 ? 1 : 0)) as Slots;
  return (
    <article aria-label={flight.title.text} className="mb-5 border-t-2 border-foreground">
      <FlightTitle
        title={flight.title}
        number={flight.number}
        editable={renamable && flight.status === "pending"}
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
          <ColumnHeader decided={flight.status !== "pending"} slots={slots} />
          <ul className="border-b border-border">
            {flight.rows.map((row) => (
              <EntryRow
                key={row.entryId}
                row={row}
                flight={flight}
                slots={slots}
                domId={rowDomId(flight.id, row.entryId)}
                mark={marks.get(row.entryId)}
                action={
                  slots > 0 ? (
                    <>
                      {controls.move ? (
                        <MoveMenu
                          name={row.name}
                          targets={moveTargets}
                          swaps={swapTargets}
                          onMove={(heatId, done) => actions.move(row.entryId, heatId, done)}
                          onSwap={(withEntryId, done) => actions.swap(row.entryId, withEntryId, done)}
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
