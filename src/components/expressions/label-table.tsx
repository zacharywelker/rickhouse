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
import type { LinkedRow } from "@/components/expressions/ordered-picker";
import { deleteExpressionsBulkAction, getExpressionLinksAction, updateExpressionsBulkAction } from "@/app/(app)/expressions/actions";
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
 * grid's edit-only columns. */
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
  "Distilleries",
  "Mashbills",
  "Finishes",
];

export type LinkFields = { distilleries: LinkedRow[]; mashbills: LinkedRow[]; finishes: LinkedRow[] };

/**
 * The fields the unlocked grid can edit inline — the labels counterpart to
 * `GridEdit` in `bottle-table.tsx` (see `expressionGridEditSchema`). Link
 * fields (distilleries, mashbills, finishes) are tracked separately in
 * `LabelTable` since they come from a fetch rather than the page's own row
 * data — see `linkEdits`/`originalLinks` below.
 */
export type LabelGridEdit = {
  name: string;
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
    name: row.name,
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

/** Order-and-amount is what the picker edits; slug/hint are display-only, so
 * they drop out of the comparison used to decide whether links changed. */
function linksKey(links: LinkedRow[]): string {
  return JSON.stringify(links.map((row) => ({ id: row.id, amount: row.amount, distilleryId: row.distilleryId ?? null })));
}

function linksDirty(a: LinkFields, b: LinkFields): boolean {
  return linksKey(a.distilleries) !== linksKey(b.distilleries) ||
    linksKey(a.mashbills) !== linksKey(b.mashbills) ||
    linksKey(a.finishes) !== linksKey(b.finishes);
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
 * and edit for bottles and labels), mirroring `BottleTable`'s lock toggle,
 * checkbox column, dirty-row tracking and `GridEditBar` so the two grids look
 * and behave the same way.
 *
 * Bulk editing covers the scalar fields in `expressionGridEditSchema` plus
 * distilleries, mashbills and finishes, edited with the same `OrderedPicker`
 * the single-record edit page uses — reused as-is rather than built into a
 * more compact cell, since these are ordered, per-item-amount relations, not
 * a plain multi-select.
 */
export function LabelTable({
  rows,
  filters,
  brands,
  categories,
  distilleries,
  mashbills,
  finishes,
}: {
  rows: ExpressionRow[];
  filters: LabelFilters;
  brands: Option[];
  categories: Option[];
  distilleries: Option[];
  mashbills: Option[];
  finishes: Option[];
}) {
  const router = useRouter();
  const [unlocked, setUnlocked] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<number>>(new Set());
  const [edits, setEdits] = React.useState<Record<number, LabelGridEdit>>({});
  const [linkEdits, setLinkEdits] = React.useState<Record<number, LinkFields>>({});
  const [originalLinks, setOriginalLinks] = React.useState<Record<number, LinkFields>>({});
  const [linksLoaded, setLinksLoaded] = React.useState(false);

  React.useEffect(() => {
    setSelectedIds(new Set());
    setEdits({});
    setLinkEdits({});
    setOriginalLinks({});
    setLinksLoaded(false);
  }, [rows]);

  // Links aren't part of the page's own row data (they'd cost three extra
  // joins on every locked page view for a feature most visits never touch),
  // so they're fetched once, lazily, the moment the grid unlocks.
  React.useEffect(() => {
    if (!unlocked || linksLoaded || rows.length === 0) return;
    let cancelled = false;
    void getExpressionLinksAction(rows.map((row) => row.id)).then((results) => {
      if (cancelled) return;
      const next: Record<number, LinkFields> = {};
      for (const row of results) {
        next[row.id] = {
          distilleries: row.distilleries.map((d) => ({ id: d.id, label: d.name, amount: d.amount ?? "" })),
          mashbills: row.mashbills.map((m) => ({
            id: m.id,
            label: m.name,
            hint: m.attribution ? `from ${m.attribution}` : undefined,
            amount: m.amount ?? "",
            distilleryId: m.distilleryId ?? null,
          })),
          finishes: row.finishes.map((f) => ({ id: f.id, label: f.name, amount: f.amount ?? "" })),
        };
      }
      setOriginalLinks(next);
      setLinkEdits(next);
      setLinksLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [unlocked, linksLoaded, rows]);

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

  function updateLinks<K extends keyof LinkFields>(row: ExpressionRow, field: K, value: LinkFields[K]) {
    setLinkEdits((prev) => ({
      ...prev,
      [row.id]: { ...(prev[row.id] ?? originalLinks[row.id] ?? { distilleries: [], mashbills: [], finishes: [] }), [field]: value },
    }));
  }

  const dirtyIds = React.useMemo(() => {
    const scalarDirty = rows.filter((row) => edits[row.id] && isDirty(row, edits[row.id]!)).map((row) => row.id);
    const linkDirty = rows
      .filter((row) => {
        const current = linkEdits[row.id];
        const original = originalLinks[row.id];
        return current && original && linksDirty(current, original);
      })
      .map((row) => row.id);
    return Array.from(new Set([...scalarDirty, ...linkDirty]));
  }, [rows, edits, linkEdits, originalLinks]);

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const someSelected = rows.some((row) => selectedIds.has(row.id));

  function linksPayloadFor(id: number) {
    const links = linkEdits[id] ?? originalLinks[id] ?? { distilleries: [], mashbills: [], finishes: [] };
    const toLinkRows = (rows: LinkedRow[]) =>
      rows.map((row) => ({ id: row.id, amount: row.amount === "" ? "" : row.amount, distilleryId: row.distilleryId ?? null }));
    return {
      distilleries: toLinkRows(links.distilleries),
      mashbills: toLinkRows(links.mashbills),
      finishes: toLinkRows(links.finishes),
    };
  }

  async function handleSaveChanges() {
    const payload = dirtyIds.map((id) => {
      const row = rows.find((r) => r.id === id)!;
      return { id, ...(edits[id] ?? editableFrom(row)), ...linksPayloadFor(id) };
    });
    const result = await updateExpressionsBulkAction(payload);
    const savedIds = new Set(result.results.filter((r) => r.ok).map((r) => r.id));
    setEdits((prev) => {
      const next = { ...prev };
      for (const id of savedIds) delete next[id];
      return next;
    });
    setOriginalLinks((prev) => {
      const next = { ...prev };
      for (const id of savedIds) if (linkEdits[id]) next[id] = linkEdits[id]!;
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
            distilleries={distilleries}
            mashbills={mashbills}
            finishes={finishes}
            edits={edits}
            updateEdit={updateEdit}
            linkEdits={linkEdits}
            updateLinks={updateLinks}
            linksLoaded={linksLoaded}
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
