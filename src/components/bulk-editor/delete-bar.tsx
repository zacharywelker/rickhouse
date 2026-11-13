"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { deleteImpactAction, deleteRowsAction } from "@/app/(app)/bulk-editor/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteSentence, type DeleteIds } from "@/lib/bulk-editor/delete";
import type { DeleteOutcome } from "@/lib/bulk-editor/rows";

/**
 * The bar that appears while rows are selected, in the app's delete-confirm convention (DESIGN.md §38): a
 * sticky bar with the count and a destructive button, and a dialog that names what goes. The numbers in the dialog come
 * from the server when it opens, so they are what will be deleted, not what the sheet guesses.
 */
export function DeleteBar({ count, noun, ids, onClear, onDone }: { count: number; noun: string; ids: DeleteIds; onClear: () => void; onDone: (outcome: DeleteOutcome) => void }) {
  const [open, setOpen] = React.useState(false);
  const [impact, setImpact] = React.useState<Awaited<ReturnType<typeof deleteImpactAction>> | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [failures, setFailures] = React.useState<string[]>([]);
  const [summary, setSummary] = React.useState<string | null>(null);

  if (count === 0) return null;

  async function openDialog() {
    setImpact(null);
    setFailures([]);
    setSummary(null);
    setOpen(true);
    setImpact(await deleteImpactAction(ids));
  }

  async function confirm() {
    setDeleting(true);
    try {
      const outcome = await deleteRowsAction(ids);
      onDone(outcome);
      if (outcome.failed.length === 0) setOpen(false);
      else {
        setFailures(outcome.failed.map((f) => f.error));
        setSummary(`${outcome.deletedLabels + outcome.deletedBottles} deleted. ${outcome.failed.length} could not be deleted.`);
      }
    } catch {
      setFailures(["Could not reach the server. Nothing was deleted."]);
    } finally {
      setDeleting(false);
    }
  }

  const sentence = impact ? deleteSentence(ids, impact) : null;
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 border border-border bg-card px-4 py-3 shadow-xl">
      <span className="text-sm font-medium">
        {count} {noun}
        {count === 1 ? "" : "s"} selected
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
      <Button type="button" variant="destructive" size="sm" onClick={() => void openDialog()}>
        Delete selected
      </Button>
      <Dialog open={open} onOpenChange={(next) => !deleting && setOpen(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{sentence?.title ?? "Delete…"}</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4 text-sm">
            {sentence ? <p>{sentence.body}</p> : <p className="text-muted-foreground">Counting what goes with them…</p>}
            {ids.labelIds.length > 0 && sentence ? <p className="mt-2 text-muted-foreground">Everything recorded against those bottles goes too: photos, tastings and tags.</p> : null}
            {summary ? <p className="mt-3">{summary}</p> : null}
            {failures.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">
                {failures.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={deleting}>
                {summary ? "Close" : "Cancel"}
              </Button>
            </DialogClose>
            {summary === null ? (
              <Button type="button" variant="destructive" onClick={() => void confirm()} disabled={deleting || impact === null}>
                {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
                Delete
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
