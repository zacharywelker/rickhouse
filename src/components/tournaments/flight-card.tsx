"use client";

import Link from "next/link";
import type { Route } from "next";
import * as React from "react";
import { ChevronDown, ChevronUp, EyeOff, GripVertical, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canRename, type FlightControls } from "@/lib/tournaments/bracket-actions";
import { cn } from "@/lib/utils";
import type { flightSteps } from "@/lib/tournaments/drag-model";
import type { FlightModel } from "@/lib/tournaments/bracket-model";
import { ColumnHeader, EntryRow, type Slots } from "./entry-row";
import { FlightTitle } from "./flight-title";
import { RemoveButton } from "./remove-button";
import { MoveMenu, type MoveTarget, type SwapTarget } from "./move-menu";
import type { BracketActions } from "./use-bracket-actions";
import type { BracketDrag } from "./use-bracket-drag";
import { WithdrawButton } from "./withdraw-button";

export const rowDomId = (heatId: number, entryId: number) => `row-${heatId}-${entryId}`;
export const removeDomId = (heatId: number, entryId: number) => `remove-${heatId}-${entryId}`;
export const flightShiftDomId = (heatId: number, way: "up" | "down") => `flight-${way}-${heatId}`;
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
  anyOther,
  swapTargets,
  marks,
  actions,
  dnd,
  canDragRows,
  canDragFlight,
  steps,
  draft,
  onRemoved,
  onShifted,
}: {
  tournamentId: number;
  flight: FlightModel;
  controls: FlightControls;
  /** The other flights that have room for a bottle of this one. */
  moveTargets: MoveTarget[];
  /** Another open flight exists, so a bottle can be swapped with one of it. */
  anyOther: boolean;
  /** The bottles of the other open flights, built when a menu asks. */
  swapTargets: () => SwapTarget[];
  /** Search hits by entry id. */
  marks: ReadonlyMap<number, "match" | "current">;
  actions: BracketActions;
  dnd: BracketDrag;
  /** Its bottles can be dragged (the flight can be moved from). */
  canDragRows: boolean;
  /** The flight itself can be dragged to another place in the round. */
  canDragFlight: boolean;
  /** Where the up and down buttons send the flight (null: none shown). */
  steps: ReturnType<typeof flightSteps>;
  /** A draft: every row has a Remove button. */
  draft: boolean;
  /** A row's Remove was pressed: the ids to give focus to once the page has refreshed, best first. */
  onRemoved: (focusCandidates: string[]) => void;
  /** A move button was pressed: the ids to give focus to once the page has refreshed, best first. */
  onShifted: (focusCandidates: string[]) => void;
}) {
  const withdrawable = new Set(controls.withdraw);
  // Places (and the advance arrow) belong to a decided flight; a lone bottle in a draft has not been decided.
  const places = flight.status === "decided" || (flight.status === "bye" && !draft);
  const removable = draft && !flight.hidden;
  const article = React.useRef<HTMLElement>(null);
  const flightTarget = { kind: "flight", heatId: flight.id } as const;
  const flightCue = dnd.cue(flightTarget);
  const holdingThis = dnd.drag?.kind === "flight" && dnd.drag.heatId === flight.id;
  const slots = Math.min(2, (controls.move ? 1 : 0) + (withdrawable.size > 0 ? 1 : 0) + (removable ? 1 : 0)) as Slots;
  return (
    <article
      ref={article}
      aria-label={flight.title.text}
      {...(flight.hidden ? {} : dnd.dropProps(flightTarget))}
      className={cn(
        "relative mb-5 border-t-2 border-foreground",
        holdingThis && "opacity-50",
        flightCue?.ok && "outline outline-1 outline-offset-4 outline-dashed outline-foreground/40",
        flightCue?.ok && flightCue.hovered && "bg-muted/40 outline-2 !outline-solid outline-foreground",
        flightCue && !flightCue.ok && flightCue.hovered && "cursor-not-allowed",
      )}
    >
      {flightCue?.text ? (
        <p aria-hidden className="pointer-events-none absolute right-0 top-[3.25rem] z-10 border border-foreground bg-background px-2 py-0.5 text-xs font-medium">
          {flightCue.text}
        </p>
      ) : null}
      {flightCue?.ok && flightCue.hovered && dnd.drag?.kind === "flight" ? <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-3 h-1 bg-foreground" /> : null}
      <FlightTitle
        grip={
          canDragFlight ? (
            <span
              role="img"
              aria-label={`Drag flight ${flight.number} to reorder`}
              title="Drag to reorder the flights"
              draggable={!dnd.disabled}
              onDragStart={(e) => dnd.start(e, { kind: "flight", heatId: flight.id }, article.current)}
              onDragEnd={dnd.end}
              className={cn("flex size-11 shrink-0 [@media(pointer:coarse)]:hidden cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing", dnd.disabled && "opacity-40")}
            >
              <GripVertical className="size-5" aria-hidden />
            </span>
          ) : null
        }
        extra={
          steps ? (
            <>
              {(["up", "down"] as const).map((way) => {
                const to = steps[way];
                const Icon = way === "up" ? ChevronUp : ChevronDown;
                return (
                  <Button
                    key={way}
                    id={flightShiftDomId(flight.id, way)}
                    type="button"
                    variant="ghost"
                    className="size-11 p-0"
                    aria-label={`Move flight ${flight.number} ${way}`}
                    title={`Move flight ${way}`}
                    disabled={to === null || actions.pending}
                    onClick={() => {
                      if (to === null) return;
                      const other = flightShiftDomId(flight.id, way === "up" ? "down" : "up");
                      onShifted([flightShiftDomId(flight.id, way), other, flightHeadingDomId(flight.id)]);
                      actions.reorder(flight.id, to, () => dnd.announce({ kind: "reorder", heatId: flight.id, toSlot: to }));
                    }}
                  >
                    <Icon className="size-5" aria-hidden />
                  </Button>
                );
              })}
            </>
          ) : null
        }
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
          <ColumnHeader decided={places} slots={slots} handle={canDragRows} />
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
                drag={
                  canDragRows
                    ? {
                        label: `Drag ${row.name} to another flight, or use the menu`,
                        held: dnd.drag?.kind === "bottle" && dnd.drag.entryId === row.entryId,
                        cue: dnd.cue({ kind: "bottle", entryId: row.entryId, heatId: flight.id }),
                        props: {
                          draggable: !dnd.disabled,
                          onDragStart: (e) => dnd.start(e, { kind: "bottle", entryId: row.entryId, fromHeatId: flight.id }),
                          onDragEnd: dnd.end,
                        },
                        dropProps: dnd.dropProps({ kind: "bottle", entryId: row.entryId, heatId: flight.id }, (o) => o.kind === "swap"),
                      }
                    : undefined
                }
                action={
                  slots > 0 ? (
                    <>
                      {controls.move ? (
                        <MoveMenu
                          name={row.name}
                          busy={actions.pending}
                          targets={moveTargets}
                          anyOther={anyOther}
                          swaps={swapTargets}
                          onMove={(heatId, done) =>
                            actions.move(row.entryId, heatId, () => {
                              done();
                              dnd.announce({ kind: "move", entryId: row.entryId, toHeatId: heatId });
                            })
                          }
                          onSwap={(withEntryId, done) =>
                            actions.swap(row.entryId, withEntryId, () => {
                              done();
                              dnd.announce({ kind: "swap", entryId: row.entryId, withEntryId });
                            })
                          }
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
