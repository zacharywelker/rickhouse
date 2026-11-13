"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ageLabel } from "@/lib/expressions/display";
import { whiskeyAge } from "@/lib/expressions/whiskey-age";
import { useCurrency, useMoney } from "@/components/currency-context";
import { cn, formatDate, formatNumeric } from "@/lib/utils";
import { fillState, fillStateDescription } from "@/lib/bottles/fill-state";
import type { BottleFilters, SortKey } from "@/lib/bottles/filters";
import { categorySwatchClass } from "@/lib/bottles/category-color";
import { effectiveBottleStatus, isSealedBottle } from "@/lib/bottles/terminology";
import type { GridRow } from "@/lib/bottles/grid";
import { describeMarkup, markup, shortMarkup } from "@/lib/bottles/markup";
import { DistilleryNames } from "@/components/ui/inferred";
import { BottleCards } from "./bottle-cards";
import { categoryColor } from "@/lib/bottles/category-palette";
import { FillGauge } from "./fill-gauge";
import { StatusMark } from "./status-mark";
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
  markup: "markup",
  fill: "fill",
  rating: "rating",
  status: "status",
  acquired: "acquired",
};

export const COLUMN_LABELS: Array<{ id: string; label: string }> = [
  { id: "photo", label: "Photo" },
  { id: "fill", label: "Fill" },
  { id: "brand", label: "Brand" },
  { id: "expression", label: "Label" },
  { id: "status", label: "Status" },
  { id: "category", label: "Category" },
  { id: "distilleries", label: "Distilleries" },
  { id: "proof", label: "Proof" },
  { id: "age", label: "Age" },
  { id: "price", label: "Paid" },
  { id: "msrp", label: "MSRP" },
  { id: "markup", label: "Markup" },
  { id: "store", label: "Store" },
  { id: "acquired", label: "Acquired" },
  { id: "rating", label: "Rating" },
];

/**
 * Hitting the expression link exactly is fiddly, so the whole row opens on a
 * double click (SPEC M8). The link stays — it is what makes middle-click and
 * "open in new tab" work, and it is the keyboard path.
 *
 * Skipped when the pointer is on something that already does its own thing,
 * and when there is a text selection: double-click is also how you select a
 * word, and navigating away from that is infuriating.
 */
function openOnDoubleClick(event: React.MouseEvent, router: ReturnType<typeof useRouter>, id: number) {
  if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea, [role='slider']")) {
    return;
  }
  if ((window.getSelection()?.toString() ?? "") !== "") return;
  router.push(`/bottles/${id}` as Route);
}

