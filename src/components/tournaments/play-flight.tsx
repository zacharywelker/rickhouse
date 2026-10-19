"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { drawHeatAction, recordHeatAction, setGlassesAction } from "@/app/(app)/tournaments/actions";
import { Button } from "@/components/ui/button";
import { flowReducer, initialFlow, moveItem, shuffledLetters, type MappingRow } from "@/lib/tournaments/play-flow";
import { PlayMapping } from "./play-mapping";
import { RankList, type RankItem } from "./rank-list";

export type PlayEntry = { entryId: number; name: string; detail: string };
export type PlayDecided = { places: { place: number; name: string }[]; champion: string | null; nextHeatId: number | null };

type Props = {
  tournamentId: number;
  heatId: number;
  blind: boolean;
  /** The pourer drew this flight from the bracket: open straight on the glasses. */
  drawn: boolean;
  /** Set when the flight was already decided, in a round not being played, or the tournament not running, when the page loaded. */
  stopped: "decided" | "not-running" | "not-current" | null;
  /** An open tournament's bottles in pour order; empty for a blind one. */
  entries: PlayEntry[];
  decided: PlayDecided | null;
};

/** A heading that takes focus when its stage appears, so a keyboard or screen-reader user lands on the new stage. */
function StageHeading({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => ref.current?.focus(), []);
  return (
    <h2 ref={ref} tabIndex={-1} className="text-lg font-medium focus:outline-none">
      {children}
    </h2>
  );
}

const ALREADY = /already has a result/i;

/** Plays one flight: ranks it and records the result. Blind flights go through start, glasses, rank and reveal. */
const STOPPED_TEXT = {
  decided: "This flight is already decided.",
  "not-running": "This tournament is not running.",
  "not-current": "This flight is not in the round being played.",
} as const;

export function PlayFlight(props: Props) {
  const { tournamentId, blind } = props;
  const back = `/tournaments/${tournamentId}` as Route;
  // A flight that was not playable when the page loaded stays a one-line notice, even after the page refreshes under a result.
  const [stopped] = React.useState(props.stopped);
  if (stopped) {
    return (
      <p className="text-sm" role="status">
        {STOPPED_TEXT[stopped]}{" "}
        <Link href={back} className="underline underline-offset-4">
          Back to the bracket
        </Link>
      </p>
    );
  }
  return blind ? <BlindFlight {...props} /> : <OpenFlight {...props} />;
}

function useRecord(tournamentId: number, heatId: number, onDone: () => void) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);

  function record(input: unknown) {
    if (submitted) return;
    setError(null);
    setSubmitted(true);
    startTransition(async () => {
      const result = await recordHeatAction(tournamentId, heatId, input);
      if (result.ok) {
        onDone();
        router.refresh();
        return;
      }
      if (ALREADY.test(result.error)) {
        onDone();
        router.refresh();
        return;
      }
      setSubmitted(false);
      setError(result.error);
    });
  }
  return { pending: pending || submitted, error, record };
}

function RecordButton({ pending, error, onClick }: { pending: boolean; error: string | null; onClick: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="button" className="min-h-11" disabled={pending} onClick={onClick}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Record result
        </Button>
      </div>
    </div>
  );
}

function OpenFlight(props: Props) {
  const [order, setOrder] = React.useState(props.entries);
  const [done, setDone] = React.useState(false);
  const { pending, error, record } = useRecord(props.tournamentId, props.heatId, () => setDone(true));
  if (done) return <Revealed {...props} />;
  const items: RankItem[] = order.map((e) => ({ key: String(e.entryId), title: e.name, detail: e.detail, label: e.name }));
  return (
    <section className="flex flex-col gap-4" aria-label="Rank the bottles">
      <h2 className="text-lg font-medium">Rank the bottles, best first</h2>
      <RankList items={items} disabled={pending} onMove={(i, d) => setOrder((o) => moveItem(o, i, d))} />
      <RecordButton pending={pending} error={error} onClick={() => record({ ranking: order.map((e) => e.entryId) })} />
    </section>
  );
}

