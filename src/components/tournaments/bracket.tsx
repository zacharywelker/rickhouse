"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { matchEntries, stepMatch } from "@/lib/tournaments/bracket-search";
import { canDragBottle, canDragFlight, flightSteps, type DragView } from "@/lib/tournaments/drag-model";
import { isOpen, type FlightControls } from "@/lib/tournaments/bracket-actions";
import type { BracketModel } from "@/lib/tournaments/bracket-model";
import type { TournamentView } from "@/lib/tournaments/view";
import { BracketFind } from "./bracket-find";
import { FlightCard, rowDomId } from "./flight-card";
import { useBracketActions } from "./use-bracket-actions";
import { useBracketDrag } from "./use-bracket-drag";
import { useStickyScrollPadding } from "./use-sticky-scroll-padding";

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
  view,
}: {
  tournamentId: number;
  model: BracketModel;
  heatSize: number;
  /** A draft. Otherwise the tournament runs (or ran) and the find box and collapse toggles appear. */
  draft: boolean;
  /** What each flight offers, by flight id. */
  controls: Record<number, FlightControls>;
  /** What the search and the drop rules read; a hidden flight carries no names. */
  view: DragView;
}) {
  const rounds = view.rounds satisfies TournamentView["rounds"];
  const actions = useBracketActions(tournamentId);
  const nameOf = React.useCallback(
    (t: { kind: string; entryId?: number }) => (t.entryId === undefined ? null : (rounds.flatMap((r) => r.heats).flatMap((h) => h.entries).find((e) => e.entryId === t.entryId)?.name ?? null)),
    [rounds],
  );
  const dnd = useBracketDrag(view, actions, { target: nameOf });
  const host = React.useRef<HTMLDivElement>(null);
  useStickyScrollPadding(host);
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<number>>(new Set());
  const [query, setQuery] = React.useState("");
  const [index, setIndex] = React.useState<number | null>(null);
  const wantScroll = React.useRef(false);
  // After a bottle is removed the page refreshes (a new model); focus then goes to the first of these that is still there.
  const focusAfter = React.useRef<string[]>([]);
  React.useEffect(() => {
    const candidates = focusAfter.current;
    if (candidates.length === 0) return;
    focusAfter.current = [];
    for (const id of candidates) {
      const el = document.getElementById(id);
      el?.focus();
      if (el && document.activeElement === el) return; // a disabled button (a flight now first or last) takes no focus: try the next
    }
  }, [model]);

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
    <div ref={host} className="flex flex-col gap-3">
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
      <p role="status" aria-live="polite" className={dnd.message ? "text-sm text-muted-foreground" : "sr-only"}>
        {dnd.message}
      </p>
      {actions.error ? (
        <p role="alert" className="text-sm text-destructive">
          {actions.error}
        </p>
      ) : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,44rem),1fr))] items-start gap-x-8 gap-y-6">
        {model.columns.map((column) => {
          const isCollapsed = column.kind === "round" && collapsed.has(column.round);
          return (
            <section key={`${column.kind}-${column.round}`} aria-labelledby={`round-${column.round}`} className="min-w-0">
              <header className="sticky top-0 z-10 bg-background pb-1 pt-2">
                <h2 id={`round-${column.round}`} tabIndex={-1} className="flex items-baseline justify-between gap-3 focus:outline-none text-sm font-medium uppercase tracking-wide text-muted-foreground">
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
                    const others = column.flights.filter((other) => other.id !== flight.id && isOpen(other));
                    const heat = rounds.flatMap((r) => r.heats).find((h) => h.id === flight.id);
                    return (
                      <FlightCard
                        key={flight.id}
                        tournamentId={tournamentId}
                        flight={flight}
                        controls={controls[flight.id] ?? { play: false, undo: false, move: false, withdraw: [] }}
                        moveTargets={others
                          .filter((other) => other.count < heatSize)
                          .map((other) => ({ heatId: other.id, title: `Flight ${other.number} · ${other.title.text}`, count: other.count, size: heatSize }))}
                        anyOther={others.some((other) => !other.hidden)}
                        swapTargets={() => others.flatMap((other) => other.rows.map((row) => ({ entryId: row.entryId, name: row.name, flight: `Flight ${other.number}` })))}
                        dnd={dnd}
                        canDragRows={!!heat && canDragBottle(view, heat)}
                        canDragFlight={!!heat && canDragFlight(view, heat)}
                        steps={heat ? flightSteps(view, heat) : null}
                        marks={marks.get(flight.id) ?? noMarks}
                        actions={actions}
                        draft={draft}
                        onRemoved={(candidates) => {
                          focusAfter.current = [...candidates, `round-${column.round}`];
                        }}
                        onShifted={(candidates) => {
                          focusAfter.current = candidates;
                        }}
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
