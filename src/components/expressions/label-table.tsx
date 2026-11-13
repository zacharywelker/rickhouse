"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ColumnPicker } from "@/components/bulk/column-picker";
import { LabelTableBody, PHONE_COLUMNS, type ShownColumn } from "@/components/expressions/label-table-body";
import {
  DEFAULT_LABEL_COLUMNS,
  LABEL_COLUMN_GROUPS,
  LABEL_COLUMNS,
  normaliseLabelColumns,
  type LabelColumn,
} from "@/lib/expressions/columns";
import { serialiseLabelFilters, type LabelFilters } from "@/lib/expressions/filters";
import type { ExpressionRow } from "@/lib/expressions/queries";
import type { CategoryKind } from "@/lib/expressions/rules";
import { cn } from "@/lib/utils";
import { useLabelFilters } from "./use-label-filters";

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
 * it shows Brand, Label, Category, Proof, MSRP and Bottles. It is for looking:
 * labels are edited, added and deleted in bulk in the Bulk editor, and one at a
 * time on the label's own page (the pencil on each row).
 */
export function LabelTable({
  rows,
  filters,
  categoryKinds,
}: {
  rows: ExpressionRow[];
  filters: LabelFilters;
  categoryKinds: Record<number, CategoryKind>;
}) {
  const { apply } = useLabelFilters(filters);

  // Showing a column takes effect at once, then lands in the URL — without
  // this, a second click before the first navigation finished would undo it.
  const [visible, setVisible] = React.useState<ReadonlySet<string>>(() => new Set(filters.columns));
  const columnsKey = filters.columns.join(",");
  const [prevColumnsKey, setPrevColumnsKey] = React.useState(columnsKey);
  if (columnsKey !== prevColumnsKey) {
    setPrevColumnsKey(columnsKey);
    setVisible(new Set(filters.columns));
  }

  const shown: ShownColumn[] = LABEL_COLUMN_GROUPS.flatMap((group) =>
    group.columns.filter((column) => column.locked || visible.has(column.id)).map((column) => ({ column, group })),
  );
  const shownFilters = { ...filters, columns: [...visible] };

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
      </div>

      <div className="border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {shown.map(({ column }) => (
                <TableHead
                  key={column.id}
                  id={`label-col-${column.id}`}
                  className={cn(
                    // Headers wrap onto two lines so the table is narrower.
                    "h-auto max-w-24 whitespace-normal py-2 leading-tight",
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
          <LabelTableBody rows={rows} shown={shown} categoryKinds={categoryKinds} />
        </Table>
      </div>
    </>
  );
}
