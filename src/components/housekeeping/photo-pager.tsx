"use client";

import type { Route } from "next";
import Link from "next/link";
import { useSavedCount } from "@/components/housekeeping/saved-count";
import { Button } from "@/components/ui/button";
import { nextOffset, photoHref, previousOffset, type PhotoTab } from "@/lib/housekeeping/photo-params";

/** The range line with Previous and Next. Next steps forward by a page less the cards saved on this one. */
export function PhotoPager({
  tab,
  per,
  total,
  window,
}: {
  tab: PhotoTab;
  per: number;
  total: number;
  window: { offset: number; from: number; to: number; hasPrev: boolean; hasNext: boolean };
}) {
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
            <Link href={photoHref(tab, per, previousOffset(window.offset, per)) as Route}>Previous</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        {window.hasNext ? (
          <Button asChild variant="outline" size="sm">
            <Link href={photoHref(tab, per, nextOffset(window.offset, per, saved)) as Route}>Next</Link>
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
