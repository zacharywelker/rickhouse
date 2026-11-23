"use client";

import * as React from "react";
import { dismissTtbAction } from "@/app/(app)/housekeeping/ttb-actions";
import { addColaAction } from "@/app/(app)/expressions/cola-actions";
import { ColaSearchDialog } from "@/components/expressions/cola-search-dialog";
import { useSectionNotices } from "@/components/housekeeping/section-notices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IDLE_RESULT, type ActionResult } from "@/lib/admin/types";
import type { TtbRow } from "@/lib/housekeeping/ttb-queries";

/**
 * One label with no TTB approval and the three ways to deal with it: search TTB (the label page's own dialog), paste a
 * TTB ID or registry link, or mark it "Not on TTB". Each of the first two attaches and refreshes the page, which removes
 * the row; what happened is reported in the notice list above the rows, where it survives that.
 */
export function TtbRowView({ row, lookupEnabled }: { row: TtbRow; lookupEnabled: boolean }) {
  const { add } = useSectionNotices();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Stable, because the paste field calls it again whenever it changes.
  const report = React.useCallback(
    (result: ActionResult) => {
      if (result.ok) {
        setError(null);
        if (result.message) add(`${row.name}: ${result.message}`);
      } else {
        setError(result.error);
      }
    },
    [add, row.name],
  );

  return (
    <div
      role="group"
      aria-label={`${row.name}: no TTB approval`}
      className="grid gap-x-5 gap-y-2 border border-b-0 border-border bg-card px-4 py-3 last:border-b sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="min-w-0">
        <p className="break-words font-semibold">{row.name}</p>
        <p className="text-xs text-muted-foreground">{row.meta}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        {lookupEnabled ? (
          <ColaSearchDialog expressionId={row.expressionId} brandName={row.brandName} triggerLabel="Find on TTB" onDone={report} />
        ) : null}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            setError(null);
            // Awaited here, not in an effect: the page refresh that follows a successful add removes this row first.
            startTransition(async () => {
              const result = await addColaAction(row.expressionId, IDLE_RESULT, data);
              if (result.ok) form.reset();
              report(result);
            });
          }}
        >
          <Label htmlFor={`ttb-id-${row.expressionId}`} className="text-xs text-muted-foreground">
            TTB ID
          </Label>
          <Input id={`ttb-id-${row.expressionId}`} name="ttbId" inputMode="numeric" autoComplete="off" placeholder="21132001000620" className="h-8 w-44 text-sm tabular-nums" />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            Add
          </Button>
        </form>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => report(await dismissTtbAction({ expressionId: row.expressionId, name: row.name })));
          }}
        >
          Not on TTB
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {error}
        </p>
      ) : null}
    </div>
  );
}
