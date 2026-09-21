"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatMoney, formatNumeric, humanise } from "@/lib/utils";
import type { BottleFilters, SortKey } from "@/lib/bottles/filters";
import type { GridRow } from "@/lib/bottles/grid";
import { FillGauge } from "./fill-gauge";
import { useGridFilters } from "./use-grid-filters";

const helper = createColumnHelper<GridRow>();

/** Column id -> the sort key the server understands. */
const SORT_BY_COLUMN: Partial<Record<string, SortKey>> = {
  brand: "brand",
  expression: "expression",
  category: "category",
  proof: "proof",
  age: "age",
  price: "price",
  msrp: "msrp",
  fill: "fill",
  rating: "rating",
  status: "status",
  acquired: "acquired",
};

export const COLUMN_LABELS: Array<{ id: string; label: string }> = [
  { id: "photo", label: "Photo" },
  { id: "fill", label: "Fill" },
  { id: "brand", label: "Brand" },
  { id: "expression", label: "Expression" },
  { id: "category", label: "Category" },
  { id: "distilleries", label: "Distilleries" },
  { id: "proof", label: "Proof" },
  { id: "age", label: "Age" },
  { id: "price", label: "Paid" },
  { id: "msrp", label: "MSRP" },
  { id: "store", label: "Store" },
  { id: "acquired", label: "Acquired" },
  { id: "rating", label: "Rating" },
  { id: "status", label: "Status" },
];

export function BottleTable({ rows, filters }: { rows: GridRow[]; filters: BottleFilters }) {
  const { apply } = useGridFilters(filters);

  const columns = React.useMemo(
    () => [
      helper.display({
        id: "photo",
        header: "",
        cell: ({ row }) =>
          row.original.thumbPath ? (
            <Image
              src={`/api/images/${row.original.thumbPath}`}
              alt=""
              width={40}
              height={40}
              unoptimized
              className="size-10 rounded border border-border object-cover"
            />
          ) : (
            <div className="size-10 rounded border border-dashed border-border" aria-hidden="true" />
          ),
      }),
      helper.accessor("fillPct", {
        id: "fill",
        header: "Fill",
        cell: ({ getValue, row }) => (
          <div className="flex items-center gap-2">
            <FillGauge value={getValue()} readOnly height={34} label={`${row.original.expressionName} fill`} />
            <span className="whitespace-nowrap tabular-nums text-muted-foreground">{getValue()}%</span>
          </div>
        ),
      }),
      helper.accessor("brand", {
        id: "brand",
        header: "Brand",
        cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span>,
      }),
      helper.accessor("expressionName", {
        id: "expression",
        header: "Expression",
        cell: ({ row }) => (
          <Link href={`/bottles/${row.original.id}`} className="whitespace-nowrap font-medium hover:text-rye-gold">
            {row.original.expressionName}
            {row.original.batch ? <span className="text-muted-foreground"> · {row.original.batch}</span> : null}
            {row.original.isFavorite ? (
              <Star className="ml-1 inline size-3.5 fill-rye-gold text-rye-gold" aria-label="Favourite" />
            ) : null}
          </Link>
        ),
      }),
      helper.accessor("category", {
        id: "category",
        header: "Category",
        cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span>,
      }),
      helper.accessor("distilleries", {
        id: "distilleries",
        header: "Distilleries",
        cell: ({ getValue }) => (
          <span className="block max-w-56 truncate text-muted-foreground">{getValue() ?? "—"}</span>
        ),
      }),
      helper.accessor("proof", {
        id: "proof",
        header: "Proof",
        cell: ({ getValue }) => <span className="tabular-nums">{formatNumeric(getValue())}</span>,
      }),
      helper.accessor("ageYears", {
        id: "age",
        header: "Age",
        cell: ({ getValue, row }) => (
          <span
            className="block max-w-32 truncate tabular-nums"
            title={row.original.ageStatement ?? undefined}
          >
            {getValue() ? `${formatNumeric(getValue())}y` : (row.original.ageStatement ?? "—")}
          </span>
        ),
      }),
      helper.accessor("pricePaid", {
        id: "price",
        header: "Paid",
        cell: ({ getValue }) => <span className="tabular-nums">{formatMoney(getValue())}</span>,
      }),
      helper.accessor("msrp", {
        id: "msrp",
        header: "MSRP",
        cell: ({ getValue }) => <span className="tabular-nums">{formatMoney(getValue())}</span>,
      }),
      helper.accessor("store", {
        id: "store",
        header: "Store",
        cell: ({ getValue }) => (
          <span className="block max-w-36 truncate" title={getValue() ?? undefined}>
            {getValue() ?? "—"}
          </span>
        ),
      }),
      helper.accessor("dateAcquired", {
        id: "acquired",
        header: "Acquired",
        cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{getValue() ?? "—"}</span>,
      }),
      helper.accessor("avgRating", {
        id: "rating",
        header: "Rating",
        cell: ({ getValue }) =>
          getValue() ? <span className="tabular-nums text-rye-gold">{Number(getValue())}</span> : "—",
      }),
      helper.accessor("status", {
        id: "status",
        header: "Status",
        cell: ({ getValue, row }) => (
          <Badge className={row.original.isOpen ? "border-primary/40 text-primary" : ""}>
            {humanise(getValue())}
          </Badge>
        ),
      }),
    ],
    [],
  );

  const columnVisibility = React.useMemo<VisibilityState>(
    () => Object.fromEntries(filters.hidden.map((id) => [id, false])),
    [filters.hidden],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnVisibility },
    getCoreRowModel: getCoreRowModel(),
    // Sorting, filtering and paging all happen in Postgres.
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
  });

  function toggleSort(columnId: string) {
    const key = SORT_BY_COLUMN[columnId];
    if (!key) return;
    apply(filters.sort === key ? { desc: !filters.desc } : { sort: key, desc: true });
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const key = SORT_BY_COLUMN[header.column.id];
                const active = key !== undefined && filters.sort === key;
                return (
                  <TableHead key={header.id}>
                    {key ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(header.column.id)}
                        aria-label={`Sort by ${String(header.column.columnDef.header)}`}
                        className={cn(
                          "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground",
                          active && "text-primary",
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {active ? (
                          filters.desc ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ArrowUp className="size-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
