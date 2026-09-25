"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReferenceCombobox } from "@/components/admin/reference-combobox";
import { useGridNav } from "@/components/bulk/use-grid-nav";
import { saveBottlesBulkAction } from "@/app/(app)/bottles/actions";
import { ACQUISITIONS, BOTTLE_STATUSES } from "@/db/schema";
import type { Option } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

const titleCase = (value: string) => value[0]!.toUpperCase() + value.slice(1);

type Row = {
  key: string;
  expressionId: string;
  acquisition: string;
  status: string;
  pricePaid: string;
  storeId: string;
  dateAcquired: string;
  batch: string;
  location: string;
  notes: string;
};

let nextKey = 0;
function blankRow(): Row {
  nextKey += 1;
  return {
    key: `r${nextKey}`,
    expressionId: "",
    acquisition: "purchase",
    status: "owned",
    pricePaid: "",
    storeId: "",
    dateAcquired: "",
    batch: "",
    location: "",
    notes: "",
  };
}

export function BottleBulkGrid({ expressions, stores }: { expressions: Option[]; stores: Option[] }) {
  const router = useRouter();
  const nav = useGridNav();
  const [rows, setRows] = React.useState<Row[]>(() => [blankRow()]);
  const [errors, setErrors] = React.useState<Record<string, Record<string, string>>>({});
  const [storeOptions, setStoreOptions] = React.useState(stores);
  const [saving, setSaving] = React.useState(false);
  const [summary, setSummary] = React.useState<string | null>(null);

  function update(key: string, field: keyof Omit<Row, "key">, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
  }

  function duplicateRow(key: string) {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.key === key);
      if (index === -1) return prev;
      const copy: Row = { ...prev[index]!, key: blankRow().key };
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function saveAll() {
    setSaving(true);
    setSummary(null);
    const keys = rows.map((r) => r.key);
    const payload = rows.map(({ key: _key, ...values }) => values);

    try {
      const result = await saveBottlesBulkAction(payload);
      const savedKeys = new Set<string>();
      const nextErrors: Record<string, Record<string, string>> = {};

      for (const row of result.results) {
        const key = keys[row.index]!;
        if (row.ok) savedKeys.add(key);
        else nextErrors[key] = row.fieldErrors;
      }

      setRows((prev) => {
        const remaining = prev.filter((r) => !savedKeys.has(r.key));
        return remaining.length > 0 ? remaining : [blankRow()];
      });
      setErrors(nextErrors);

      const failed = result.results.length - result.savedCount;
      const added = result.savedCount;
      setSummary(
        added > 0 && failed > 0
          ? `Added ${added} bottle${added === 1 ? "" : "s"}. ${failed} row${failed === 1 ? "" : "s"} need fixing.`
          : added > 0
            ? `Added ${added} bottle${added === 1 ? "" : "s"}.`
            : failed > 0
              ? `${failed} row${failed === 1 ? "" : "s"} need fixing.`
              : null,
      );
      if (added > 0) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Label</TableHead>
              <TableHead>Acquisition</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Price Paid</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Date Acquired</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => {
              const rowErrors = errors[row.key] ?? {};
              return (
                <TableRow key={row.key} className="hover:bg-transparent">
                  <TableCell className="min-w-52 align-top">
                    <ReferenceCombobox
                      id={`bulk-expr-${row.key}`}
                      labelledBy={`bulk-expr-${row.key}`}
                      resource={null}
                      options={expressions}
                      value={row.expressionId === "" ? null : Number(row.expressionId)}
                      onChange={(next) => update(row.key, "expressionId", next === null ? "" : String(next))}
                      onOptionCreated={() => undefined}
                      invalid={Boolean(rowErrors.expressionId)}
                      placeholder="Pick a label…"
                    />
                    {rowErrors.expressionId ? (
                      <p role="alert" className="mt-1 text-xs text-destructive">
                        {rowErrors.expressionId}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="min-w-32 align-top">
                    <select
                      ref={nav.register(rowIndex, "acquisition")}
                      value={row.acquisition}
                      onChange={(e) => update(row.key, "acquisition", e.target.value)}
                      onKeyDown={nav.handleEnter(rowIndex, "acquisition", rows.length)}
                      className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
                    >
                      {ACQUISITIONS.map((value) => (
                        <option key={value} value={value}>
                          {titleCase(value)}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="min-w-32 align-top">
                    <select
                      ref={nav.register(rowIndex, "status")}
                      value={row.status}
                      onChange={(e) => update(row.key, "status", e.target.value)}
                      onKeyDown={nav.handleEnter(rowIndex, "status", rows.length)}
                      className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
                    >
                      {BOTTLE_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {titleCase(value)}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="min-w-28 align-top">
                    <Input
                      ref={nav.register(rowIndex, "pricePaid")}
                      type="number"
                      min={0}
                      step={0.01}
                      value={row.pricePaid}
                      onChange={(e) => update(row.key, "pricePaid", e.target.value)}
                      onKeyDown={nav.handleEnter(rowIndex, "pricePaid", rows.length)}
                      className={cn("h-9", rowErrors.pricePaid && "border-destructive")}
                    />
                  </TableCell>
                  <TableCell className="min-w-44 align-top">
                    <ReferenceCombobox
                      id={`bulk-store-${row.key}`}
                      labelledBy={`bulk-store-${row.key}`}
                      resource="stores"
                      options={storeOptions}
                      value={row.storeId === "" ? null : Number(row.storeId)}
                      onChange={(next) => update(row.key, "storeId", next === null ? "" : String(next))}
                      onOptionCreated={(option) =>
                        setStoreOptions((prev) => [...prev, option].sort((a, b) => a.label.localeCompare(b.label)))
                      }
                      invalid={Boolean(rowErrors.storeId)}
                      placeholder="Optional…"
                    />
                  </TableCell>
                  <TableCell className="min-w-36 align-top">
                    <Input
                      ref={nav.register(rowIndex, "dateAcquired")}
                      type="date"
                      value={row.dateAcquired}
                      onChange={(e) => update(row.key, "dateAcquired", e.target.value)}
                      onKeyDown={nav.handleEnter(rowIndex, "dateAcquired", rows.length)}
                      className={cn("h-9", rowErrors.dateAcquired && "border-destructive")}
                    />
                  </TableCell>
                  <TableCell className="min-w-28 align-top">
                    <Input
                      ref={nav.register(rowIndex, "batch")}
                      value={row.batch}
                      onChange={(e) => update(row.key, "batch", e.target.value)}
                      onKeyDown={nav.handleEnter(rowIndex, "batch", rows.length)}
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell className="min-w-32 align-top">
                    <Input
                      ref={nav.register(rowIndex, "location")}
                      value={row.location}
                      onChange={(e) => update(row.key, "location", e.target.value)}
                      onKeyDown={nav.handleEnter(rowIndex, "location", rows.length)}
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell className="min-w-48 align-top">
                    <Input
                      ref={nav.register(rowIndex, "notes")}
                      value={row.notes}
                      onChange={(e) => update(row.key, "notes", e.target.value)}
                      onKeyDown={nav.handleEnter(rowIndex, "notes", rows.length)}
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-8 px-0"
                        onClick={() => duplicateRow(row.key)}
                        aria-label="Duplicate row"
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-8 px-0"
                        onClick={() => removeRow(row.key)}
                        aria-label="Delete row"
                        disabled={rows.length === 1}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {summary ? <p className="text-sm text-muted-foreground">{summary}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={addRow}>
          <Plus className="size-4" />
          Add row
        </Button>
        <Button type="button" onClick={saveAll} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save all
        </Button>
      </div>
    </div>
  );
}
