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
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Lock, LockOpen, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GridEditBar } from "@/components/ui/grid-edit-bar";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReferenceCombobox } from "@/components/admin/reference-combobox";
import { cn, formatMoney, formatNumeric } from "@/lib/utils";
import type { BottleFilters, SortKey } from "@/lib/bottles/filters";
import { categorySwatchClass } from "@/lib/bottles/category-color";
import type { GridRow } from "@/lib/bottles/grid";
import { deleteBottlesBulkAction, updateBottlesBulkAction } from "@/app/(app)/bottles/actions";
import { BOTTLE_STATUSES } from "@/db/schema";
import type { Option } from "@/lib/admin/types";
import { BottleCards } from "./bottle-cards";
import { FillGauge } from "./fill-gauge";
import { StatusMark } from "./status-mark";
import { useGridFilters } from "./use-grid-filters";

const helper = createColumnHelper<GridRow>();
const titleCase = (value: string) => value[0]!.toUpperCase() + value.slice(1);

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
  { id: "expression", label: "Label" },
  { id: "category", label: "Category" },
  { id: "distilleries", label: "Distilleries" },
  { id: "mashbills", label: "Mashbill" },
  { id: "finishes", label: "Finishes" },
  { id: "proof", label: "Proof" },
  { id: "age", label: "Age" },
  { id: "ageStatement", label: "Age Statement" },
  { id: "price", label: "Paid" },
  { id: "msrp", label: "MSRP" },
  { id: "store", label: "Store" },
  { id: "acquired", label: "Acquired" },
  { id: "rating", label: "Rating" },
  { id: "status", label: "Status" },
  { id: "batch", label: "Batch" },
  { id: "releaseYear", label: "Release Year" },
  { id: "singleBarrel", label: "Single Barrel" },
  { id: "privateSelection", label: "Private Selection" },
  { id: "pickedBy", label: "Private Selection Pickers" },
];

/**
 * The fields the unlocked grid can edit inline — the subset of the bottle
 * form's fields already resolved onto `bottle_list`, so editing needs no
 * extra query beyond what the page already loads (see
 * `bottleGridEditSchema`).
 */
type GridEdit = {
  expressionId: number;
  storeId: number | null;
  status: string;
  pricePaid: string;
  dateAcquired: string;
  releaseYear: string;
};

function editableFrom(row: GridRow): GridEdit {
  return {
    expressionId: row.expressionId,
    storeId: row.storeId,
    status: row.status,
    pricePaid: row.pricePaid ?? "",
    dateAcquired: row.dateAcquired ?? "",
    releaseYear: row.releaseYear === null || row.releaseYear === undefined ? "" : String(row.releaseYear),
  };
}

