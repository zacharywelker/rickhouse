import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Bracket } from "@/components/tournaments/bracket";
import { DraftField } from "@/components/tournaments/draft-field";
import { DraftBar } from "@/components/tournaments/draft-bar";
import { DraftSettings } from "@/components/tournaments/draft-settings";
import { RunBar } from "@/components/tournaments/run-bar";
import { Standings } from "@/components/tournaments/standings";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import { requireSession } from "@/lib/auth";
import { canReset, flightControls } from "@/lib/tournaments/bracket-actions";
import { buildBracketModel, bottlesText } from "@/lib/tournaments/bracket-model";
import { GROUP_KEY_LABELS } from "@/lib/tournaments/priority";
import { getTournament } from "@/lib/tournaments/queries";
import { standingRows } from "@/lib/tournaments/standings-model";
import { statusLine } from "@/lib/tournaments/summary-text";
import type { GroupKey } from "@/lib/tournaments/types";

export const metadata: Metadata = { title: "Tournament" };
export const dynamic = "force-dynamic";

const STATUS = { draft: "Draft", active: "Running", complete: "Finished" } as const;

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession();
  const { id: raw } = await params;
  if (!/^\d+$/.test(raw)) notFound();
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) notFound();

  const view = await getTournament(user.id, id);
  if (!view) notFound();
  const active = view.entries.filter((e) => e.status === "active").length;

  const draft = view.status === "draft";
  const categories = draft ? await REFERENCE_OPTION_LOADERS.categories(user.id) : [];
  const model = buildBracketModel(view);
  const controls = Object.fromEntries(view.rounds.flatMap((r) => r.heats.map((h) => [h.id, flightControls(view, h)])));
  const standings = standingRows(view);
  const order = view.groupOrder.map((k) => GROUP_KEY_LABELS[k as GroupKey] ?? k);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={"/tournaments" as Route} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Tournaments
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-3xl text-accent">{view.name}</h1>
          <Badge>{STATUS[view.status]}</Badge>
          {view.blind ? <Badge>Blind</Badge> : null}
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          {bottlesText(active)} · flights of {view.heatSize}
          {view.seeding === "random" ? " · random seeding" : ""}
        </p>
        {draft || view.status === "complete" ? null : (
          <p className="text-sm tabular-nums text-muted-foreground">
            {statusLine({ status: view.status, currentRound: view.currentRound, totalRounds: view.plan.length, progress: view.progress })}
          </p>
        )}
        {view.champion ? <p className="pt-1 text-lg font-medium">Champion: {view.champion.name}</p> : null}
        {view.fieldNote ? <p className="text-sm text-muted-foreground">{view.fieldNote}</p> : null}
      </div>

      {view.status === "active" && view.blind ? (
        <p className="max-w-3xl text-sm text-muted-foreground">Blind: names stay hidden until a flight is decided. Open a flight to play it.</p>
      ) : null}

      {draft ? <DraftField key={JSON.stringify(view.entries.map((e) => [e.kind, e.bottleId, e.expressionId, e.name]))} tournamentId={view.id} entries={view.entries} categories={categories} /> : null}

      <div className={draft ? "grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_21rem]" : ""}>
        <div className="flex min-w-0 flex-col gap-3">
          {draft ? (
            <p className="text-sm text-muted-foreground">
              {model.columns.length > 0
                ? `Round 1 preview, matched by ${view.seeding === "random" ? "chance" : order.join(", then ").toLowerCase()}. Each flight is named from what its bottles share, and you can rename it. Move a bottle to another flight, or swap two bottles, with its menu.`
                : "Add at least two entries to see the round 1 preview."}
            </p>
          ) : null}
          {draft && model.unknownProof > 0 ? (
            <p className="text-sm text-muted-foreground">
              {model.unknownProof} {model.unknownProof === 1 ? "bottle has" : "bottles have"} no proof recorded, so {model.unknownProof === 1 ? "it was" : "they were"} grouped last.
            </p>
          ) : null}
          <Bracket tournamentId={view.id} model={model} heatSize={view.heatSize} draft={draft} controls={controls} rounds={view.rounds} />
        </div>
        {draft ? (
          <DraftSettings
            key={JSON.stringify([view.name, view.heatSize, view.blind, view.seeding, view.groupOrder, view.fieldNote])}
            tournamentId={view.id}
            values={{ name: view.name, heatSize: view.heatSize, blind: view.blind, seeding: view.seeding, groupOrder: view.groupOrder as GroupKey[], fieldNote: view.fieldNote }}
          />
        ) : null}
      </div>

      {draft ? null : (
        <>
          <Standings rows={standings} final={view.status === "complete"} />
          <p className="text-sm">
            <Link href={"/tournaments/ranking" as Route} className="underline underline-offset-4">
              Ranking across all tournaments
            </Link>
          </p>
        </>
      )}

      {draft ? <DraftBar tournamentId={view.id} entryCount={active} renamed={model.renamed} /> : <RunBar tournamentId={view.id} canReset={canReset(view)} />}
    </div>
  );
}
