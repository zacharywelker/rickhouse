"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { resetRoundAction, startTournamentAction } from "@/app/(app)/tournaments/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageBar } from "./page-bar";

/**
 * The draft's bar: Start tournament (after a confirmation: the field locks) and Reset to automatic (no confirmation;
 * it regroups and clears the names you gave, as the spec decided), beside the page buttons.
 */
export function DraftBar({ tournamentId, entryCount, renamed }: { tournamentId: number; entryCount: number; renamed: number }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const short = entryCount < 2;

  function run(call: () => ReturnType<typeof startTournamentAction>, done?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await call();
      if (!result.ok) {
        setError(result.error);
        done?.();
        return;
      }
      done?.();
      router.refresh();
    });
  }

  return (
    <PageBar>
      <Button type="button" className="min-h-11" disabled={short || pending} onClick={() => setConfirming(true)}>
        Start tournament
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        aria-label="Reset to automatic"
        disabled={short || pending}
        onClick={() => run(() => resetRoundAction(tournamentId))}
      >
        <span>
          Reset<span className="hidden sm:inline"> to automatic</span>
        </span>
      </Button>
      <p className={error ? "min-w-0 basis-full text-xs" : "hidden min-w-0 text-xs tabular-nums text-muted-foreground sm:block"} role={error ? "alert" : "status"}>
        {error ? <span className="text-destructive">{error}</span> : short ? "Starting needs at least 2 entries." : renamed > 0 ? `${renamed} ${renamed === 1 ? "flight" : "flights"} renamed.` : ""}
      </p>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start this tournament?</DialogTitle>
            <DialogDescription>The field locks when you start. You can still withdraw bottles.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Not yet
              </Button>
            </DialogClose>
            <Button type="button" className="min-h-11" disabled={pending} onClick={() => run(() => startTournamentAction(tournamentId), () => setConfirming(false))}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Start tournament
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageBar>
  );
}
