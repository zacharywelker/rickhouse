"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { matchEntries, stepMatch } from "@/lib/tournaments/bracket-search";
import type { FlightControls } from "@/lib/tournaments/bracket-actions";
import type { BracketModel } from "@/lib/tournaments/bracket-model";
import type { TournamentView } from "@/lib/tournaments/view";
import { BracketFind } from "./bracket-find";
import { FlightCard, rowDomId } from "./flight-card";
import { useBracketActions } from "./use-bracket-actions";

/**
 * The tournament as columns of rounds, each holding its flights. No lines join one round to the next: each round
 * regroups, so a line would show a feeder that does not exist. Every flight is shown, and the columns scroll with the
 * page (they wrap onto a new row when the window is too narrow to set them side by side), never in their own areas.
 * Once it runs, a decided round can be collapsed and a bottle found by name.
 */
export function Bracket({
  tournamentId,
  model,
  heatSize,
  draft,
  controls,
  rounds,
}: {
  tournamentId: number;
  model: BracketModel;
  heatSize: number;
  /** A draft: flights can be named. Otherwise the tournament runs (or ran) and the find box and collapse toggles appear. */
  draft: boolean;
  /** What each flight offers, by flight id. */
  controls: Record<number, FlightControls>;
  /** For the search only; a hidden flight carries no names. */
  rounds: TournamentView["rounds"];
}) {
  const actions = useBracketActions(tournamentId);
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<number>>(new Set());
  const [query, setQuery] = React.useState("");
  const [index, setIndex] = React.useState<number | null>(null);
  const wantScroll = React.useRef(false);

  const matches = React.useMemo(() => matchEntries({ rounds }, query), [rounds, query]);
  const current = index !== null ? (matches[index] ?? null) : null;
  const marks = React.useMemo(() => {
    const byHeat = new Map<number, Map<number, "match" | "current">>();
    for (const m of matches) {
      const marked = byHeat.get(m.heatId) ?? new Map<number, "match" | "current">();
      marked.set(m.entryId, current && current.heatId === m.heatId && current.entryId === m.entryId ? "current" : "match");
      byHeat.set(m.heatId, marked);
    }
    return byHeat;
  }, [matches, current]);
  const noMarks = React.useMemo(() => new Map<number, "match" | "current">(), []);

  React.useEffect(() => {
    if (!wantScroll.current || !current) return;
    wantScroll.current = false;
    const row = document.getElementById(rowDomId(current.heatId, current.entryId));
    if (!row) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    row.focus({ preventScroll: true });
  }, [current, collapsed]);

  const toggle = (round: number) =>
    setCollapsed((was) => {
      const next = new Set(was);
      if (!next.delete(round)) next.add(round);
      return next;
    });

  const step = (direction: 1 | -1) => {
    const next = stepMatch(matches.length, index, direction);
    setIndex(next);
    const to = next === null ? undefined : matches[next];
    if (!to) return;
    wantScroll.current = true;
    setCollapsed((was) => {
      if (!was.has(to.round)) return was;
      const open = new Set(was);
      open.delete(to.round);
      return open;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {draft ? null : (
        <BracketFind
          query={query}
          onQuery={(q) => {
            setQuery(q);
            setIndex(null);
          }}
          count={matches.length}
          index={current ? index : null}
          onStep={step}
        />
      )}
      {actions.error ? (
        <p role="alert" className="text-sm text-destructive">
          {actions.error}
        </p>
      ) : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,24rem),1fr))] items-start gap-x-8 gap-y-6">
        {model.columns.map((column) => {
          const isCollapsed = column.kind === "round" && collapsed.has(column.round);
          return (
            <section key={`${column.kind}-${column.round}`} aria-labelledby={`round-${column.round}`} className="min-w-0">
              <header className="sticky top-0 z-10 bg-background pb-1 pt-2">
                <h2 id={`round-${column.round}`} className="flex items-baseline justify-between gap-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  <span>
                    {column.heading}
                    {column.kind === "round" && column.state ? ` · ${column.state}` : ""}
                  </span>
                  <span className="font-normal normal-case tracking-normal tabular-nums">{column.count}</span>
                </h2>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{column.note}</p>
                  {column.kind === "round" && column.state === "decided" && !draft ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="-mr-3 min-h-11 shrink-0 px-3 text-xs"
                      aria-expanded={!isCollapsed}
                      aria-controls={`round-body-${column.round}`}
                      onClick={() => toggle(column.round)}
                    >
                      {isCollapsed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
                      {isCollapsed ? "Expand" : "Collapse"}
                    </Button>
                  ) : null}
                </div>
              </header>
              {column.kind === "round" ? (
                <div id={`round-body-${column.round}`} hidden={isCollapsed}>
                  {column.flights.map((flight) => {
                    const others = column.flights.filter((other) => other.id !== flight.id && other.status === "pending");
                    return (
                      <FlightCard
                        key={flight.id}
                        tournamentId={tournamentId}
                        flight={flight}
                        controls={controls[flight.id] ?? { play: false, undo: false, move: false, withdraw: [] }}
                        renamable={draft}
                        moveTargets={others.map((other) => ({ heatId: other.id, title: `Flight ${other.number} · ${other.title.text}`, full: other.count >= heatSize }))}
                        swapTargets={others.flatMap((other) => other.rows.map((row) => ({ entryId: row.entryId, name: row.name, flight: `Flight ${other.number}` })))}
                        marks={marks.get(flight.id) ?? noMarks}
                        actions={actions}
                      />
                    );
                  })}
                </div>
              ) : (
                <article className="mb-5 border-t-2 border-foreground">
                  <h3 className="pt-1 text-base font-medium leading-snug">{column.title}</h3>
                  <p className="pb-2 text-xs tabular-nums text-muted-foreground">{column.count}</p>
                  <p className="border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">{column.fill}</p>
                </article>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
