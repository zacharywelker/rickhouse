"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Check, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { CELL_WIDTH, GridCell } from "@/components/bulk/grid-cell";
import { cn, formatMoney, formatNumeric } from "@/lib/utils";
import type { FieldSpec, Option } from "@/lib/admin/types";
import type { FieldValue } from "@/lib/forms/values";
import { LABEL_COLUMNS, type LabelColumn, type LabelColumnGroup } from "@/lib/expressions/columns";
import { describeAgeParts, fieldGroupOf, groupApplies, type LabelEdit } from "@/lib/expressions/label-edits";
import { describeLinks, LINK_KINDS, type LinkKind } from "@/lib/expressions/links";
import type { ExpressionRow } from "@/lib/expressions/queries";
import type { FieldGroup } from "@/db/schema";
import type { LinkedRow } from "./ordered-picker";
import { LinksCell } from "./links-cell";
import type { RowErrors } from "./label-table";

export type ShownColumn = { column: LabelColumn; group: LabelColumnGroup };

/** What still fits on a phone. Brand folds into the label cell there. */
export const PHONE_COLUMNS: ReadonlySet<string> = new Set(["name", "proof", "bottles"]);

const LINK_COLUMNS: ReadonlySet<string> = new Set<LinkKind>(["distilleries", "mashbills", "finishes"]);

const DASH = <span className="text-muted-foreground">—</span>;

/** "upc" -> "UPC / Barcode", for an error on a column that may not be shown. */
const FIELD_LABELS = new Map(LABEL_COLUMNS.flatMap((column) => column.specs.map((spec) => [spec.name, spec.label])));

/**
 * A failed save's message, on the label cell (the one column always shown):
 * the fields it names, or — for a database constraint that names no form
 * field — the row's own error.
 */
function errorText(errors: RowErrors): string {
  const known = Object.entries(errors.fields).filter(([name]) => FIELD_LABELS.has(name));
  return known.length > 0 ? known.map(([name, message]) => `${FIELD_LABELS.get(name)}: ${message}`).join(" ") : errors.error;
}

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

/** A stored value as the table shows it, by the kind of field it is. */
function display(spec: FieldSpec, value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return DASH;
  switch (spec.kind) {
    case "checkbox":
      return value === true ? <Check role="img" aria-label="Yes" className="inline size-4 text-primary" /> : DASH;
    case "select": {
      const option = spec.options.find((o) => o.value === String(value));
      return option && option.value !== "" ? option.label : DASH;
    }
    case "number":
      return spec.name === "msrp" ? formatMoney(String(value)) : formatNumeric(String(value));
    default:
      return (
        <span className="block max-w-56 truncate" title={String(value)}>
          {String(value)}
        </span>
      );
  }
}

