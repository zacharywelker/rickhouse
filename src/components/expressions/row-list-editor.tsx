"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ProofAbvFields } from "./proof-abv-field";

export type RowColumn = {
  key: string;
  /** "proofAbv" renders the app's linked Proof / ABV pair for this key. */
  kind?: "text" | "proofAbv";
  label: string;
  placeholder?: string;
  inputMode?: "numeric" | "decimal" | "text";
  /** Native validation, so the browser stops a bad value before it is serialised. */
  pattern?: string;
  title?: string;
  /** Tailwind width for the column on wide screens; the name column grows. */
  className?: string;
};

type Row = Record<string, string> & { _id: string };

/**
 * A short list of rows behind a "+" button: nothing but the button until a row
 * is added, then one labelled box per column. Submits as one hidden field,
 * serialised by `toText`, so the server reads exactly what it read from the
 * old textarea.
 */
export function RowListEditor({
  name,
  idPrefix,
  addLabel,
  columns,
  initialRows,
  toText,
  error,
  removeWarning,
}: {
  name: string;
  idPrefix: string;
  addLabel: string;
  columns: RowColumn[];
  initialRows: Array<Record<string, string>>;
  toText: (rows: Array<Record<string, string>>) => string;
  error?: string;
  /** What removing this row would lose, asked about first; null removes it at once. */
  removeWarning?: (row: Record<string, string>) => string | null;
}) {
  // Loaded rows are numbered by position, so server and client render the
  // same ids; added rows continue the count.
  const [rows, setRows] = React.useState<Row[]>(() => initialRows.map((row, i) => ({ ...row, _id: String(i) })));
  const nextId = React.useRef(initialRows.length);
  // Only a row added with the button takes focus, not the ones loaded with the page.
  const [addedId, setAddedId] = React.useState<string | null>(null);

  const [confirming, setConfirming] = React.useState<{ id: string; message: string } | null>(null);
  const remove = (id: string) => setRows((prev) => prev.filter((r) => r._id !== id));

  const set = (id: string, key: string, value: string) =>
    setRows((prev) => prev.map((row) => (row._id === id ? { ...row, [key]: value } : row)));

  // Rows with no name are left out rather than failing the whole save.
  const filled = rows.filter((row) => (row[columns[0]!.key] ?? "").trim() !== "");

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={toText(filled)} />
      {rows.map((row, index) => (
        <div key={row._id} className={cn("flex items-end gap-2", index > 0 && "border-t border-border pt-3 sm:border-0 sm:pt-0")}>
          <div className="grid flex-1 grid-cols-2 gap-2 sm:flex sm:items-end">
            {columns.map((column, c) => {
              const id = `${idPrefix}-${row._id}-${column.key}`;
              if (column.kind === "proofAbv") {
                return (
                  <ProofAbvFields
                    key={column.key}
                    idPrefix={`${idPrefix}-${row._id}`}
                    value={row[column.key] ?? ""}
                    onChange={(next) => set(row._id, column.key, String(next ?? ""))}
                    name={null}
                    hint={false}
                    className={cn("gap-1", column.className)}
                    labelClassName={cn("text-xs font-normal text-muted-foreground", index > 0 && "sm:sr-only")}
                  />
                );
              }
              return (
                <div key={column.key} className={cn("flex flex-col gap-1", c === 0 ? "col-span-2 sm:flex-1" : column.className)}>
                  {/* Labels on the first row only; later rows line up beneath them. */}
                  <label htmlFor={id} className={cn("text-xs text-muted-foreground", index > 0 && "sm:sr-only")}>
                    {column.label}
                  </label>
                  <Input
                    id={id}
                    autoFocus={c === 0 && row._id === addedId}
                    value={row[column.key] ?? ""}
                    onChange={(event) => set(row._id, column.key, event.target.value)}
                    // Examples on the first row only; repeated, they read as values.
                    placeholder={index === 0 ? column.placeholder : undefined}
                    inputMode={column.inputMode}
                    pattern={column.pattern}
                    title={column.title}
                    aria-invalid={error ? true : undefined}
                  />
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="px-2 text-muted-foreground"
            aria-label={`Remove ${row[columns[0]!.key] || "this row"}`}
            onClick={() => {
              const message = removeWarning?.(row) ?? null;
              if (message) setConfirming({ id: row._id, message });
              else remove(row._id);
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          onClick={() => {
            const row: Row = { _id: String(nextId.current++) };
            setRows((prev) => [...prev, row]);
            setAddedId(row._id);
          }}
        >
          <Plus className="size-4" />
          {addLabel}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Dialog open={confirming !== null} onOpenChange={(open) => (open ? null : setConfirming(null))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this?</DialogTitle>
            <DialogDescription>{confirming?.message} Nothing changes until you save.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Keep it
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (confirming) remove(confirming.id);
                setConfirming(null);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
