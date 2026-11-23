"use client";

import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pageHref, type PageState } from "@/lib/housekeeping/page-state";
import { previousOffset } from "@/lib/housekeeping/photo-params";

/**
 * The range line with Previous and Next for the TTB approvals section. Unlike the photo cards, a finished row leaves the
 * list (the page refreshes), so Next is simply a page on. Links keep the other sections' places in the address.
 */
export function WindowPager({
  state,
  total,
  window,
}: {
  state: PageState;
  total: number;
  window: { offset: number; from: number; to: number; hasPrev: boolean; hasNext: boolean };
}) {
  const per = state.ttbPer;
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm text-muted-foreground">
      <span>
        {window.from}–{window.to} of {total}
      </span>
      <span className="flex gap-2">
        {window.hasPrev ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(state, { ttbOffset: previousOffset(window.offset, per) }) as Route}>Previous</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        {window.hasNext ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(state, { ttbOffset: window.offset + per }) as Route}>Next</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </span>
    </div>
  );
}