function BlindFlight(props: Props) {
  const { tournamentId, heatId } = props;
  const [flow, dispatch] = React.useReducer(flowReducer, props.drawn, initialFlow);
  const [error, setError] = React.useState<string | null>(null);
  const [working, startTransition] = React.useTransition();
  const record = useRecord(tournamentId, heatId, () => dispatch({ type: "recorded" }));

  const load = React.useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await drawHeatAction(tournamentId, heatId);
      if (!result.ok) {
        setError(result.error);
        dispatch({ type: "failed" });
        return;
      }
      const rows: MappingRow[] = result.heat.glasses.map((g) => ({
        entryId: g.entry.entryId,
        name: g.entry.name,
        proof: g.entry.proof,
        mashbill: g.entry.mashbill,
        ageYears: g.entry.ageYears,
        glass: g.glass,
      }));
      dispatch({ type: "loaded", rows });
    });
  }, [tournamentId, heatId]);

  // Arriving from the bracket's Draw button: the flight is already chosen, so open its glasses at once.
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (props.drawn && !asked.current) {
      asked.current = true;
      load();
    }
  }, [props.drawn, load]);

  function save(rows: MappingRow[]) {
    setError(null);
    startTransition(async () => {
      const sent = rows.map((r) => ({ entryId: r.entryId, glass: r.glass }));
      const result = await setGlassesAction(tournamentId, heatId, sent);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dispatch({ type: "saved", sent });
    });
  }

  function hide() {
    dispatch({ type: "hide" });
    // The address no longer says "drawn", so a reload cannot open the glasses again by itself.
    window.history.replaceState(null, "", `/tournaments/${tournamentId}/play/${heatId}`);
  }

  if (flow.stage === "revealed") return <Revealed {...props} />;

  if (flow.stage === "start" || flow.stage === "loading") {
    return (
      <section className="flex flex-col gap-4" aria-label="Start">
        <p className="max-w-2xl text-sm">Set the glasses, then hide the names and taste. The names stay hidden until you record the result.</p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div>
          <Button
            type="button"
            className="min-h-11"
            disabled={flow.stage === "loading"}
            onClick={() => {
              dispatch({ type: "show" });
              load();
            }}
          >
            {flow.stage === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Show the glasses
          </Button>
        </div>
      </section>
    );
  }

  if (flow.stage === "mapping") {
    return (
      <div className="flex flex-col gap-3">
        <PlayMapping
          rows={flow.rows}
          saved={flow.saved}
          pending={working}
          onGlass={(entryId, glass) => dispatch({ type: "setGlass", entryId, glass })}
          onShuffle={() => dispatch({ type: "setAll", letters: shuffledLetters(flow.rows.length) })}
          onSave={() => save(flow.rows)}
          onHide={hide}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const items: RankItem[] = flow.order.map((g) => ({ key: g, title: `Glass ${g}`, label: `glass ${g}` }));
  return (
    <section className="flex flex-col gap-4" aria-label="Rank the glasses">
      <StageHeading>Rank the glasses, best first</StageHeading>
      <RankList items={items} disabled={record.pending} onMove={(index, delta) => dispatch({ type: "move", index, delta })} />
      <RecordButton pending={record.pending} error={record.error} onClick={() => record.record({ glasses: flow.order })} />
      <p className="text-sm">
        <Link href={`/tournaments/${tournamentId}` as Route} className="underline underline-offset-4">
          Leave without recording
        </Link>
      </p>
    </section>
  );
}

function Revealed({ tournamentId, decided }: Props) {
  const back = `/tournaments/${tournamentId}` as Route;
  if (!decided) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <StageHeading>Result recorded</StageHeading>
        <p className="text-sm">
          <Link href={back} className="underline underline-offset-4">
            Back to the bracket
          </Link>
        </p>
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-4" aria-label="Result" role="status">
      <StageHeading>Result recorded</StageHeading>
      <ol className="border-b border-border">
        {decided.places.map((p) => (
          <li key={p.place} className="flex min-h-11 items-center gap-3 border-t border-border py-1.5 text-sm">
            <span className="w-6 shrink-0 text-center text-base font-semibold tabular-nums">{p.place}</span>
            <span>{p.name}</span>
          </li>
        ))}
      </ol>
      {decided.champion ? <p className="text-lg font-medium">The tournament is finished. Champion: {decided.champion}</p> : null}
      <div className="flex flex-wrap gap-2">
        {decided.nextHeatId !== null ? (
          <Button asChild className="min-h-11">
            <Link href={`/tournaments/${tournamentId}/play/${decided.nextHeatId}` as Route}>Next flight</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" className="min-h-11">
          <Link href={back}>Back to the bracket</Link>
        </Button>
      </div>
    </section>
  );
}
