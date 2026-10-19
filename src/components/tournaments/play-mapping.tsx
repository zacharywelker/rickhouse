"use client";

import { Loader2, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  lettersFor,
  lettersProblem,
  type MappingRow,
} from "@/lib/tournaments/play-flow";
import { formatAge, formatProof } from "@/lib/tournaments/bracket-model";

/**
 * The pourer's set-up screen: every bottle beside its glass letter. This is the only place a blind flight shows its
 * names. Solo tasters can change the letters (by hand or Shuffle) and save them; hiding needs them saved.
 */
export function PlayMapping({
  rows,
  saved,
  pending,
  onGlass,
  onShuffle,
  onSave,
  onHide,
}: {
  rows: MappingRow[];
  saved: boolean;
  pending: boolean;
  onGlass: (entryId: number, glass: string) => void;
  onShuffle: () => void;
  onSave: () => void;
  onHide: () => void;
}) {
  const letters = lettersFor(rows.length);
  const problem = lettersProblem(rows.map((r) => r.glass));
  return (
    <section className="flex flex-col gap-4" aria-label="Glasses">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Pourer or solo: set the glasses, then hide. Hand the device over only
        after you tap Hide and hand over.
      </p>
      <ul className="border-b border-border">
        {rows.map((row) => (
          <li
            key={row.entryId}
            className="flex min-h-14 items-center gap-3 border-t border-border py-1.5"
          >
            <label className="flex shrink-0 flex-col text-xs text-muted-foreground">
              <span className="sr-only">Glass for {row.name}</span>
              <select
                aria-label={`Glass for ${row.name}`}
                value={row.glass}
                disabled={pending}
                onChange={(e) => onGlass(row.entryId, e.target.value)}
                className="h-11 w-16 border border-input bg-card px-2 text-center text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {letters.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm leading-snug">{row.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatProof(row.proof)}
                {row.proof === null ? "" : " proof"} · {row.mashbill ?? "—"} ·{" "}
                {formatAge(row.ageYears)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onShuffle}
        >
          <Shuffle className="size-4" aria-hidden />
          Shuffle
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={pending || saved || problem !== null}
          onClick={onSave}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          Save letters
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={pending || !saved || problem !== null}
          onClick={onHide}
        >
          Hide and hand over
        </Button>
        {saved ? null : (
          <span role="status" className="text-xs text-muted-foreground">
            Save the letters before hiding.
          </span>
        )}
      </div>
    </section>
  );
}