function isDirty(row: GridRow, edit: GridEdit): boolean {
  const original = editableFrom(row);
  return (Object.keys(edit) as Array<keyof GridEdit>).some((key) => edit[key] !== original[key]);
}

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
  stores,
}: {
  rows: GridRow[];
  filters: BottleFilters;
  stores: Option[];
}) {
  const { apply } = useGridFilters(filters);
  const router = useRouter();

  const [unlocked, setUnlocked] = React.useState(false);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [edits, setEdits] = React.useState<Record<number, GridEdit>>({});

  // Off-screen rows shouldn't stay silently selected or dirty once the page
  // or filters change under them.
  React.useEffect(() => {
    setRowSelection({});
    setEdits({});
  }, [rows]);

  function updateEdit<K extends keyof GridEdit>(row: GridRow, field: K, value: GridEdit[K]) {
    setEdits((prev) => ({
      ...prev,
      [row.id]: { ...(prev[row.id] ?? editableFrom(row)), [field]: value },
    }));
  }

  const dirtyIds = React.useMemo(
    () => rows.filter((row) => edits[row.id] && isDirty(row, edits[row.id]!)).map((row) => row.id),
    [rows, edits],
  );

  async function handleSaveChanges() {
    const payload = dirtyIds.map((id) => {
      const edit = edits[id]!;
      return {
        id,
        expressionId: edit.expressionId,
        storeId: edit.storeId === null ? "" : String(edit.storeId),
        status: edit.status,
        pricePaid: edit.pricePaid,
        dateAcquired: edit.dateAcquired,
        releaseYear: edit.releaseYear,
      };
    });
    const result = await updateBottlesBulkAction(payload);
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
    const ids = Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map(Number);
    const result = await deleteBottlesBulkAction(ids);
    const deletedIds = new Set(result.results.filter((r) => r.ok).map((r) => r.id));
    setRowSelection((prev) => {
      const next = { ...prev };
      for (const id of deletedIds) delete next[String(id)];
      return next;
    });
    if (deletedIds.size > 0) router.refresh();
    return result;
  }

  const columns = React.useMemo(
    () => [
      ...(unlocked
        ? [
            helper.display({
              id: "select",
              header: ({ table }) => (
                <Checkbox
                  checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
                  onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
                  aria-label="Select all rows on this page"
                />
              ),
              cell: ({ row }) => (
                <Checkbox
                  checked={row.getIsSelected()}
                  onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
                  aria-label={`Select ${row.original.expressionName}`}
                />
              ),
            }),
          ]
        : []),
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
            <FillGauge
              value={getValue()}
              readOnly
              fieldGroup={row.original.fieldGroup}
              height={34}
              label={`${row.original.expressionName} fill`}
            />
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
        header: "Label",
        cell: ({ row }) => (
          <Link href={`/bottles/${row.original.id}`} className="whitespace-nowrap font-medium hover:text-accent">
            {row.original.expressionName}
            {row.original.batch ? <span className="text-muted-foreground"> · {row.original.batch}</span> : null}
            {row.original.isFavorite ? (
              <Star className="ml-1 inline size-3.5 fill-accent text-accent" aria-label="Favorite" />
            ) : null}
          </Link>
        ),
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
        cell: ({ getValue }) => (
          <span className="block max-w-56 truncate text-muted-foreground">{getValue() ?? "—"}</span>
        ),
      }),
      helper.accessor("mashbills", {
        id: "mashbills",
        header: "Mashbill",
        cell: ({ getValue }) => (
          <span className="block max-w-56 truncate text-muted-foreground">{getValue() ?? "—"}</span>
        ),
      }),
      helper.accessor("finishes", {
        id: "finishes",
        header: "Finishes",
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
      helper.accessor("ageStatement", {
        id: "ageStatement",
        header: "Age Statement",
        cell: ({ getValue }) => <span className="block max-w-40 truncate">{getValue() ?? "—"}</span>,
      }),
      helper.accessor("pricePaid", {
        id: "price",
        header: "Paid",
        cell: ({ getValue, row }) =>
          unlocked ? (
            <Input
              type="number"
              min={0}
              step={0.01}
              value={edits[row.original.id]?.pricePaid ?? editableFrom(row.original).pricePaid}
              onChange={(e) => updateEdit(row.original, "pricePaid", e.target.value)}
              className="h-8 w-24"
            />
          ) : (
            <span className="tabular-nums">{formatMoney(getValue())}</span>
          ),
      }),
      helper.accessor("msrp", {
        id: "msrp",
        header: "MSRP",
        cell: ({ getValue }) => <span className="tabular-nums">{formatMoney(getValue())}</span>,
      }),
      helper.accessor("store", {
        id: "store",
        header: "Store",
        cell: ({ getValue, row }) =>
          unlocked ? (
            <ReferenceCombobox
              id={`grid-store-${row.original.id}`}
              labelledBy={`grid-store-${row.original.id}`}
              resource="stores"
              options={stores}
              value={edits[row.original.id]?.storeId ?? editableFrom(row.original).storeId}
              onChange={(next) => updateEdit(row.original, "storeId", next)}
              onOptionCreated={() => undefined}
              placeholder="Optional…"
            />
          ) : (
            <span className="block max-w-36 truncate" title={getValue() ?? undefined}>
              {getValue() ?? "—"}
            </span>
          ),
      }),
      helper.accessor("dateAcquired", {
        id: "acquired",
        header: "Acquired",
        cell: ({ getValue, row }) =>
          unlocked ? (
            <Input
              type="date"
              value={edits[row.original.id]?.dateAcquired ?? editableFrom(row.original).dateAcquired}
              onChange={(e) => updateEdit(row.original, "dateAcquired", e.target.value)}
              className="h-8 w-36"
            />
          ) : (
            <span className="whitespace-nowrap tabular-nums">{getValue() ?? "—"}</span>
          ),
      }),
      helper.accessor("avgRating", {
        id: "rating",
        header: "Rating",
        cell: ({ getValue }) =>
          getValue() ? <span className="tabular-nums text-accent">{Number(getValue())}</span> : "—",
      }),
      helper.accessor("status", {
        id: "status",
        header: "Status",
        cell: ({ getValue, row }) =>
          unlocked ? (
            <select
              value={edits[row.original.id]?.status ?? editableFrom(row.original).status}
              onChange={(e) => updateEdit(row.original, "status", e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
            >
              {BOTTLE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </select>
          ) : (
            <StatusMark status={getValue()} />
          ),
      }),
      helper.accessor("batch", {
        id: "batch",
        header: "Batch",
        cell: ({ getValue }) => <span className="block max-w-32 truncate">{getValue() ?? "—"}</span>,
      }),
      helper.accessor("releaseYear", {
        id: "releaseYear",
        header: "Release Year",
        cell: ({ getValue, row }) =>
          unlocked ? (
            <Input
              type="number"
              min={1700}
              max={2200}
              step={1}
              value={edits[row.original.id]?.releaseYear ?? editableFrom(row.original).releaseYear}
              onChange={(e) => updateEdit(row.original, "releaseYear", e.target.value)}
              className="h-8 w-24"
            />
          ) : (
            <span className="tabular-nums">{getValue() ?? "—"}</span>
          ),
      }),
      helper.accessor("isSingleBarrel", {
        id: "singleBarrel",
        header: "Single Barrel",
        cell: ({ getValue }) => (getValue() ? "Yes" : "—"),
      }),
      helper.accessor("isSingleBarrelPick", {
        id: "privateSelection",
        header: "Private Selection",
        cell: ({ getValue }) => (getValue() ? "Yes" : "—"),
      }),
      helper.accessor("pickedBy", {
        id: "pickedBy",
        header: "Private Selection Pickers",
        cell: ({ getValue }) => <span className="block max-w-40 truncate">{getValue() ?? "—"}</span>,
      }),
    ],
    [unlocked, edits, stores],
  );

  const columnVisibility = React.useMemo<VisibilityState>(
    () => Object.fromEntries(filters.hidden.map((id) => [id, false])),
    [filters.hidden],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnVisibility, rowSelection },
    getRowId: (row) => String(row.id),
    enableRowSelection: unlocked,
    onRowSelectionChange: setRowSelection,
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

  const selectedCount = Object.values(rowSelection).filter(Boolean).length;

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
            setRowSelection({});
            setEdits({});
          }}
        >
          {unlocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
          {unlocked ? "Done editing" : "Edit"}
        </Button>
      </div>

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

      <div className={cn("hidden border border-border bg-card md:block", unlocked && "overflow-x-auto")}>
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
            <TableRow
              key={row.id}
              onDoubleClick={(event) => !unlocked && openOnDoubleClick(event, router, row.original.id)}
              className={cn(!unlocked && "cursor-pointer")}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        </Table>
      </div>

      {unlocked ? (
        <GridEditBar
          itemLabel="bottle"
          selectedCount={selectedCount}
          onClearSelection={() => setRowSelection({})}
          onDeleteSelected={handleDeleteSelected}
          dirtyCount={dirtyIds.length}
          onSaveChanges={handleSaveChanges}
        />
      ) : null}
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
        className="h-9 flex-1 rounded-md border border-input bg-card px-2 text-sm"
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
      >
        {filters.desc ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}
      </Button>
    </div>
  );
}
