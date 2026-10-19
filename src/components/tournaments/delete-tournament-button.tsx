"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { deleteTournamentAction } from "@/app/(app)/tournaments/actions";

/** Delete with a confirm dialog (DESIGN.md: destructive actions). A running tournament is not offered: the server refuses it with a 409. */
export function DeleteTournamentButton({ tournamentId, name }: { tournamentId: number; name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTournamentAction(tournamentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        aria-label={`Delete ${name}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Delete
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this tournament?</DialogTitle>
            <DialogDescription>
              This cannot be undone. Its flights and results go with it, and the bottles in it stay in your collection.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4">
            <p className="font-medium">{name}</p>
            {error ? (
              <p role="alert" className="mt-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
