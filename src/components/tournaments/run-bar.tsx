"use client";

import * as React from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { drawHeatAction, resetRoundAction } from "@/app/(app)/tournaments/actions";
import { Button } from "@/components/ui/button";
import { PageBar } from "./page-bar";

/**
 * The bar of a running or finished tournament. Running: Reset to automatic (regroups the flights not yet decided; no
 * confirmation, as in a draft) beside the page buttons; in a blind tournament Draw a flight picks one at random and opens the pourer's glasses. Finished: the
 * page buttons only.
 */
export function RunBar({ tournamentId, canReset, canDraw }: { tournamentId: number; canReset: boolean; canDraw: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setError(null);
    startTransition(async () => {
      const result = await resetRoundAction(tournamentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function draw() {
    setError(null);
    startTransition(async () => {
      const result = await drawHeatAction(tournamentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/tournaments/${tournamentId}/play/${result.heat.heatId}?drawn=1` as Route);
    });
  }

  return (
    <PageBar>
      {canDraw ? (
        <Button type="button" className="min-h-11" disabled={pending} onClick={draw}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Draw a flight
        </Button>
      ) : null}
      {canReset ? (
        <>
          <Button type="button" variant="outline" className="min-h-11" aria-label="Reset to automatic" disabled={pending} onClick={reset}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            <span>
              Reset<span className="hidden sm:inline"> to automatic</span>
            </span>
          </Button>
          <p className={error ? "min-w-0 basis-full text-xs" : "hidden min-w-0 text-xs text-muted-foreground md:block"} role={error ? "alert" : "status"}>
            {error ? <span className="text-destructive">{error}</span> : "Regroups the flights not yet decided and clears their names. Decided flights stay."}
          </p>
        </>
      ) : null}
    </PageBar>
  );
}
