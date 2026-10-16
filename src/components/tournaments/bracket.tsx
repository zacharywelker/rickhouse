"use client";

import type { BracketModel } from "@/lib/tournaments/bracket-model";
import { FlightCard } from "./flight-card";
import { useBracketActions } from "./use-bracket-actions";

/**
 * The tournament as columns of rounds, each holding its flights. No lines join one round to the next: each round
 * regroups, so a line would show a feeder that does not exist. Every flight is shown, and the columns scroll with the
 * page (they wrap onto a new row when the window is too narrow to set them side by side), never in their own areas.
 */
export function Bracket({
  tournamentId,
  model,
  heatSize,
  editable,
}: {
  tournamentId: number;
  model: BracketModel;
  heatSize: number;
  /** A draft: bottles can be moved between the flights of its one round, and flights renamed. */
  editable: boolean;
}) {
  const actions = useBracketActions(tournamentId);
  return (
    <div className="flex flex-col gap-3">
      {actions.error ? (
        <p role="alert" className="text-sm text-destructive">
          {actions.error}
        </p>
      ) : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,24rem),1fr))] items-start gap-x-8 gap-y-6">
        {model.columns.map((column) => (
          <section key={`${column.kind}-${column.round}`} aria-labelledby={`round-${column.round}`} className="min-w-0">
            <header className="sticky top-0 z-10 bg-background pb-1 pt-2">
              <h2 id={`round-${column.round}`} className="flex items-baseline justify-between gap-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                <span>
                  {column.heading}
                  {column.kind === "round" && column.state ? ` · ${column.state}` : ""}
                </span>
                <span className="font-normal normal-case tracking-normal tabular-nums">{column.count}</span>
              </h2>
              <p className="pt-0.5 text-xs text-muted-foreground">{column.note}</p>
            </header>
            {column.kind === "round" ? (
              column.flights.map((flight) => {
                const others = column.flights.filter((other) => other.id !== flight.id && other.status === "pending");
                return (
                  <FlightCard
                    key={flight.id}
                    flight={flight}
                    editable={editable}
                    moveTargets={others.map((other) => ({ heatId: other.id, title: `Flight ${other.number} · ${other.title.text}`, full: other.count >= heatSize }))}
                    swapTargets={others.flatMap((other) => other.rows.map((row) => ({ entryId: row.entryId, name: row.name, flight: `Flight ${other.number}` })))}
                    actions={actions}
                  />
                );
              })
            ) : (
              <article className="mb-5 border-t-2 border-foreground">
                <h3 className="pt-1 text-base font-medium leading-snug">{column.title}</h3>
                <p className="pb-2 text-xs tabular-nums text-muted-foreground">{column.count}</p>
                <p className="border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">{column.fill}</p>
              </article>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
