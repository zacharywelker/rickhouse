"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
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
import { deleteExpressionAction } from "@/app/(app)/expressions/actions";

/** Same confirm-dialog convention as group delete (DESIGN.md §38: Destructive Actions). */
export function DeleteExpressionButton({ expressionId, name }: { expressionId: number; name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function confirmDelete() {
    setPending(true);
    setError(null);
    const result = await deleteExpressionAction(expressionId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.push("/expressions");
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
        Delete
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this label?</DialogTitle>
            <DialogDescription>
              This cannot be undone. A label with bottles still on it can&apos;t be deleted — remove or reassign those bottles
              first.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4">
            <p className="font-medium">{name}</p>
            {error ? (
              <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Keep it
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
