"use client";

import * as React from "react";
import { dismissPairAction, mergePairAction } from "@/app/(app)/housekeeping/duplicate-actions";
import { useDuplicateNotices } from "@/components/housekeeping/duplicate-notices";
import { Button } from "@/components/ui/button";
import type { DuplicateKind } from "@/lib/housekeeping/duplicate-kinds";
import type { PairView, SideView } from "@/lib/housekeeping/duplicate-queries";
import type { MergePreview } from "@/lib/housekeeping/merge-reference";
import { describeMoves } from "@/lib/housekeeping/move-text";
import { cn } from "@/lib/utils";

/** What the "uses" count counts, by kind. */
const USES: Record<DuplicateKind, readonly [string, string]> = {
  brands: ["label", "labels"],
  distilleries: ["label", "labels"],
  companies: ["brand or distillery", "brands and distilleries"],
  finishes: ["label", "labels"],
  ingredients: ["label", "labels"],
  mashbills: ["label", "labels"],
  cooperages: ["label", "labels"],
  stores: ["bottle", "bottles"],
  tags: ["bottle", "bottles"],
};

/** The removed distillery's name is kept as another name on the survivor. */
const KEEPS_OTHER_NAME: ReadonlySet<DuplicateKind> = new Set(["distilleries"]);

const uses = (kind: DuplicateKind, count: number) => `${count} ${USES[kind][count === 1 ? 0 : 1]}`;
const valueText = (field: string, value: unknown) => (field.endsWith("Id") ? "" : `: ${String(value)}`);

/**
 * One likely pair: why it matched, both sides, which to keep, exactly what will move, anything only the other side
 * has (offered, ticked), and the two answers: merge, or "not a duplicate". A merge cannot be undone, so it asks once.
 */
export function DuplicatePairCard({ pair, previews }: { pair: PairView; previews: { aKeeps: MergePreview; bKeeps: MergePreview } }) {
  const notices = useDuplicateNotices();
  const [keep, setKeep] = React.useState<"a" | "b">(pair.b.uses > pair.a.uses ? "b" : "a");
  const [unticked, setUnticked] = React.useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const survivor: SideView = keep === "a" ? pair.a : pair.b;
  const removed: SideView = keep === "a" ? pair.b : pair.a;
  const preview = keep === "a" ? previews.aKeeps : previews.bKeeps;
  const taking = preview.adoptable.filter((offer) => !unticked.has(offer.field));
  const moves = describeMoves(preview.moves);

  function choose(side: "a" | "b") {
    setKeep(side);
    setUnticked(new Set());
    setConfirming(false);
    setError(null);
  }

  function run(action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      setConfirming(false);
      if (result.ok) {
        notices.add(result.message);
        setDone(result.message);
      } else {
        setError(result.error);
      }
    });
  }

  // The notice list above the cards announces the result; this stays on screen only until the refresh removes the card.
  if (done) return <p className="border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">{done}</p>;

  return (
    <div role="group" aria-label={`Likely duplicates: ${pair.a.name} and ${pair.b.name}`} className="border border-border bg-card">
      <div className="border-b border-border bg-muted px-4 py-2 text-sm">
        <b className="font-semibold">{pair.score <= 1 ? "Very likely" : "Likely"}</b> · {pair.reason}
      </div>
      <div className="grid sm:grid-cols-2">
        {(["a", "b"] as const).map((side) => {
          const item = pair[side];
          return (
            <label
              key={side}
              className={cn(
                "flex cursor-pointer flex-col gap-1 px-4 py-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ring",
                side === "b" && "border-t border-border sm:border-l sm:border-t-0",
                keep === side && "bg-muted shadow-[inset_0_0_0_2px_var(--foreground)]",
              )}
            >
              <input type="radio" name={`keep-${pair.key}`} className="sr-only" checked={keep === side} onChange={() => choose(side)} />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Keep this one</span>
              <span className="break-words text-base font-semibold">{item.name}</span>
              <span className="text-sm text-muted-foreground">
                {uses(pair.kind, item.uses)}
                {item.detail ? ` · ${item.detail}` : ""}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-sm">
        {preview.blocked ? (
          <p role="alert" className="text-destructive">
            {preview.blocked}
          </p>
        ) : (
          <>
            <p className="text-muted-foreground">
              {moves ? (
                <>
                  Merging moves <b className="font-semibold text-foreground">{moves}</b> to <b className="font-semibold text-foreground">{survivor.name}</b>
                </>
              ) : (
                <>Nothing points at {removed.name}, so only the row itself is removed</>
              )}
              {KEEPS_OTHER_NAME.has(pair.kind) ? `, and keeps “${removed.name}” as another name.` : "."}
            </p>
            {preview.adoptable.length > 0 ? (
              <fieldset className="flex flex-col gap-1">
                <legend className="text-muted-foreground">Also keep from {removed.name}:</legend>
                {preview.adoptable.map((offer) => (
                  <label key={offer.field} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-foreground"
                      checked={!unticked.has(offer.field)}
                      onChange={(event) =>
                        setUnticked((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.delete(offer.field);
                          else next.add(offer.field);
                          return next;
                        })
                      }
                    />
                    <span>
                      {offer.label}
                      {valueText(offer.field, offer.value)}
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
          </>
        )}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {confirming ? (
            <>
              <span className="mr-auto text-muted-foreground">This can’t be undone.</span>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() => mergePairAction({ kind: pair.kind, survivorId: survivor.id, removedId: removed.id, adopt: taking.map((offer) => offer.field) }))
                }
              >
                {pending ? "Merging…" : "Yes, merge"}
              </Button>
            </>
          ) : (
            <>
              <span className="mr-auto" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => run(() => dismissPairAction({ kind: pair.kind, aId: pair.a.id, bId: pair.b.id }))}
              >
                Not a duplicate
              </Button>
              <Button type="button" size="sm" disabled={pending || preview.blocked !== null} onClick={() => setConfirming(true)}>
                Merge
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
