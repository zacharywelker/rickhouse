"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
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
import type { BulkSaveResult } from "@/lib/bulk/types";

/**
 * Sticky bar shown once a grid is unlocked and something is either selected
 * (for bulk delete) or edited (for bulk save). Shared by the bottles and
 * labels grids so the delete-confirm convention (DESIGN.md §38) stays one
 * component instead of two copies.
 */
export function GridEditBar({
  itemLabel,
  selectedCount,
  onClearSelection,
  onDeleteSelected,
  dirtyCount,
  onSaveChanges,
}: {
  itemLabel: string;
  selectedCount: number;
  onClearSelection: () => void;
  onDeleteSelected: () => Promise<BulkSaveResult>;
  dirtyCount: number;
  onSaveChanges: () => Promise<BulkSaveResult>;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteSummary, setDeleteSummary] = React.useState<string | null>(null);
  const [deleteFailures, setDeleteFailures] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  async function confirmDelete() {
    setDeleting(true);
    const result = await onDeleteSelected();
    setDeleting(false);
    const failures = result.results.filter((r) => !r.ok).map((r) => r.error);
    setDeleteFailures(failures);
    setDeleteSummary(
      `${result.savedCount} deleted.${failures.length > 0 ? ` ${failures.length} could not be deleted.` : ""}`,
    );
    if (failures.length === 0) setConfirmOpen(false);
  }

  async function saveChanges() {
    setSaving(true);
    await onSaveChanges();
    setSaving(false);
  }

  if (selectedCount === 0 && dirtyCount === 0) return null;

  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-4 py-3 shadow-xl">
      <div className="flex items-center gap-3 text-sm">
        {selectedCount > 0 ? (
          <>
            <span className="font-medium">
              {selectedCount} {itemLabel}
              {selectedCount === 1 ? "" : "s"} selected
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={onClearSelection}>
              Clear
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
              Delete selected
            </Button>
          </>
        ) : null}
      </div>

      {dirtyCount > 0 ? (
        <Button type="button" size="sm" onClick={() => void saveChanges()} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save changes ({dirtyCount})
        </Button>
      ) : null}

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) {
            setDeleteSummary(null);
            setDeleteFailures([]);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedCount} {itemLabel}
              {selectedCount === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4">
            {deleteSummary ? <p className="text-sm">{deleteSummary}</p> : null}
            {deleteFailures.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
                {deleteFailures.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={deleting}>
                Close
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
