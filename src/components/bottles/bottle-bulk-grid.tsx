"use client";

import { BulkGrid, type BulkSection } from "@/components/bulk/bulk-grid";
import { saveBottlesBulkAction } from "@/app/(app)/bottles/actions";
import { BOTTLE_SECTIONS, BOTTLE_STATE_SECTION } from "@/lib/expressions/bottle-fields";
import type { Option } from "@/lib/admin/types";

/**
 * Every field on the bottle form, plus where each bottle is in its life (fill,
 * opened, killed, favorite) — entering a collection that already exists means
 * entering bottles that are half gone. State goes just before Notes, so the
 * free text stays the last thing on the row.
 */
const SECTIONS: ReadonlyArray<BulkSection> = [
  ...BOTTLE_SECTIONS.filter((section) => section.id !== "notes"),
  BOTTLE_STATE_SECTION,
  ...BOTTLE_SECTIONS.filter((section) => section.id === "notes"),
];

/**
 * Bulk add for the collection. The single-barrel detail applies row by row,
 * as it does on the form: pick name and picked-by fill in once the row is a
 * private selection. Anything not needed hides from the Fields menu.
 */
export function BottleBulkGrid({
  expressions,
  stores,
  releases,
}: {
  expressions: Option[];
  stores: Option[];
  /** Each label's known releases (by label id), for the Release column. */
  releases: Record<number, Array<{ value: string; label: string }>>;
}) {
  return (
    <BulkGrid
      sections={SECTIONS}
      options={{ expressionId: expressions, storeId: stores }}
      // A release belongs to its label: offer the row's label's, and drop one when the label changes.
      selectOptionsFor={(name, values) => (name === "releaseId" ? (releases[Number(values.expressionId)] ?? []) : [])}
      onChanged={(prev, next, name) => (name === "expressionId" ? { ...next, releaseId: "" } : next)}
      save={saveBottlesBulkAction}
      noun="bottle"
      storageKey="rickhouse:bulk-bottles:hidden"
    />
  );
}
