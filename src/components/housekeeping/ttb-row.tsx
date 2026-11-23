"use client";

import * as React from "react";
import { dismissTtbAction } from "@/app/(app)/housekeeping/ttb-actions";
import { AddById, ColaSearchDialog } from "@/components/expressions/cola-search-dialog";
import { useSectionNotices } from "@/components/housekeeping/section-notices";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/admin/types";
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
        <AddById expressionId={row.expressionId} label="TTB ID" onDone={report} />
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
