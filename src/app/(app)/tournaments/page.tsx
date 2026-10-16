import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TournamentList } from "@/components/tournaments/tournament-list";
import { requireSession } from "@/lib/auth";
import { listTournaments } from "@/lib/tournaments/queries";

export const metadata: Metadata = { title: "Tournaments" };
export const dynamic = "force-dynamic";

const NEW = "/tournaments/new" as Route;
const RANKING = "/tournaments/ranking" as Route;

export default async function TournamentsPage() {
  const user = await requireSession();
  const tournaments = await listTournaments(user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl text-accent">Tournaments</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="min-h-11" asChild>
            <Link href={RANKING}>Ranking</Link>
          </Button>
          <Button className="min-h-11" asChild>
            <Link href={NEW}>New tournament</Link>
          </Button>
        </div>
      </div>

      {tournaments.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border-t border-border pt-6">
          <p>No tournaments yet. Pit bottles against each other, flight by flight, and see which one wins.</p>
          <Button className="min-h-11" asChild>
            <Link href={NEW}>New tournament</Link>
          </Button>
        </div>
      ) : (
        <TournamentList tournaments={tournaments} />
      )}
    </div>
  );
}
