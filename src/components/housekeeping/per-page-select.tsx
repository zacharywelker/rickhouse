"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";

/** How many cards a page shows. Changing it keeps the tab and goes back to the first page. */
export function PerPageSelect({ per, options }: { per: number; options: readonly number[] }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      Show
      <select
        aria-label="Per page"
        value={per}
        className="h-8 border border-border bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          next.set("per", event.target.value);
          next.delete("page");
          router.replace(`/housekeeping?${next.toString()}` as Route);
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      per page
    </label>
  );
}
