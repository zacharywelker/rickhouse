"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * How many cards or rows a window shows. Changing it keeps everything else in the address and goes back to the start of
 * this window. `param` and `resetParam` name this section's page size and offset in the address (`per`/`offset` for
 * Photos, `tp`/`to` for TTB approvals); `label` tells two of them apart.
 */
export function PerPageSelect({
  per,
  options,
  label = "Per page",
  param = "per",
  resetParam = "offset",
}: {
  per: number;
  options: readonly number[];
  label?: string;
  param?: string;
  resetParam?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      Show
      <select
        aria-label={label}
        value={per}
        className="h-8 border border-border bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          next.set(param, event.target.value);
          next.delete(resetParam);
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
