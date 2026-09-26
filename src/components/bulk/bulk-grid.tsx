"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fieldVisible, sectionVisible, type FormSection } from "@/lib/expressions/fields";
import { initialFieldValues, type FieldValue } from "@/lib/forms/values";
import type { FieldSpec, Option } from "@/lib/admin/types";
import type { BulkSaveResult } from "@/lib/bulk/types";
import type { FieldGroup } from "@/db/schema";
import { cn } from "@/lib/utils";
import { ColumnPicker } from "./column-picker";
import { CELL_WIDTH, GridCell } from "./grid-cell";
import { useGridNav } from "./use-grid-nav";
import { useHiddenColumns } from "./use-hidden-columns";

export type RowValues = Record<string, unknown>;

/** A column that is not a plain form field — a label's distilleries, say. */
export type CustomColumn = {
  id: string;
  label: string;
  initial: () => unknown;
  /** What the server receives for this column. */
  toPayload: (value: unknown) => unknown;
  render: (props: {
    id: string;
    labelledBy: string;
    value: unknown;
    onChange: (value: unknown) => void;
    values: RowValues;
  }) => React.ReactNode;
  className?: string;
};

/** A form section, optionally with custom columns after its fields. */
export type BulkSection = FormSection & { custom?: ReadonlyArray<CustomColumn> };

type Column = {
  id: string;
  label: string;
  section: BulkSection;
  required: boolean;
  spec?: FieldSpec;
  custom?: CustomColumn;
};

type RowErrors = { error: string; fields: Record<string, string> };
type Row = { key: string; values: RowValues };

function columnsOf(section: BulkSection): Column[] {
  return [
    ...section.fields.map((spec) => ({
      id: spec.name,
      label: spec.label,
      section,
      spec,
      required: "required" in spec && spec.required === true,
    })),
    ...(section.custom ?? []).map((custom) => ({ id: custom.id, label: custom.label, section, custom, required: false })),
  ];
}

let nextKey = 0;

/**
 * A spreadsheet-style sheet for entering many records at once (Issue #49).
 *
 * Every field on the record's form is a column — the form's own sections
 * are the column groups — so anything the single-record form can set, the
 * grid can too. That is a lot of columns, so the Fields picker hides the
 * ones you don't use, remembered in this browser. Hidden is only a view: a
 * value already typed into a column you then hide is still saved.
 *
 * A cell that does not apply to its row — esters on a bourbon, a pick name
 * on a bottle that is not a private selection — is shown as a dash, by the
 * same rules that hide those fields on the form, and is saved blank.
 */
