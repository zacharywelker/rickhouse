"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReferenceCombobox } from "@/components/admin/reference-combobox";
import { useGridNav } from "@/components/bulk/use-grid-nav";
import { saveExpressionsBulkAction } from "@/app/(app)/expressions/actions";
import type { Option } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

type Row = {
  key: string;
  brandId: string;
  categoryId: string;
  name: string;
  proof: string;
  ageStatement: string;
  msrp: string;
  upc: string;
  labelNotes: string;
};

let nextKey = 0;
function blankRow(): Row {
  nextKey += 1;
  return {
    key: `r${nextKey}`,
    brandId: "",
    categoryId: "",
    name: "",
    proof: "",
    ageStatement: "",
    msrp: "",
    upc: "",
    labelNotes: "",
  };
}

/**
 * Only the fields every category writes (identity, strength, commercial) —
 * the same set the single-record form calls `COMMON_FIELDS`. Rum, agave and
 * whiskey-process detail stay on the single-record form: they only apply to
 * some categories, and a grid column that is right for one row and wrong for
 * the next is worse than not having it.
 */
export function ExpressionBulkGrid({ brands, categories }: { brands: Option[]; categories: Option[] }) {
  const router = useRouter();
  const nav = useGridNav();
  const [rows, setRows] = React.useState<Row[]>(() => [blankRow()]);
  const [errors, setErrors] = React.useState<Record<string, Record<string, string>>>({});
  const [brandOptions, setBrandOptions] = React.useState(brands);
  const [categoryOptions, setCategoryOptions] = React.useState(categories);
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
      const result = await saveExpressionsBulkAction(payload);
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
          ? `Added ${added} label${added === 1 ? "" : "s"}. ${failed} row${failed === 1 ? "" : "s"} need fixing.`
          : added > 0
            ? `Added ${added} label${added === 1 ? "" : "s"}.`
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
              <TableHead>Brand</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Label Name</TableHead>
              <TableHead>Proof</TableHead>
              <TableHead>Age Statement</TableHead>
              <TableHead>MSRP</TableHead>
              <TableHead>UPC</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => {
              const rowErrors = errors[row.key] ?? {};
              return (
                <TableRow key={row.key} className="hover:bg-transparent">
                  <TableCell className="min-w-44 align-top">
                    <ReferenceCombobox
                      id={`bulk-brand-${row.key}`}
                      labelledBy={`bulk-brand-${row.key}`}
                      resource="brands"
                      options={brandOptions}
                      value={row.brandId === "" ? null : Number(row.brandId)}
                      onChange={(next) => update(row.key, "brandId", next === null ? "" : String(next))}
                      onOptionCreated={(option) =>
                        setBrandOptions((prev) => [...prev, option].sort((a, b) => a.label.localeCompare(b.label)))
                      }
                      invalid={Boolean(rowErrors.brandId)}
                      placeholder="Pick or create…"
                    />
                    {rowErrors.brandId ? (
                      <p role="alert" className="mt-1 text-xs text-destructive">
                        {rowErrors.brandId}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="min-w-44 align-top">
                    <ReferenceCombobox
                      id={`bulk-category-${row.key}`}
                      labelledBy={`bulk-category-${row.key}`}
                      resource={null}
                      options={categoryOptions}
                      value={row.categoryId === "" ? null : Number(row.categoryId)}
                      onChange={(next) => update(row.key, "categoryId", next === null ? "" : String(next))}
                      onOptionCreated={() => undefined}
                      invalid={Boolean(rowErrors.categoryId)}
                      placeholder="Pick a category…"
                    />
                    {rowErrors.categoryId ? (
                      <p role="alert" className="mt-1 text-xs text-destructive">
                        {rowErrors.categoryId}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="min-w-48 align-top">
                    <Input
                      ref={nav.register(rowIndex, "name")}
                      value={row.name}
                      onChange={(e) => update(row.key, "name", e.target.value)}
                      onKeyDown={nav.handleEnter(rowIndex, "name", rows.length)}
                      className={cn("h-9", rowErrors.name && "border-destructive")}
                    />
                    {rowErrors.name ? (
                      <p role="alert" className="mt-1 text-xs text-destructive">
                        {rowErrors.name}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="min-w-24 align-top">
                    <Input
                      ref={nav.register(rowIndex, "proof")}
                      type="number"
                      min={0}
                      max={200}
                      step={0.01}
                      value={row.proof}
                      onChange={(e) => update(row.key, "proof", e.target.value)}
                      onKeyDown={nav.handleEnter(rowIndex, "proof", rows.length)}
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell className="min-w-32 align-top">
                    <Input
                      ref={nav.register(rowIndex, "ageStatement")}
                      placeholder="e.g. 7 Year"
                      value={row.ageStatement}
                      onChange={(e) => update(row.key, "ageStatement", e.target.value)}
                      onKeyDown={nav.handleEnter(rowIndex, "ageStatement", rows.length)}
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell className="min-w-24 align-top">
                    <Input
                      ref={nav.register(rowIndex, "msrp")}
                      type="number"
                      min={0}
                      step={0.01}
                      value={row.msrp}
                      onChange={(e) => update(row.key, "msrp", e.target.value)}
                      onKeyDown={nav.handleEnter(rowIndex, "msrp", rows.length)}
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell className="min-w-32 align-top">
                    <Input
                      ref={nav.register(rowIndex, "upc")}
                      value={row.upc}
                      onChange={(e) => update(row.key, "upc", e.target.value)}
                      onKeyDown={nav.handleEnter(rowIndex, "upc", rows.length)}
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell className="min-w-48 align-top">
                    <Input
                      ref={nav.register(rowIndex, "labelNotes")}
                      value={row.labelNotes}
                      onChange={(e) => update(row.key, "labelNotes", e.target.value)}
                      onKeyDown={nav.handleEnter(rowIndex, "labelNotes", rows.length)}
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
                        title="Duplicate row"
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
                        title="Delete row"
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
