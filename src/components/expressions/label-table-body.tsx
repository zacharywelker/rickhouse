"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ReferenceCombobox } from "@/components/admin/reference-combobox";
import { OrderedPicker } from "@/components/expressions/ordered-picker";
import { formatMoney, formatNumeric } from "@/lib/utils";
import type { Option } from "@/lib/admin/types";
import type { ExpressionRow } from "@/lib/expressions/queries";
import type { LabelGridEdit, LinkFields } from "./label-table";

const TRISTATE = [
  { value: "", label: "Unknown" },
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
] as const;

/**
 * Mirrors the bottle grid's double-click-to-open (SPEC M8): the row opens
 * the label's edit page, skipped when the pointer is on something that
 * already does its own thing or there is a text selection to preserve.
 */
function openOnDoubleClick(event: React.MouseEvent, router: ReturnType<typeof useRouter>, id: number) {
  if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea, [role='slider']")) {
    return;
  }
  if ((window.getSelection()?.toString() ?? "") !== "") return;
  router.push(`/expressions/${id}/edit` as Route);
}

export function LabelTableBody({
  rows,
  unlocked,
  selectedIds,
  onToggle,
  brands,
  categories,
  distilleries,
  mashbills,
  finishes,
  edits,
  updateEdit,
  linkEdits,
  updateLinks,
  linksLoaded,
}: {
  rows: ExpressionRow[];
  unlocked: boolean;
  selectedIds: ReadonlySet<number>;
  onToggle: (id: number, selected: boolean) => void;
  brands: Option[];
  categories: Option[];
  distilleries: Option[];
  mashbills: Option[];
  finishes: Option[];
  edits: Record<number, LabelGridEdit>;
  updateEdit: <K extends keyof LabelGridEdit>(row: ExpressionRow, field: K, value: LabelGridEdit[K]) => void;
  linkEdits: Record<number, LinkFields>;
  updateLinks: <K extends keyof LinkFields>(row: ExpressionRow, field: K, value: LinkFields[K]) => void;
  linksLoaded: boolean;
}) {
  const router = useRouter();

  return (
    <TableBody>
      {rows.map((row) => {
        const edit = edits[row.id];
        return (
          <TableRow
            key={row.id}
            onDoubleClick={(event) => !unlocked && openOnDoubleClick(event, router, row.id)}
            className={unlocked ? undefined : "cursor-pointer"}
          >
            {unlocked ? (
              <TableCell className="align-top">
                <Checkbox
                  checked={selectedIds.has(row.id)}
                  onCheckedChange={(value) => onToggle(row.id, Boolean(value))}
                  aria-label={`Select ${row.brand} ${row.name}`}
                />
              </TableCell>
            ) : null}

            <TableCell className="hidden align-top font-medium sm:table-cell">
              {unlocked ? (
                <ReferenceCombobox
                  id={`grid-brand-${row.id}`}
                  labelledBy={`grid-brand-${row.id}`}
                  resource="brands"
                  options={brands}
                  value={edit?.brandId ?? row.brandId}
                  onChange={(next) => next !== null && updateEdit(row, "brandId", next)}
                  onOptionCreated={() => undefined}
                  placeholder="Brand…"
                />
              ) : (
                row.brand
              )}
            </TableCell>

            <TableCell className="align-top">
              {/* Brand folds in here on a phone; the edit link is the only
                  way into a label, so it must never be squeezed off. */}
              <span className="block text-xs text-muted-foreground sm:hidden">{row.brand}</span>
              {unlocked ? (
                <Input
                  value={edit?.name ?? row.name}
                  onChange={(e) => updateEdit(row, "name", e.target.value)}
                  className="h-8 w-40"
                />
              ) : (
                <span className="text-accent">{row.name}</span>
              )}
              {row.pickCount > 0 ? (
                <Badge className="ml-2 border-primary/40 text-primary">
                  {row.pickCount} pick{row.pickCount === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </TableCell>

            <TableCell className="hidden align-top sm:table-cell">
              {unlocked ? (
                <ReferenceCombobox
                  id={`grid-category-${row.id}`}
                  labelledBy={`grid-category-${row.id}`}
                  resource={null}
                  options={categories}
                  value={edit?.categoryId ?? row.categoryId}
                  onChange={(next) => next !== null && updateEdit(row, "categoryId", next)}
                  onOptionCreated={() => undefined}
                  placeholder="Category…"
                />
              ) : (
                row.category
              )}
            </TableCell>

            <TableCell className="align-top text-right tabular-nums">
              {unlocked ? (
                <Input
                  type="number"
                  min={0}
                  max={200}
                  step={0.01}
                  value={edit?.proof ?? row.proof ?? ""}
                  onChange={(e) => updateEdit(row, "proof", e.target.value)}
                  className="h-8 w-20"
                />
              ) : (
                formatNumeric(row.proof)
              )}
            </TableCell>

            <TableCell className="hidden align-top text-right tabular-nums sm:table-cell">
              {unlocked ? (
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={edit?.msrp ?? row.msrp ?? ""}
                  onChange={(e) => updateEdit(row, "msrp", e.target.value)}
                  className="h-8 w-24"
                />
              ) : (
                formatMoney(row.msrp)
              )}
            </TableCell>

            <TableCell className="align-top text-right tabular-nums">{row.bottleCount}</TableCell>

            {unlocked ? (
              <>
                <TableCell className="align-top">
                  <Input
                    value={edit?.ageStatement ?? row.ageStatement ?? ""}
                    placeholder="e.g. 7 Year"
                    onChange={(e) => updateEdit(row, "ageStatement", e.target.value)}
                    className="h-8 w-28"
                  />
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      aria-label="Age, years"
                      value={edit?.ageYears ?? row.ageYears ?? ""}
                      onChange={(e) => updateEdit(row, "ageYears", e.target.value)}
                      className="h-8 w-16"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={1200}
                      step={1}
                      aria-label="Age, months"
                      value={edit?.ageMonths ?? (row.ageMonths ?? "")}
                      onChange={(e) => updateEdit(row, "ageMonths", e.target.value)}
                      className="h-8 w-16"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={40000}
                      step={1}
                      aria-label="Age, days"
                      value={edit?.ageDays ?? (row.ageDays ?? "")}
                      onChange={(e) => updateEdit(row, "ageDays", e.target.value)}
                      className="h-8 w-16"
                    />
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <Input
                    type="number"
                    min={0}
                    max={200}
                    step={0.01}
                    value={edit?.entryProof ?? row.entryProof ?? ""}
                    onChange={(e) => updateEdit(row, "entryProof", e.target.value)}
                    className="h-8 w-20"
                  />
                </TableCell>
                <TableCell className="align-top">
                  <Input
                    value={edit?.charLevel ?? row.charLevel ?? ""}
                    placeholder="#4 alligator char"
                    onChange={(e) => updateEdit(row, "charLevel", e.target.value)}
                    className="h-8 w-32"
                  />
                </TableCell>
                <TableCell className="align-top">
                  <Input
                    type="number"
                    min={1}
                    max={20000}
                    step={1}
                    value={edit?.sizeMl ?? row.sizeMl}
                    onChange={(e) => updateEdit(row, "sizeMl", e.target.value)}
                    className="h-8 w-20"
                  />
                </TableCell>
                <TableCell className="align-top">
                  <Input
                    value={edit?.upc ?? row.upc ?? ""}
                    onChange={(e) => updateEdit(row, "upc", e.target.value)}
                    className="h-8 w-32"
                  />
                </TableCell>
                <TableCell className="align-top text-center">
                  <Checkbox
                    checked={edit?.isCaskStrength ?? row.isCaskStrength}
                    onCheckedChange={(value) => updateEdit(row, "isCaskStrength", Boolean(value))}
                    aria-label="Cask strength"
                  />
                </TableCell>
                <TableCell className="align-top text-center">
                  <Checkbox
                    checked={edit?.isStraight ?? row.isStraight}
                    onCheckedChange={(value) => updateEdit(row, "isStraight", Boolean(value))}
                    aria-label="Straight"
                  />
                </TableCell>
                <TableCell className="align-top text-center">
                  <Checkbox
                    checked={edit?.isNas ?? row.isNas}
                    onCheckedChange={(value) => updateEdit(row, "isNas", Boolean(value))}
                    aria-label="NAS"
                  />
                </TableCell>
                <TableCell className="align-top text-center">
                  <Checkbox
                    checked={edit?.isBottledInBond ?? row.isBottledInBond}
                    onCheckedChange={(value) => updateEdit(row, "isBottledInBond", Boolean(value))}
                    aria-label="Bottled in bond"
                  />
                </TableCell>
                <TableCell className="align-top">
                  <select
                    value={edit?.isChillFiltered ?? (row.isChillFiltered === null ? "" : String(row.isChillFiltered))}
                    onChange={(e) => updateEdit(row, "isChillFiltered", e.target.value)}
                    className="h-8 w-24 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                  >
                    {TRISTATE.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell className="align-top">
                  <select
                    value={edit?.colorAdded ?? (row.colorAdded === null ? "" : String(row.colorAdded))}
                    onChange={(e) => updateEdit(row, "colorAdded", e.target.value)}
                    className="h-8 w-24 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                  >
                    {TRISTATE.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </TableCell>

                {linksLoaded ? (
                  <>
                    <TableCell className="min-w-72 align-top">
                      <OrderedPicker
                        name={`grid-distilleries-${row.id}`}
                        label="Distilleries"
                        description=""
                        resource="distilleries"
                        options={distilleries}
                        amountLabel="Share"
                        amountSuffix="%"
                        value={linkEdits[row.id]?.distilleries ?? []}
                        onChange={(next) => updateLinks(row, "distilleries", next)}
                      />
                    </TableCell>
                    <TableCell className="min-w-72 align-top">
                      <OrderedPicker
                        name={`grid-mashbills-${row.id}`}
                        label="Mashbills"
                        description=""
                        resource={null}
                        emptyHint="Mashbills are made on the Numbers page."
                        options={mashbills}
                        amountLabel="Share"
                        amountSuffix="%"
                        value={linkEdits[row.id]?.mashbills ?? []}
                        onChange={(next) => updateLinks(row, "mashbills", next)}
                        distilleryChoices={(linkEdits[row.id]?.distilleries ?? []).map((d) => ({
                          id: d.id,
                          name: d.label,
                        }))}
                      />
                    </TableCell>
                    <TableCell className="min-w-72 align-top">
                      <OrderedPicker
                        name={`grid-finishes-${row.id}`}
                        label="Finishes"
                        description=""
                        resource="finishes"
                        options={finishes}
                        amountLabel="Months"
                        amountSuffix="mo"
                        value={linkEdits[row.id]?.finishes ?? []}
                        onChange={(next) => updateLinks(row, "finishes", next)}
                      />
                    </TableCell>
                  </>
                ) : (
                  <TableCell colSpan={3} className="align-top text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                )}
              </>
            ) : null}

            <TableCell className="align-top text-right">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/expressions/${row.id}/edit`} aria-label={`Edit ${row.brand} ${row.name}`}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  );
}