export function BulkGrid({
  sections,
  options,
  fieldGroupFor = () => null,
  onChanged,
  save,
  noun,
  storageKey,
}: {
  sections: ReadonlyArray<BulkSection>;
  /** Picker options for `reference` fields, by field name. */
  options: Record<string, Option[]>;
  /** The row's spirit, for per-category sections. Null when there are none. */
  fieldGroupFor?: (values: RowValues) => FieldGroup | null;
  /** Follow-on changes to make when a field changes — the form's niceties. */
  onChanged?: (prev: RowValues, next: RowValues, name: string) => RowValues;
  save: (rows: Record<string, unknown>[]) => Promise<BulkSaveResult>;
  noun: string;
  /** Where this grid remembers its hidden columns. */
  storageKey: string;
}) {
  const router = useRouter();
  const nav = useGridNav();
  const gridId = React.useId();
  const [hidden, setHidden] = useHiddenColumns(storageKey);

  const allColumns = React.useMemo(() => sections.flatMap(columnsOf), [sections]);
  const labelOf = React.useMemo(() => new Map(allColumns.map((c) => [c.id, c.label])), [allColumns]);

  const blankRow = React.useCallback((): Row => {
    nextKey += 1;
    const values: RowValues = initialFieldValues(
      allColumns.flatMap((c) => (c.spec ? [c.spec] : [])),
      null,
    );
    for (const column of allColumns) if (column.custom) values[column.id] = column.custom.initial();
    return { key: `r${nextKey}`, values };
  }, [allColumns]);

  const [rows, setRows] = React.useState<Row[]>(() => [blankRow()]);
  const [errors, setErrors] = React.useState<Record<string, RowErrors>>({});
  const [optionsByField, setOptionsByField] = React.useState(options);
  const [saving, setSaving] = React.useState(false);
  const [summary, setSummary] = React.useState<string | null>(null);

  const isShown = (column: Column) => column.required || !hidden.has(column.id);
  const shownSections = sections
    .map((section) => ({ section, columns: columnsOf(section).filter(isShown) }))
    .filter((group) => group.columns.length > 0);
  const shownColumns = shownSections.flatMap((group) => group.columns);
  const shownIds = new Set(shownColumns.map((column) => column.id));

  /** Whether a column applies to a row, and if not, why — for the cell's hint. */
  function applicability(column: Column, values: RowValues): { applies: true } | { applies: false; why: string } {
    const { section } = column;
    const fieldGroup = fieldGroupFor(values);
    if (section.fieldGroups && (fieldGroup === null || !section.fieldGroups.includes(fieldGroup))) {
      return {
        applies: false,
        why: fieldGroup === null ? "Pick a category first" : `Only for ${section.fieldGroups.join(" or ")}`,
      };
    }
    const gate = !sectionVisible(section, fieldGroup, values)
      ? section.showWhenAny
      : column.spec && !fieldVisible(column.spec, values)
        ? column.spec.showWhenAny
        : undefined;
    if (gate) return { applies: false, why: `Tick ${gate.map((name) => labelOf.get(name) ?? name).join(" or ")} first` };
    return { applies: true };
  }

  function update(key: string, name: string, value: unknown) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row.values, [name]: value };
        return { ...row, values: onChanged ? onChanged(row.values, next, name) : next };
      }),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
  }

  function duplicateRow(key: string) {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.key === key);
      if (index === -1) return prev;
      const copy: Row = { key: blankRow().key, values: { ...prev[index]!.values } };
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

  /** Every column, shown or not; a cell that does not apply goes blank. */
  function payloadFor(values: RowValues): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const column of allColumns) {
      const applies = applicability(column, values).applies;
      if (column.custom) {
        payload[column.id] = column.custom.toPayload(applies ? values[column.id] : column.custom.initial());
      } else {
        payload[column.id] = applies ? values[column.id] : column.spec?.kind === "checkbox" ? false : "";
      }
    }
    return payload;
  }

  async function saveAll() {
    setSaving(true);
    setSummary(null);
    const keys = rows.map((r) => r.key);

    try {
      const result = await save(rows.map((row) => payloadFor(row.values)));
      const savedKeys = new Set<string>();
      const nextErrors: Record<string, RowErrors> = {};

      for (const row of result.results) {
        const key = keys[row.index]!;
        if (row.ok) savedKeys.add(key);
        else nextErrors[key] = { error: row.error, fields: row.fieldErrors };
      }

      setRows((prev) => {
        const remaining = prev.filter((r) => !savedKeys.has(r.key));
        return remaining.length > 0 ? remaining : [blankRow()];
      });
      setErrors(nextErrors);

      const failed = result.results.length - result.savedCount;
      const added = result.savedCount;
      const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
      setSummary(
        added > 0 && failed > 0
          ? `Added ${plural(added, noun)}. ${plural(failed, "row")} need fixing.`
          : added > 0
            ? `Added ${plural(added, noun)}.`
            : failed > 0
              ? `${plural(failed, "row")} need fixing.`
              : null,
      );
      if (added > 0) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const headerId = (column: Column) => `${gridId}-col-${column.id}`;

  function renderCell(row: Row, rowIndex: number, column: Column, error: string | undefined) {
    const status = applicability(column, row.values);
    if (!status.applies) {
      return (
        <span className="flex h-9 items-center justify-center text-muted-foreground/60" title={status.why}>
          <span aria-hidden="true">—</span>
          <span className="sr-only">
            {column.label}: {status.why}
          </span>
        </span>
      );
    }

    const cellId = `${gridId}-${row.key}-${column.id}`;
    if (column.custom) {
      return column.custom.render({
        id: cellId,
        labelledBy: headerId(column),
        value: row.values[column.id],
        onChange: (value) => update(row.key, column.id, value),
        values: row.values,
      });
    }

    const spec = column.spec!;
    const typed = spec.kind !== "reference" && spec.kind !== "checkbox";
    return (
      <GridCell
        spec={spec}
        id={cellId}
        labelledBy={headerId(column)}
        value={row.values[column.id] as FieldValue}
        onChange={(value) => update(row.key, column.id, value)}
        invalid={error !== undefined}
        options={optionsByField[column.id] ?? []}
        onOptionCreated={(option) =>
          setOptionsByField((prev) => ({
            ...prev,
            [column.id]: [...(prev[column.id] ?? []), option].sort((a, b) => a.label.localeCompare(b.label)),
          }))
        }
        {...(typed
          ? {
              inputRef: nav.register(rowIndex, column.id),
              onKeyDown: nav.handleEnter(rowIndex, column.id, rows.length),
            }
          : {})}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <ColumnPicker
          label="Fields"
          groups={sections.map((section) => ({
            id: section.id,
            title: section.title,
            columns: columnsOf(section).map((c) => ({ id: c.id, label: c.label, locked: c.required })),
          }))}
          visible={new Set(allColumns.filter((c) => !hidden.has(c.id)).map((c) => c.id))}
          onChange={(visible) => setHidden(new Set(allColumns.filter((c) => !visible.has(c.id)).map((c) => c.id)))}
          presets={[
            { label: "Show all", ids: allColumns.map((c) => c.id) },
            { label: "Required only", ids: [] },
          ]}
        />
      </div>

      <div className="border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {shownSections.map(({ section, columns }) => (
                <TableHead
                  key={section.id}
                  colSpan={columns.length}
                  className="h-8 border-l border-border text-foreground first:border-l-0"
                >
                  {section.title}
                </TableHead>
              ))}
              <TableHead rowSpan={2} className="sticky right-0 z-10 w-0 border-l border-border bg-card">
                <span className="sr-only">Row actions</span>
              </TableHead>
            </TableRow>
            <TableRow className="hover:bg-transparent">
              {shownColumns.map((column) => (
                <TableHead
                  key={column.id}
                  id={headerId(column)}
                  className={cn(column.spec?.kind === "checkbox" && "text-center")}
                >
                  {column.label}
                  {column.required ? (
                    <span aria-hidden="true" className="ml-0.5 text-destructive">
                      *
                    </span>
                  ) : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => {
              const rowErrors = errors[row.key];
              // Errors the row cannot show in a cell: on a hidden column, or
              // not about any one column at all (a database constraint).
              const fieldErrors = Object.entries(rowErrors?.fields ?? {});
              const inCells = fieldErrors.filter(([name]) => shownIds.has(name));
              const offscreen = fieldErrors.filter(([name]) => labelOf.has(name) && !shownIds.has(name));
              const showGeneral =
                rowErrors !== undefined && inCells.length === 0 && offscreen.length === 0 && rowErrors.error !== "";
              return (
                <React.Fragment key={row.key}>
                  <TableRow className="hover:bg-transparent">
                    {shownColumns.map((column) => {
                      const error = rowErrors?.fields[column.id];
                      return (
                        <TableCell
                          key={column.id}
                          className={cn(
                            "align-top",
                            column.spec ? CELL_WIDTH[column.spec.kind] : (column.custom?.className ?? "min-w-44"),
                          )}
                        >
                          {renderCell(row, rowIndex, column, error)}
                          {error ? (
                            <p role="alert" className="mt-1 text-xs text-destructive">
                              {error}
                            </p>
                          ) : null}
                        </TableCell>
                      );
                    })}
                    <TableCell className="sticky right-0 z-10 border-l border-border bg-card align-top">
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
                  {offscreen.length > 0 || showGeneral ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={shownColumns.length + 1} className="pt-0">
                        <p role="alert" className="text-xs text-destructive">
                          {showGeneral
                            ? rowErrors.error
                            : `In hidden fields — ${offscreen
                                .map(([name, message]) => `${labelOf.get(name) ?? name}: ${message}`)
                                .join("; ")}`}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </React.Fragment>
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
