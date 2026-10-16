"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { resetRoundAction } from "@/app/(app)/tournaments/actions";
import { Button } from "@/components/ui/button";
import { PageBar } from "./page-bar";

/**
 * The bar of a running or finished tournament. Running: Reset to automatic (regroups the flights not yet decided; no
 * confirmation, as in a draft) beside the page buttons; a Draw button joins it with the pourer's screen. Finished: the
 * page buttons only.
 */
export function RunBar({ tournamentId, canReset }: { tournamentId: number; canReset: boolean }) {
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

  return (
    <PageBar>
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
