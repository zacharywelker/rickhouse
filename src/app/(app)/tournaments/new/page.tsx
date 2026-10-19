import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { TournamentSetup } from "@/components/tournaments/tournament-setup";
import { requireSession } from "@/lib/auth";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";

export const metadata: Metadata = { title: "New tournament" };
export const dynamic = "force-dynamic";

export default async function NewTournamentPage() {
  const user = await requireSession();
  const categories = await REFERENCE_OPTION_LOADERS.categories(user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={"/tournaments" as Route} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Tournaments
        </Link>
        <h1 className="text-3xl text-accent">New tournament</h1>
        <p className="text-sm text-muted-foreground">Choose who competes. You can come back to the draft over as many nights as you like.</p>
      </div>
      <TournamentSetup categories={categories} />
    </div>
  );
}
