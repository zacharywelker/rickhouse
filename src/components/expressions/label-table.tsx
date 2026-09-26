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
import { ColumnPicker } from "@/components/bulk/column-picker";
import { LabelTableBody, PHONE_COLUMNS, type ShownColumn } from "@/components/expressions/label-table-body";
import { deleteExpressionsBulkAction, updateExpressionsBulkAction } from "@/app/(app)/expressions/actions";
import {
  DEFAULT_LABEL_COLUMNS,
  LABEL_COLUMN_GROUPS,
  LABEL_COLUMNS,
  normaliseLabelColumns,
  type LabelColumn,
} from "@/lib/expressions/columns";
import { serialiseLabelFilters, type LabelFilters } from "@/lib/expressions/filters";
import { changesFor, editableFrom, fieldGroupOf, type LabelEdit } from "@/lib/expressions/label-edits";
import type { ExpressionRow } from "@/lib/expressions/queries";
import type { FieldGroup } from "@/db/schema";
import type { Option } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import { useLabelFilters } from "./use-label-filters";

export type RowErrors = { error: string; fields: Record<string, string> };

/**
 * Sorting is server-side and lives in the URL, exactly like the bottle grid —
 * so a sorted, filtered, paged view is a bookmark and the back button
 * behaves (SPEC M8).
 */
function SortLink({ column, filters }: { column: LabelColumn; filters: LabelFilters }) {
  const active = filters.sort === column.sort;
  const desc = filters.desc;
  // Clicking the active column flips it; a new column starts ascending. Any
  // active search or filter carries over — sorting shouldn't reset them.
  const query = serialiseLabelFilters({
    ...filters,
    sort: column.sort!,
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
 * The labels table: any field on the label form can be a column, chosen from
 * the Columns menu and kept in the URL like the rest of the view. By default
 * it shows Brand, Label, Category, Proof, MSRP and Bottles.
 *
 * Unlocking it ("Edit") makes the shown columns editable in place, mirroring
 * `BottleTable`'s lock toggle, checkbox column, dirty-row tracking and
 * `GridEditBar` so the two grids look and behave the same way. What you can
 * edit is what you can see: show a column to correct it. Distilleries,
 * mashbills and finishes open the form's own ordered picker; every row
 * also keeps its pencil link straight to the full edit page.
 */
export function LabelTable({
  rows,
  filters,
  options,
  categoryGroups,
}: {
  rows: ExpressionRow[];
  filters: LabelFilters;
  /** Picker options by field name, as the label form takes them. */
  options: Record<string, Option[]>;
  /** categoryId -> field group, so an edited category's sections follow. */
  categoryGroups: Record<number, FieldGroup>;
}) {
  const router = useRouter();
  const { apply } = useLabelFilters(filters);
  const [unlocked, setUnlocked] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<number>>(new Set());
  const [edits, setEdits] = React.useState<Record<number, LabelEdit>>({});
  const [saveErrors, setSaveErrors] = React.useState<Record<number, RowErrors>>({});

  // Showing a column takes effect at once, then lands in the URL — without
  // this, a second click before the first navigation finished would undo it.
  const [visible, setVisible] = React.useState<ReadonlySet<string>>(() => new Set(filters.columns));
  const columnsKey = filters.columns.join(",");
  React.useEffect(() => setVisible(new Set(columnsKey.split(","))), [columnsKey]);

  // Off-screen rows shouldn't stay silently selected or dirty once the page
  // or filters change under them. Keyed on which rows, not the array itself,
  // so showing a column (which re-renders the page) keeps unsaved edits.
  const rowsKey = rows.map((row) => row.id).join(",");
  React.useEffect(() => {
    setSelectedIds(new Set());
    setEdits({});
    setSaveErrors({});
  }, [rowsKey]);

  const originals = React.useMemo(() => new Map(rows.map((row) => [row.id, editableFrom(row)])), [rows]);

  const changes = React.useMemo(() => {
    const byId = new Map<number, Record<string, unknown>>();
    for (const row of rows) {
      const edit = edits[row.id];
      if (!edit) continue;
      const changed = changesFor(originals.get(row.id)!, edit, fieldGroupOf(row, edit, categoryGroups));
      if (changed) byId.set(row.id, changed);
    }
    return byId;
  }, [rows, edits, originals, categoryGroups]);

  const shown: ShownColumn[] = LABEL_COLUMN_GROUPS.flatMap((group) =>
    group.columns.filter((column) => column.locked || visible.has(column.id)).map((column) => ({ column, group })),
  );
  const shownFilters = { ...filters, columns: [...visible] };

  function toggle(id: number, selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function updateEdit(row: ExpressionRow, name: string, value: LabelEdit[string]) {
    setEdits((prev) => ({
      ...prev,
      [row.id]: { ...(prev[row.id] ?? originals.get(row.id)!), [name]: value },
    }));
  }

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const someSelected = rows.some((row) => selectedIds.has(row.id));

  async function handleSaveChanges() {
    const payload = [...changes].map(([id, changed]) => ({ id, ...changed }));
    const result = await updateExpressionsBulkAction(payload);
    const savedIds = new Set(result.results.filter((r) => r.ok).map((r) => r.id));
    const failures: Record<number, RowErrors> = {};
    for (const r of result.results) {
      if (!r.ok) failures[payload[r.index]!.id] = { error: r.error, fields: r.fieldErrors };
    }
    setSaveErrors(failures);
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
      <div className="mb-3 flex justify-end gap-2">
        {/* Hidden on phones: only Label, Proof and Bottles fit there anyway. */}
        <ColumnPicker
          label="Columns"
          className="hidden sm:inline-flex"
          groups={LABEL_COLUMN_GROUPS}
          visible={visible}
          onChange={(next) => {
            const columns = normaliseLabelColumns(next);
            setVisible(new Set(columns));
            apply({ columns });
          }}
          presets={[
            { label: "Show all", ids: LABEL_COLUMNS.map((column) => column.id) },
            { label: "Defaults", ids: DEFAULT_LABEL_COLUMNS },
          ]}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (unlocked && changes.size > 0 && !window.confirm("Discard unsaved changes?")) return;
            setUnlocked((prev) => !prev);
            setSelectedIds(new Set());
            setEdits({});
            setSaveErrors({});
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
              {shown.map(({ column }) => (
                <TableHead
                  key={column.id}
                  id={`label-col-${column.id}`}
                  className={cn(
                    !PHONE_COLUMNS.has(column.id) && "hidden sm:table-cell",
                    column.numeric && "text-right",
                  )}
                >
                  {column.sort ? <SortLink column={column} filters={shownFilters} /> : column.label}
                </TableHead>
              ))}
              <TableHead className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <LabelTableBody
            rows={rows}
            shown={shown}
            unlocked={unlocked}
            selectedIds={selectedIds}
            onToggle={toggle}
            options={options}
            categoryGroups={categoryGroups}
            originals={originals}
            edits={edits}
            updateEdit={updateEdit}
            saveErrors={saveErrors}
          />
        </Table>
      </div>

      {unlocked ? (
        <GridEditBar
          itemLabel="label"
          selectedCount={selectedIds.size}
          onClearSelection={() => setSelectedIds(new Set())}
          onDeleteSelected={handleDeleteSelected}
          dirtyCount={changes.size}
          onSaveChanges={handleSaveChanges}
        />
      ) : null}
    </>
  );
}
