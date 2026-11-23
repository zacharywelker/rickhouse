"use client";

import type { Route } from "next";
import Link from "next/link";
import { useSavedCount } from "@/components/housekeeping/saved-count";
import { Button } from "@/components/ui/button";
import { pageHref, type PageState } from "@/lib/housekeeping/page-state";
import { nextOffset, previousOffset } from "@/lib/housekeeping/photo-params";

/** The range line with Previous and Next. Next steps forward by a page less the cards saved on this one. */
export function PhotoPager({
  state,
  total,
  window,
}: {
  state: PageState;
  total: number;
  window: { offset: number; from: number; to: number; hasPrev: boolean; hasNext: boolean };
}) {
  const { per } = state;
  const { saved } = useSavedCount();
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm text-muted-foreground">
      <span>
        {window.from}–{window.to} of {total}
        {saved > 0 ? ` · ${saved} saved just now` : ""}
      </span>
      <span className="flex gap-2">
        {window.hasPrev ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(state, { offset: previousOffset(window.offset, per) }) as Route}>Previous</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        {window.hasNext ? (
          <Button asChild variant="outline" size="sm">
            <Link href={pageHref(state, { offset: nextOffset(window.offset, per, saved) }) as Route}>Next</Link>
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
