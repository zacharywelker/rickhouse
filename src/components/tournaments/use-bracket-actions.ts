"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { moveEntryAction, renameHeatAction } from "@/app/(app)/tournaments/actions";
import type { TournamentActionResult } from "@/lib/tournaments/action-result";

/** The bracket's edits: each runs a server action, refreshes the page on success and keeps one inline error otherwise. */
export function useBracketActions(tournamentId: number) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(
    (call: () => Promise<TournamentActionResult>, done?: () => void) => {
      setError(null);
      startTransition(async () => {
        const result = await call();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        done?.();
        router.refresh();
      });
    },
    [router],
  );

  return {
    pending,
    error,
    clearError: () => setError(null),
    move: (entryId: number, toHeatId: number, done?: () => void) => run(() => moveEntryAction(tournamentId, entryId, toHeatId), done),
    rename: (heatId: number, label: string | null, done?: () => void) => run(() => renameHeatAction(tournamentId, heatId, label), done),
  };
}

export type BracketActions = ReturnType<typeof useBracketActions>;