export function BottleTable({
  rows,
  filters,
}: {
  rows: GridRow[];
  filters: BottleFilters;
}) {
  const { apply } = useGridFilters(filters);
  const money = useMoney();
  const currency = useCurrency();
  const router = useRouter();

  const columns = React.useMemo(
    () => [
      helper.display({
        id: "photo",
        header: "",
        cell: ({ row }) =>
          row.original.thumbPath ? (
            // A 3:4 slot with the whole photo scaled to fit, on the category's
            // colour like the gallery card — a cut-out bottle is never cropped.
            <div
              className="relative h-14 w-[42px] shrink-0 border border-foreground"
              style={{ backgroundColor: categoryColor(row.original.category).hex }}
            >
              <Image
                src={`/api/images/${row.original.thumbPath}`}
                alt=""
                fill
                unoptimized
                className="object-contain p-0.5"
              />
            </div>
          ) : (
            <div className="h-14 w-[42px] shrink-0 border border-dashed border-border" aria-hidden="true" />
          ),
      }),
      helper.accessor("fillPct", {
        id: "fill",
        header: "Fill",
        cell: ({ getValue, row }) => (
          <div className="flex items-center gap-2">
            <FillGauge
              value={getValue()}
              readOnly
              fieldGroup={row.original.fieldGroup}
              height={28}
              sealed={isSealedBottle(row.original)}
              label={`${row.original.expressionName} fill`}
            />
            <span className="whitespace-nowrap text-muted-foreground" title={fillStateDescription(getValue())}>
              {fillState(getValue()).label}
            </span>
          </div>
        ),
      }),
      helper.accessor("brand", {
        id: "brand",
        header: "Brand",
        cell: ({ getValue }) => (
          <span className="block min-w-24 max-w-40">{getValue()}</span>
        ),
      }),
      helper.accessor("expressionName", {
        id: "expression",
        header: "Label",
        cell: ({ row }) => (
          <Link
            href={`/bottles/${row.original.id}`}
            // Wraps inside a bounded width rather than running on (one long
            // name used to push Proof, Paid and Status out of view) or being
            // cut off (a truncated name is a name you cannot read).
            className="block min-w-36 max-w-64 font-medium hover:text-accent"
          >
            {row.original.expressionName}
            {row.original.batch ? <span className="text-muted-foreground"> · {row.original.batch}</span> : null}
            {row.original.isFavorite ? (
              <Star className="ml-1 inline size-3.5 fill-accent text-accent" aria-label="Favorite" />
            ) : null}
            {row.original.spiritFact ? <span className="block truncate text-xs font-normal text-muted-foreground" title={row.original.spiritFact}>{row.original.spiritFact}</span> : null}
          </Link>
        ),
      }),
      helper.accessor("status", {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusMark status={effectiveBottleStatus(row.original)} />,
      }),
      helper.accessor("category", {
        id: "category",
        header: "Category",
        cell: ({ getValue, row }) => (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span
              className={cn("size-2 shrink-0 rounded-full", categorySwatchClass(row.original.fieldGroup))}
              aria-hidden="true"
            />
            {getValue()}
          </span>
        ),
      }),
      helper.accessor("distilleries", {
        id: "distilleries",
        header: "Distilleries",
        cell: ({ row }) => (
          <span className="block min-w-32 max-w-56 text-muted-foreground">
            <DistilleryNames links={row.original.distilleryLinks} />
          </span>
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
        cell: ({ row }) => {
          const value = row.original;
          const resolved = value.fieldGroup === "whiskey" ? whiskeyAge({ ...value, isStraight: value.isStraight, isNas: value.isNas, isBottledInBond: value.isBottledInBond }, value.whiskeyKind ?? "other") : null;
          return <span className="block min-w-16 max-w-40 tabular-nums">
            {resolved?.inferred ? <abbr tabIndex={0} title={resolved.explanation ?? undefined} className="cursor-help italic no-underline">{resolved.text}</abbr> : resolved?.text ?? ageLabel(value) ?? "—"}
          </span>;
        },
      }),
      helper.accessor("pricePaid", {
        id: "price",
        header: "Paid",
        cell: ({ getValue }) => <span className="tabular-nums">{money(getValue())}</span>,
      }),
      helper.accessor("msrp", {
        id: "msrp",
        header: "MSRP",
        cell: ({ getValue }) => <span className="tabular-nums">{money(getValue())}</span>,
      }),
      helper.display({
        id: "markup",
        header: "Markup",
        cell: ({ row }) => {
          const m = markup(row.original.pricePaid, row.original.msrp);
          return (
            <span className="tabular-nums" title={m ? describeMarkup(m, currency) : undefined}>
              {m ? shortMarkup(m) : "—"}
            </span>
          );
        },
      }),
      helper.accessor("store", {
        id: "store",
        header: "Store",
        cell: ({ getValue }) => <span className="block min-w-20 max-w-32">{getValue() ?? "—"}</span>,
      }),
      helper.accessor("dateAcquired", {
        id: "acquired",
        header: "Acquired",
        cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDate(getValue())}</span>,
      }),
      helper.accessor("avgRating", {
        id: "rating",
        header: "Rating",
        cell: ({ getValue }) =>
          getValue() ? <span className="tabular-nums text-accent">{Number(getValue())}</span> : "—",
      }),
    ],
    [money, currency],
  );

  const columnVisibility = React.useMemo<VisibilityState>(
    () => Object.fromEntries(filters.hidden.map((id) => [id, false])),
    [filters.hidden],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnVisibility },
    getRowId: (row) => String(row.id),
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
    <>
      {/*
       * Under 768px the same rows render as cards (SPEC M6). Both trees are in
       * the DOM and CSS picks one, so there is no hydration flash and no
       * viewport guess on the server — the card gauge is aria-hidden precisely
       * so the hidden tree cannot answer to the visible one's name.
       */}
      <div className="flex flex-col gap-3 md:hidden">
        <MobileSort filters={filters} onSort={apply} />
        <BottleCards rows={rows} />
      </div>

      <div className="hidden border border-border bg-card md:block">
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
                        // Buttons reset text-transform, so the header's uppercase is
                        // restated here or sortable headers read in mixed case.
                        className={cn(
                          "-mx-1 inline-flex items-center gap-1 px-1 py-0.5 uppercase tracking-wide hover:text-foreground",
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
            <TableRow
              key={row.id}
              onDoubleClick={(event) => openOnDoubleClick(event, router, row.original.id)}
              className="cursor-pointer"
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        </Table>
      </div>

    </>
  );
}

const MOBILE_SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "acquired", label: "Acquired" },
  { key: "brand", label: "Brand" },
  { key: "expression", label: "Label" },
  { key: "proof", label: "Proof" },
  { key: "age", label: "Age" },
  { key: "price", label: "Paid" },
  { key: "markup", label: "Markup" },
  { key: "fill", label: "Fill" },
  { key: "rating", label: "Rating" },
];

/**
 * Cards have no header row to click, so sorting needs its own control. A
 * native select on purpose: it is the one picker a phone already knows how to
 * present well.
 */
function MobileSort({
  filters,
  onSort,
}: {
  filters: BottleFilters;
  onSort: (next: Partial<BottleFilters>) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="mobile-sort" className="text-sm text-muted-foreground">
        Sort
      </label>
      <select
        id="mobile-sort"
        value={filters.sort}
        onChange={(event) => onSort({ sort: event.target.value as SortKey })}
        className="h-9 flex-1 border border-input bg-card px-2 text-sm"
      >
        {MOBILE_SORTS.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onSort({ desc: !filters.desc })}
        aria-label={filters.desc ? "Sorted descending. Sort ascending." : "Sorted ascending. Sort descending."}
        title={filters.desc ? "Sorted descending. Sort ascending." : "Sorted ascending. Sort descending."}
      >
        {filters.desc ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}
      </Button>
    </div>
  );
}
