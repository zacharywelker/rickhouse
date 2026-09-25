"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowDown, ArrowUp, ChevronsUpDown, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GridEditBar } from "@/components/ui/grid-edit-bar";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LabelTableBody } from "@/components/expressions/label-table-body";
import { deleteExpressionsBulkAction, updateExpressionsBulkAction } from "@/app/(app)/expressions/actions";
import { serialiseLabelFilters, type LabelFilters } from "@/lib/expressions/filters";
import type { ExpressionRow, LabelSort } from "@/lib/expressions/queries";
import type { Option } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

const COLUMNS: Array<{ key: LabelSort; label: string; className?: string; numeric?: boolean }> = [
  { key: "brand", label: "Brand", className: "hidden sm:table-cell" },
  { key: "name", label: "Label" },
  { key: "category", label: "Category", className: "hidden sm:table-cell" },
  { key: "proof", label: "Proof", numeric: true },
  { key: "msrp", label: "MSRP", className: "hidden sm:table-cell", numeric: true },
  { key: "bottles", label: "Bottles", numeric: true },
];

/** Extra columns shown only once the grid is unlocked — matching the bottle
 * grid's Release Year column, which also only appears in edit mode. */
const EXTRA_COLUMNS = [
  "Age Statement",
  "Age (y / m / d)",
  "Entry Proof",
  "Char Level",
  "Size (mL)",
  "Barcode",
  "Cask Str.",
  "Straight",
  "NAS",
  "BiB",
  "Chill Filt.",
  "Colour Added",
];

/**
 * The fields the unlocked grid can edit inline — the labels counterpart to
 * `GridEdit` in `bottle-table.tsx` (see `expressionGridEditSchema`).
 */
export type LabelGridEdit = {
  brandId: number;
  categoryId: number;
  proof: string;
  msrp: string;
  sizeMl: string;
  upc: string;
  ageStatement: string;
  ageYears: string;
  ageMonths: string;
  ageDays: string;
  entryProof: string;
  charLevel: string;
  isCaskStrength: boolean;
  isStraight: boolean;
  isNas: boolean;
  isBottledInBond: boolean;
  isChillFiltered: string;
  colorAdded: string;
};

function editableFrom(row: ExpressionRow): LabelGridEdit {
  return {
    brandId: row.brandId,
    categoryId: row.categoryId,
    proof: row.proof ?? "",
    msrp: row.msrp ?? "",
    sizeMl: String(row.sizeMl),
    upc: row.upc ?? "",
    ageStatement: row.ageStatement ?? "",
    ageYears: row.ageYears ?? "",
    ageMonths: row.ageMonths === null ? "" : String(row.ageMonths),
    ageDays: row.ageDays === null ? "" : String(row.ageDays),
    entryProof: row.entryProof ?? "",
    charLevel: row.charLevel ?? "",
    isCaskStrength: row.isCaskStrength,
    isStraight: row.isStraight,
    isNas: row.isNas,
    isBottledInBond: row.isBottledInBond,
    isChillFiltered: row.isChillFiltered === null ? "" : String(row.isChillFiltered),
    colorAdded: row.colorAdded === null ? "" : String(row.colorAdded),
  };
}

function isDirty(row: ExpressionRow, edit: LabelGridEdit): boolean {
  const original = editableFrom(row);
  return (Object.keys(edit) as Array<keyof LabelGridEdit>).some((key) => edit[key] !== original[key]);
}

/**
 * Sorting is server-side and lives in the URL, exactly like the bottle grid —
 * so a sorted, filtered, paged view is a bookmark and the back button
 * behaves (SPEC M8).
 */
function SortLink({ column, filters }: { column: (typeof COLUMNS)[number]; filters: LabelFilters }) {
  const active = filters.sort === column.key;
  const desc = filters.desc;
  // Clicking the active column flips it; a new column starts ascending. Any
  // active search or filter carries over — sorting shouldn't reset them.
  const query = serialiseLabelFilters({
    ...filters,
    sort: column.key,
    desc: active ? !desc : false,
    page: 1,
  });
  return (
    <Link
      href={`/expressions?${query}` as Route}
      aria-label={`Sort by ${column.label}`}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 px-1 py-0.5 hover:text-foreground",
        active && "text-primary",
      )}
    >
      {column.label}
      {active ? (
        desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />
      ) : (
        <ChevronsUpDown className="size-3 opacity-40" />
      )}
    </Link>
  );
}

