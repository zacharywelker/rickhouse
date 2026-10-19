import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PlayFlight, type PlayDecided } from "@/components/tournaments/play-flight";
import { requireSession } from "@/lib/auth";
import { nextPendingId } from "@/lib/tournaments/bracket-actions";
import { buildBracketModel } from "@/lib/tournaments/bracket-model";
import { getTournament } from "@/lib/tournaments/queries";

export const metadata: Metadata = { title: "Play a flight" };
export const dynamic = "force-dynamic";

const positive = (raw: string): number | null => (/^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) > 0 ? Number(raw) : null);

export default async function PlayPage({ params, searchParams }: { params: Promise<{ id: string; heatId: string }>; searchParams: Promise<{ drawn?: string }> }) {
  const user = await requireSession();
  const { id: rawId, heatId: rawHeat } = await params;
  const { drawn } = await searchParams;
  const id = positive(rawId);
  const heatId = positive(rawHeat);
  if (id === null || heatId === null) notFound();

  const view = await getTournament(user.id, id);
  if (!view) notFound();
  const heat = view.rounds.flatMap((r) => r.heats).find((h) => h.id === heatId);
  if (!heat) notFound();

  const model = buildBracketModel(view);
  const flight = model.columns.flatMap((c) => (c.kind === "round" ? c.flights : [])).find((f) => f.id === heatId);
  const playable = view.status === "active" && heat.status === "pending" && heat.round === view.currentRound;
  const stopped = playable ? null : heat.status === "pending" ? (view.status !== "active" ? "not-running" : "not-current") : "decided";

  const decided: PlayDecided | null =
    heat.status === "decided"
      ? {
          places: heat.entries.flatMap((e) => (e.place === null ? [] : [{ place: e.place, name: e.name }])),
          champion: view.champion?.name ?? null,
          nextHeatId: nextPendingId(view, heatId),
        }
      : null;

  const blind = view.blind;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/tournaments/${id}` as Route} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {view.name}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-3xl text-accent">{flight?.title.text ?? "Flight"}</h1>
          {blind ? <Badge>Blind</Badge> : null}
        </div>
        {flight?.meta ? <p className="text-sm text-muted-foreground">{flight.meta}</p> : null}
        <p className="text-sm tabular-nums text-muted-foreground">Round {heat.round} · {heat.entryCount} bottles</p>
      </div>
      <PlayFlight
        tournamentId={id}
        heatId={heatId}
        blind={blind}
        drawn={drawn === "1" && blind}
        stopped={stopped}
        entries={
          !blind && playable && flight
            ? flight.rows.map((r) => ({ entryId: r.entryId, name: r.name, detail: `${r.proof}${r.proof === "—" ? "" : " proof"} · ${r.mashbill} · ${r.age}` }))
            : []
        }
        decided={decided}
      />
    </div>
  );
}
