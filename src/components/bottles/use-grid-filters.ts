"use client";

import * as React from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { serialiseFilters, type BottleFilters } from "@/lib/bottles/filters";

/**
 * The URL is the state. Every change writes a new query string and navigates,
 * which makes any view bookmarkable and the back button meaningful (SPEC M4).
 */
export function useGridFilters(filters: BottleFilters) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = React.useTransition();

  const apply = React.useCallback(
    (patch: Partial<BottleFilters>) => {
      // Any change to what is being shown sends you back to page one;
      // staying on page 7 of a list that now has two pages is a dead end.
      const resetsPage = Object.keys(patch).some((key) => key !== "page");
      const next: BottleFilters = { ...filters, ...patch, ...(resetsPage ? { page: 1 } : {}) };
      const query = serialiseFilters(next);
      startTransition(() => {
        // pathname is this page's own route; typedRoutes cannot see that.
        router.push((query === "" ? pathname : `${pathname}?${query}`) as Route, { scroll: false });
      });
    },
    [filters, pathname, router],
  );

  /** Adds or removes one id from a multi-select filter. */
  const toggleId = React.useCallback(
    (key: "categoryIds" | "brandIds" | "distilleryIds" | "mashbillIds" | "finishIds" | "storeIds" | "tagIds",
      id: number) => {
      const current = filters[key];
      apply({ [key]: current.includes(id) ? current.filter((v) => v !== id) : [...current, id] });
    },
    [filters, apply],
  );

  return { apply, toggleId, pending };
}
