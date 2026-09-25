"use client";

import * as React from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { serialiseLabelFilters, type LabelFilters } from "@/lib/expressions/filters";

/**
 * The URL is the state, exactly like the bottle grid's `useGridFilters` —
 * every change writes a new query string and navigates, so a filtered,
 * sorted, paged view of 500+ labels is a bookmark and the back button
 * behaves.
 */
export function useLabelFilters(filters: LabelFilters) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = React.useTransition();

  const apply = React.useCallback(
    (patch: Partial<LabelFilters>) => {
      // Any change to what is being shown sends you back to page one;
      // staying on page 7 of a list that now has two pages is a dead end.
      const resetsPage = Object.keys(patch).some((key) => key !== "page");
      const next: LabelFilters = { ...filters, ...patch, ...(resetsPage ? { page: 1 } : {}) };
      const query = serialiseLabelFilters(next);
      startTransition(() => {
        router.push((query === "" ? pathname : `${pathname}?${query}`) as Route, { scroll: false });
      });
    },
    [filters, pathname, router],
  );

  /** Adds or removes one id from a multi-select filter. */
  const toggleId = React.useCallback(
    (key: "brandIds" | "categoryIds", id: number) => {
      const current = filters[key];
      apply({ [key]: current.includes(id) ? current.filter((v) => v !== id) : [...current, id] });
    },
    [filters, apply],
  );

  return { apply, toggleId, pending };
}
