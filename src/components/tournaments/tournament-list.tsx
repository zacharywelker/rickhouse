import Link from "next/link";
import type { Route } from "next";
import { Badge } from "@/components/ui/badge";
import { DeleteTournamentButton } from "@/components/tournaments/delete-tournament-button";
import type { TournamentSummary } from "@/lib/tournaments/queries";
import { entriesLabel, heatSizeLabel, statusLine } from "@/lib/tournaments/summary-text";
import { formatDate } from "@/lib/utils";

/** One row per tournament, newest first as the query returns them; hairline rules between rows, no cards (DESIGN.md). */
export function TournamentList({ tournaments }: { tournaments: TournamentSummary[] }) {
  return (
    <ul className="border-b border-border">
      {tournaments.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border py-3">
          <div className="min-w-0 flex-1 basis-64">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={`/tournaments/${t.id}` as Route} className="text-lg font-medium leading-tight underline-offset-4 hover:underline">
                {t.name}
              </Link>
              {t.blind ? <Badge>Blind</Badge> : null}
            </div>
            <p className="mt-1 flex flex-wrap gap-x-2 text-sm tabular-nums text-muted-foreground">
              {[statusLine(t), entriesLabel(t.entryCount), heatSizeLabel(t.heatSize), `Made ${formatDate(t.createdAt)}`].map((part, i, all) => (
                <span key={part} className="whitespace-nowrap">
                  {part}
                  {i < all.length - 1 ? " ·" : ""}
                </span>
              ))}
            </p>
          </div>
          {t.status !== "active" ? <DeleteTournamentButton tournamentId={t.id} name={t.name} /> : null}
        </li>
      ))}
    </ul>
  );
}
