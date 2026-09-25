"use client";

import * as React from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { deleteResourceAction } from "@/app/(app)/admin/actions";
import type { AdminRow, CellValue, ColumnSpec, FieldSpec, Option } from "@/lib/admin/types";
import { ResourceForm } from "./resource-form";

type Props = {
  resourceKey: string;
  label: string;
  singular: string;
  fields: FieldSpec[];
  columns: ColumnSpec[];
  rows: AdminRow[];
  options: Record<string, Option[]>;
};

function Cell({ value }: { value: CellValue }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === "boolean") {
    return value ? <Badge className="border-primary/40 text-primary">Yes</Badge> : <span className="text-muted-foreground">No</span>;
  }
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="size-3.5 rounded-full border border-border" style={{ backgroundColor: value }} />
        <span className="tabular-nums">{value}</span>
      </span>
    );
  }
  return <>{value}</>;
}

export function ResourceView({
  resourceKey,
  label,
  singular,
  fields,
  columns,
  rows,
  options,
}: Props) {
  // `null` means the create form; a row means edit. `undefined` means closed.
  const [editing, setEditing] = React.useState<AdminRow | null | undefined>(undefined);
  const [deleting, setDeleting] = React.useState<AdminRow | null>(null);
  const [deletePending, setDeletePending] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const close = React.useCallback(() => setEditing(undefined), []);

  async function confirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    setDeleteError(null);
    const result = await deleteResourceAction(resourceKey, deleting.id);
    setDeletePending(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setDeleting(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl text-accent">{label}</h1>
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus className="size-4" />
          Add {singular.toLowerCase()}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <p className="text-lg">No {label.toLowerCase()} yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add the first one now, or let it appear here the moment you create one inline from a bottle form.
          </p>
          <Button className="mt-4" onClick={() => setEditing(null)}>
            <Plus className="size-4" />
            Add {singular.toLowerCase()}
          </Button>
        </div>
      ) : (
        <div className="border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    className={cn(column.numeric && "text-right", column.secondary && "hidden sm:table-cell")}
                  >
                    {column.label}
                  </TableHead>
                ))}
                <TableHead className="w-24 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((column, index) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        column.numeric && "text-right tabular-nums",
                        column.secondary && "hidden sm:table-cell",
                        index === 0 && "font-medium",
                      )}
                    >
                      <Cell value={row.cells[column.key] ?? null} />
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(row)} aria-label={`Edit ${String(row.cells.name ?? "")}`}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(row);
                        }}
                        aria-label={`Delete ${String(row.cells.name ?? "")}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing !== undefined} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${singular.toLowerCase()}` : `Add ${singular.toLowerCase()}`}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Changes apply everywhere this is linked."
                : `New ${singular.toLowerCase()}s are available immediately from every picker.`}
            </DialogDescription>
          </DialogHeader>
          {editing !== undefined ? (
            <ResourceForm
              // Remounts between rows so the form state starts from the right row.
              key={editing ? `edit-${editing.id}` : "create"}
              resourceKey={resourceKey}
              singular={singular}
              fields={fields}
              options={options}
              row={editing}
              onSaved={close}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this {singular.toLowerCase()}?</DialogTitle>
            <DialogDescription>
              {deleting?.deleteBlockedBy
                ? `${deleting.deleteBlockedBy}. Deleting is blocked until those are pointed somewhere else.`
                : "This cannot be undone. Anything linked to it keeps existing, but loses the link."}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4">
            <p className="font-medium">{String(deleting?.cells.name ?? "")}</p>
            {deleteError ? (
              <p role="alert" className="mt-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {deleteError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={deletePending}>
                Keep it
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={deletePending || deleting?.deleteBlockedBy !== undefined}
            >
              {deletePending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