export function LabelTableBody({
  rows,
  shown,
  unlocked,
  selectedIds,
  onToggle,
  options,
  categoryGroups,
  originals,
  edits,
  updateEdit,
  saveErrors,
}: {
  rows: ExpressionRow[];
  shown: ShownColumn[];
  unlocked: boolean;
  selectedIds: ReadonlySet<number>;
  onToggle: (id: number, selected: boolean) => void;
  options: Record<string, Option[]>;
  categoryGroups: Record<number, FieldGroup>;
  originals: ReadonlyMap<number, LabelEdit>;
  edits: Record<number, LabelEdit>;
  updateEdit: (row: ExpressionRow, name: string, value: LabelEdit[string]) => void;
  saveErrors: Record<number, RowErrors>;
}) {
  const router = useRouter();
  // A brand created from a cell should be pickable in every other row too.
  const [optionsByField, setOptionsByField] = React.useState(options);

  function editCell(row: ExpressionRow, column: LabelColumn, values: LabelEdit, errors: Record<string, string>) {
    const cellId = (name: string) => `label-${row.id}-${name}`;
    const labelledBy = `label-col-${column.id}`;

    if (LINK_COLUMNS.has(column.id)) {
      const kind = column.id as LinkKind;
      const field = LINK_KINDS[kind].field;
      return (
        <LinksCell
          kind={kind}
          id={cellId(field)}
          labelledBy={labelledBy}
          value={values[field] as LinkedRow[]}
          onChange={(next) => updateEdit(row, field, next)}
          options={optionsByField[field] ?? []}
          className="h-8"
          {...(kind === "mashbills"
            ? {
                distilleryChoices: (values.distilleryLinks as LinkedRow[]).map((d) => ({ id: d.id, name: d.label })),
              }
            : {})}
        />
      );
    }
    if (column.id === "abv") {
      const proof = String(values.proof ?? "");
      return proof === "" || Number.isNaN(Number(proof)) ? DASH : `${formatNumeric(String(Number(proof) / 2))}%`;
    }
    return (
      <div className="flex items-start gap-1">
        {column.specs.map((spec) => (
          <GridCell
            key={spec.name}
            spec={spec}
            id={cellId(spec.name)}
            labelledBy={labelledBy}
            value={values[spec.name] as FieldValue}
            onChange={(next) => updateEdit(row, spec.name, next)}
            invalid={errors[spec.name] !== undefined}
            options={optionsByField[spec.name] ?? []}
            onOptionCreated={(option) =>
              setOptionsByField((prev) => ({
                ...prev,
                [spec.name]: [...(prev[spec.name] ?? []), option].sort((a, b) => a.label.localeCompare(b.label)),
              }))
            }
            className={cn("h-8", column.specs.length > 1 && "w-16")}
          />
        ))}
      </div>
    );
  }

  function viewCell(row: ExpressionRow, column: LabelColumn) {
    switch (column.id) {
      case "name":
        return (
          <>
            {/* Brand folds in here on a phone; the edit link is the only
                way into a label, so it must never be squeezed off. */}
            <span className="block text-xs text-muted-foreground sm:hidden">{row.brand}</span>
            <span className="text-accent">{row.name}</span>
            {row.pickCount > 0 ? (
              <Badge className="ml-2 border-primary/40 text-primary">
                {row.pickCount} pick{row.pickCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </>
        );
      case "brand":
        return <span className="font-medium">{row.brand}</span>;
      case "category":
        return row.category;
      case "abv":
        return row.abv === null ? DASH : `${formatNumeric(row.abv)}%`;
      case "age":
        return describeAgeParts(row.ageYears, row.ageMonths, row.ageDays) ?? DASH;
      case "bottles":
        return row.bottleCount;
      case "distilleries":
      case "mashbills":
      case "finishes": {
        const text = describeLinks(column.id, row.links[column.id]);
        return text === "" ? (
          DASH
        ) : (
          <span className="block max-w-56 truncate" title={text}>
            {text}
          </span>
        );
      }
      default: {
        const spec = column.specs[0]!;
        return display(spec, (row as unknown as Record<string, unknown>)[spec.name]);
      }
    }
  }

  return (
    <TableBody>
      {rows.map((row) => {
        const edit = edits[row.id];
        const values = edit ?? originals.get(row.id)!;
        const fieldGroup = unlocked ? fieldGroupOf(row, edit, categoryGroups) : row.fieldGroup;
        const rowErrors = saveErrors[row.id];
        return (
          <TableRow
            key={row.id}
            onDoubleClick={(event) => !unlocked && openOnDoubleClick(event, router, row.id)}
            // Top-aligned only while editing, where inputs of different
            // heights share a row; read-only rows centre, so the text lines up
            // with the edit button beside it.
            className={unlocked ? "[&>td]:align-top" : "cursor-pointer"}
          >
            {unlocked ? (
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(row.id)}
                  onCheckedChange={(value) => onToggle(row.id, Boolean(value))}
                  aria-label={`Select ${row.brand} ${row.name}`}
                />
              </TableCell>
            ) : null}

            {shown.map(({ column, group }) => {
              const applies = groupApplies(group, fieldGroup);
              return (
                <TableCell
                  key={column.id}
                  className={cn(
                    !PHONE_COLUMNS.has(column.id) && "hidden sm:table-cell",
                    column.numeric && "text-right tabular-nums",
                    unlocked && applies && column.specs.length === 1 && CELL_WIDTH[column.specs[0]!.kind],
                    unlocked && applies && LINK_COLUMNS.has(column.id) && "min-w-44",
                  )}
                >
                  {!applies ? (
                    <span className="text-muted-foreground/60" title="Not used for this category">
                      —
                    </span>
                  ) : unlocked && column.id !== "bottles" ? (
                    editCell(row, column, values, rowErrors?.fields ?? {})
                  ) : (
                    viewCell(row, column)
                  )}
                  {column.locked && rowErrors ? (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      {errorText(rowErrors)}
                    </p>
                  ) : null}
                </TableCell>
              );
            })}

            <TableCell className="text-right">
              <Button variant="ghost" size="sm" asChild>
                <Link
                  href={`/expressions/${row.id}/edit`}
                  aria-label={`Edit ${row.brand} ${row.name}`}
                  title={`Edit ${row.brand} ${row.name}`}
                >
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