/**
 * Wraps the labels table with an unlockable "edit" mode (issue: bulk delete
 * and edit for bottles and labels), mirroring `BottleTable`'s lock toggle,
 * checkbox column, dirty-row tracking and `GridEditBar` so the two grids look
 * and behave the same way.
 *
 * Bulk editing covers the scalar fields listed in `expressionGridEditSchema`.
 * The relational fields (mashbills, finishes, distilleries) don't fit a
 * spreadsheet cell — same reasoning `ExpressionBulkGrid` already documents —
 * so every row keeps its pencil link straight to the full edit page.
 */
export function LabelTable({
  rows,
  filters,
  brands,
  categories,
}: {
  rows: ExpressionRow[];
  filters: LabelFilters;
  brands: Option[];
  categories: Option[];
}) {
  const router = useRouter();
  const [unlocked, setUnlocked] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<number>>(new Set());
  const [edits, setEdits] = React.useState<Record<number, LabelGridEdit>>({});

  React.useEffect(() => {
    setSelectedIds(new Set());
    setEdits({});
  }, [rows]);

  function toggle(id: number, selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function updateEdit<K extends keyof LabelGridEdit>(row: ExpressionRow, field: K, value: LabelGridEdit[K]) {
    setEdits((prev) => ({
      ...prev,
      [row.id]: { ...(prev[row.id] ?? editableFrom(row)), [field]: value },
    }));
  }

  const dirtyIds = React.useMemo(
    () => rows.filter((row) => edits[row.id] && isDirty(row, edits[row.id]!)).map((row) => row.id),
    [rows, edits],
  );

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const someSelected = rows.some((row) => selectedIds.has(row.id));

  async function handleSaveChanges() {
    const payload = dirtyIds.map((id) => ({ id, ...edits[id]! }));
    const result = await updateExpressionsBulkAction(payload);
    const savedIds = new Set(result.results.filter((r) => r.ok).map((r) => r.id));
    setEdits((prev) => {
      const next = { ...prev };
      for (const id of savedIds) delete next[id];
      return next;
    });
    if (savedIds.size > 0) router.refresh();
    return result;
  }

  async function handleDeleteSelected() {
    const ids = Array.from(selectedIds);
    const result = await deleteExpressionsBulkAction(ids);
    const deletedIds = new Set(result.results.filter((r) => r.ok).map((r) => r.id));
    setSelectedIds((prev) => new Set(Array.from(prev).filter((id) => !deletedIds.has(id))));
    if (deletedIds.size > 0) router.refresh();
    return result;
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (unlocked && dirtyIds.length > 0 && !window.confirm("Discard unsaved changes?")) return;
            setUnlocked((prev) => !prev);
            setSelectedIds(new Set());
            setEdits({});
          }}
        >
          {unlocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
          {unlocked ? "Done editing" : "Edit"}
        </Button>
      </div>

      <div className={cn("border border-border bg-card", unlocked && "overflow-x-auto")}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {unlocked ? (
                <TableHead>
                  <Checkbox
                    checked={allSelected || (someSelected && "indeterminate")}
                    onCheckedChange={(value) =>
                      setSelectedIds(value ? new Set(rows.map((row) => row.id)) : new Set())
                    }
                    aria-label="Select all rows on this page"
                  />
                </TableHead>
              ) : null}
              {COLUMNS.map((column) => (
                <TableHead key={column.key} className={cn(column.className, column.numeric && "text-right")}>
                  <SortLink column={column} filters={filters} />
                </TableHead>
              ))}
              {unlocked
                ? EXTRA_COLUMNS.map((label) => (
                    <TableHead key={label} className="whitespace-nowrap">
                      {label}
                    </TableHead>
                  ))
                : null}
              <TableHead className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <LabelTableBody
            rows={rows}
            unlocked={unlocked}
            selectedIds={selectedIds}
            onToggle={toggle}
            brands={brands}
            categories={categories}
            edits={edits}
            updateEdit={updateEdit}
          />
        </Table>
      </div>

      {unlocked ? (
        <GridEditBar
          itemLabel="label"
          selectedCount={selectedIds.size}
          onClearSelection={() => setSelectedIds(new Set())}
          onDeleteSelected={handleDeleteSelected}
          dirtyCount={dirtyIds.length}
          onSaveChanges={handleSaveChanges}
        />
      ) : null}
    </>
  );
}
