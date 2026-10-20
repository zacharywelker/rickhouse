"use client";

import { BulkGrid, type BulkSection } from "@/components/bulk/bulk-grid";
import { saveBottlesBulkAction } from "@/app/(app)/bottles/actions";
import { BOTTLE_SECTIONS, BOTTLE_STATE_SECTION } from "@/lib/expressions/bottle-fields";
import type { Option } from "@/lib/admin/types";
import type { CategoryKind } from "@/lib/expressions/rules";
import type { FieldGroup } from "@/db/schema";
import { BRANDY_MINIMUM_YEARS, hidesWarehouse, isAgaveKind } from "@/lib/expressions/spirit-details";
import { isGinKind } from "@/lib/expressions/gin-details";

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
].map((section) => ({
  ...section,
  fields: section.fields.map((field) => field.name === "batch" ? { ...field, label: "Batch / LOT #" } : field),
}));

/**
 * Bulk add for the collection. The single-barrel detail applies row by row,
 * as it does on the form: pick name and picked-by fill in once the row is a
 * private selection. Anything not needed hides from the Fields menu.
 */
export function BottleBulkGrid({
  expressions,
  stores,
  releases,
  categoryGroups,
  categoryKinds,
}: {
  expressions: Option[];
  stores: Option[];
  /** Each label's known releases (by label id), for the Release column. */
  releases: Record<number, Array<{ value: string; label: string }>>;
  categoryGroups: Record<number, FieldGroup>;
  categoryKinds: Record<number, CategoryKind>;
}) {
  const detailsFor = (values: Record<string, unknown>) => {
    const label = expressions.find((option) => option.value === Number(values.expressionId));
    const categoryId = label?.categoryId ?? -1;
    return { label, group: categoryGroups[categoryId] ?? null, kind: categoryKinds[categoryId] ?? "other" as CategoryKind };
  };
  return (
    <BulkGrid
      sections={SECTIONS}
      options={{ expressionId: expressions, storeId: stores }}
      fieldGroupFor={(values) => detailsFor(values).group}
      applicabilityFor={(name, values) => {
        const { label, group, kind } = detailsFor(values);
        if (!label) return null;
        if ((name === "barrelFilledOn" || name === "bottledOn") && (isAgaveKind(kind) || isGinKind(kind))) return "Not used for this spirit";
        if ((name === "warehouse" || name === "rickFloor") && hidesWarehouse(group ?? "", kind)) return "Not used for this spirit";
        if (isGinKind(kind) && !label.isAgedGin && ["isSingleBarrel", "isSingleBarrelPick", "pickName", "pickedBy", "barrelNumber", "bottleCount", "ageYears", "ageMonths", "ageDays", "ginIsNas"].includes(name)) return "Only for aged gin";
        if (name === "ginIsNas" && !isGinKind(kind)) return "Only for gin";
        if (name === "tequilaClass" && kind !== "tequila") return "Only for tequila";
        if (name === "brandyGrade" && !BRANDY_MINIMUM_YEARS[kind]) return "No defined grade for this category";
        if (name === "ageStatement" && (kind === "tequila" || isGinKind(kind))) return "No age statement field for this spirit";
        if (["ageYears", "ageMonths", "ageDays"].includes(name) && kind === "tequila" && (values.tequilaClass || label.tequilaClass) === "blanco") return "Blanco has no age field";
        return null;
      }}
      // A release belongs to its label: offer the row's label's, and drop one when the label changes.
      selectOptionsFor={(name, values) => (name === "releaseId" ? (releases[Number(values.expressionId)] ?? []) : [])}
      onChanged={(prev, next, name) => (name === "expressionId" ? { ...next, releaseId: "", tequilaClass: "", brandyGrade: "", ageStatement: "" } : next)}
      save={saveBottlesBulkAction}
      noun="bottle"
      storageKey="rickhouse:bulk-bottles:hidden"
    />
  );
}
