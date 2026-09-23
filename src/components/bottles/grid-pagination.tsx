"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PAGE_SIZES, type BottleFilters } from "@/lib/bottles/filters";
import { useGridFilters } from "./use-grid-filters";

export function GridPagination({
  filters,
  page,
  pageCount,
  total,
}: {
  filters: BottleFilters;
  page: number;
  pageCount: number;
  total: number;
}) {
  const { apply, pending } = useGridFilters(filters);
  const from = total === 0 ? 0 : (page - 1) * filters.pageSize + 1;
  const to = Math.min(total, page * filters.pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
        {total === 0 ? "No bottles" : `${from}–${to} of ${total}`}
      </p>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="page-size" className="text-xs">
            Per page
          </Label>
          <select
            id="page-size"
            value={filters.pageSize}
            onChange={(e) => apply({ pageSize: Number(e.target.value) })}
            className="h-8 border border-input bg-card px-2 text-sm"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || pending}
            onClick={() => apply({ page: page - 1 })}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-2 text-sm tabular-nums text-muted-foreground">
            {page} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount || pending}
            onClick={() => apply({ page: page + 1 })}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
