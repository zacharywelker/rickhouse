import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Bracket } from "@/components/tournaments/bracket";
import { DraftBar } from "@/components/tournaments/draft-bar";
import { DraftSettings } from "@/components/tournaments/draft-settings";
import { requireSession } from "@/lib/auth";
import { buildBracketModel, bottlesText } from "@/lib/tournaments/bracket-model";
import { GROUP_KEY_LABELS } from "@/lib/tournaments/priority";
import { getTournament } from "@/lib/tournaments/queries";
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
  const model = buildBracketModel(view);
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
        {view.fieldNote ? <p className="text-sm text-muted-foreground">{view.fieldNote}</p> : null}
      </div>

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
          <Bracket tournamentId={view.id} model={model} heatSize={view.heatSize} editable={draft} />
        </div>
        {draft ? (
          <DraftSettings
            key={JSON.stringify([view.name, view.heatSize, view.blind, view.seeding, view.groupOrder, view.fieldNote])}
            tournamentId={view.id}
            values={{ name: view.name, heatSize: view.heatSize, blind: view.blind, seeding: view.seeding, groupOrder: view.groupOrder as GroupKey[], fieldNote: view.fieldNote }}
          />
        ) : null}
      </div>

      {draft ? <DraftBar tournamentId={view.id} entryCount={active} renamed={model.renamed} /> : null}
    </div>
  );
}
