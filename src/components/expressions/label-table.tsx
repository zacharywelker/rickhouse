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
import { deleteExpressionsBulkAction } from "@/app/(app)/expressions/actions";
import { serialiseLabelFilters, type LabelFilters } from "@/lib/expressions/filters";
import type { ExpressionRow, LabelSort } from "@/lib/expressions/queries";
import { cn } from "@/lib/utils";

const COLUMNS: Array<{ key: LabelSort; label: string; className?: string; numeric?: boolean }> = [
  { key: "brand", label: "Brand", className: "hidden sm:table-cell" },
  { key: "name", label: "Label" },
  { key: "category", label: "Category", className: "hidden sm:table-cell" },
  { key: "proof", label: "Proof", numeric: true },
  { key: "msrp", label: "MSRP", className: "hidden sm:table-cell", numeric: true },
  { key: "bottles", label: "Bottles", numeric: true },
];

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
        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground",
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
 * for bottles and labels). Selection and lock state have to live above both
 * the header (select-all checkbox) and the body (row checkboxes), which is
 * why this — not the server page — owns the whole `<Table>`.
 *
 * Bulk *editing* label fields is not wired up yet: only bulk delete. The
 * relational fields (mashbills, finishes, distilleries) don't fit a
 * spreadsheet cell — same reasoning `ExpressionBulkGrid` already documents —
 * so every row keeps its pencil link straight to the full edit page.
 */
export function LabelTable({ rows, filters }: { rows: ExpressionRow[]; filters: LabelFilters }) {
  const router = useRouter();
  const [unlocked, setUnlocked] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<number>>(new Set());

  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [rows]);

  function toggle(id: number, selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const someSelected = rows.some((row) => selectedIds.has(row.id));

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
            setUnlocked((prev) => !prev);
            setSelectedIds(new Set());
          }}
        >
          {unlocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
          {unlocked ? "Done editing" : "Edit"}
        </Button>
      </div>

      <div className="border border-border bg-card">
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
              <TableHead className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <LabelTableBody rows={rows} unlocked={unlocked} selectedIds={selectedIds} onToggle={toggle} />
        </Table>
      </div>

      {unlocked ? (
        <GridEditBar
          itemLabel="label"
          selectedCount={selectedIds.size}
          onClearSelection={() => setSelectedIds(new Set())}
          onDeleteSelected={handleDeleteSelected}
          dirtyCount={0}
          onSaveChanges={async () => ({ savedCount: 0, results: [] })}
        />
      ) : null}
    </>
  );
}
