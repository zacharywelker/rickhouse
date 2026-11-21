"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { deleteImpactAction, deleteRowsAction } from "@/app/(wide)/bulk-editor/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteSentence, type DeleteIds } from "@/lib/bulk-editor/delete";
import type { DeleteOutcome } from "@/lib/bulk-editor/rows";
import { cn } from "@/lib/utils";

/**
 * The delete confirmation, in the app's delete-confirm convention (DESIGN.md §38): a dialog that names what goes. The
 * numbers in it come from the server when it opens, so they are what will be deleted, not what the sheet guesses. It is
 * used by the bar below (rows ticked) and by the row menu (one label or one bottle); `ids` is read once, as it opens.
 */
export function DeleteDialog({ open, onOpenChange, ids, onDone, onCloseAutoFocus }: { open: boolean; onOpenChange: (open: boolean) => void; ids: DeleteIds; onDone: (outcome: DeleteOutcome) => void; /** Where focus goes when it closes: a dialog with no trigger has nowhere to return it. */ onCloseAutoFocus?: (event: Event) => void }) {
  const [asked, setAsked] = React.useState<DeleteIds>(ids);
  const [impact, setImpact] = React.useState<Awaited<ReturnType<typeof deleteImpactAction>> | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [failures, setFailures] = React.useState<string[]>([]);
  const [summary, setSummary] = React.useState<string | null>(null);
  const latestIds = React.useRef(ids);
  React.useEffect(() => {
    latestIds.current = ids;
  });

  // Declared after the one above, so `latestIds` is current when this runs on opening.
  React.useEffect(() => {
    if (!open) return;
    const now = latestIds.current;
    setAsked(now);
    setImpact(null);
    setFailures([]);
    setSummary(null);
    let stale = false;
    void deleteImpactAction(now).then((result) => {
      if (!stale) setImpact(result);
    });
    return () => {
      stale = true;
    };
  }, [open]);

  async function confirm() {
    setDeleting(true);
    try {
      const outcome = await deleteRowsAction(asked);
      onDone(outcome);
      if (outcome.failed.length === 0) onOpenChange(false);
      else {
        setFailures([...new Set(outcome.failed.map((f) => f.error))]);
        setSummary(`${outcome.deletedLabels + outcome.deletedBottles} deleted. ${outcome.failed.length} could not be deleted.`);
      }
    } catch {
      setFailures(["Could not reach the server. Nothing was deleted."]);
    } finally {
      setDeleting(false);
    }
  }

  const sentence = impact ? deleteSentence(asked, impact) : null;
  return (
    <Dialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <DialogContent className="max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{sentence?.title ?? "Delete…"}</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4 text-sm">
          {sentence ? <p>{sentence.body}</p> : <p className="text-muted-foreground">Counting what goes with them…</p>}
          {asked.labelIds.length > 0 && sentence ? <p className="mt-2 text-muted-foreground">Everything recorded against those bottles goes too: photos, tastings and tags.</p> : null}
          {impact && impact.excluded > 0 ? (
            <p className="mt-2">{impact.excluded} selected {impact.excluded === 1 ? "row exceeds" : "rows exceed"} the deletion limit and will stay selected.</p>
          ) : null}
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
  );
}

/**
 * The bar that appears while rows are selected: a sticky bar with the count and a destructive button, which opens the
 * delete dialog.
 */
export function DeleteBar({ count, noun, ids, onClear, onDone, className }: { count: number; noun: string; ids: DeleteIds; onClear: () => void; onDone: (outcome: DeleteOutcome) => void; /** Where it sits, when not in the page flow. */ className?: string }) {
  const [open, setOpen] = React.useState(false);

  if (count === 0) return null;

  return (
    <div className={cn("sticky bottom-4 z-10 flex flex-wrap items-center gap-3 border border-border bg-card px-4 py-3 shadow-xl", className)}>
      <span className="text-sm font-medium">
        {count} {noun}
        {count === 1 ? "" : "s"} selected
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Delete selected
      </Button>
      <DeleteDialog open={open} onOpenChange={setOpen} ids={ids} onDone={onDone} />
    </div>
  );
}
