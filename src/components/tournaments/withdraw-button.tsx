"use client";

import * as React from "react";
import { Loader2, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BracketActions } from "./use-bracket-actions";

/** A bottle ran out: Withdraw takes it out of its flight after a confirmation. Results already recorded stay. */
export function WithdrawButton({ entryId, name, actions }: { entryId: number; name: string; actions: BracketActions }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="ghost" className="size-11 p-0" aria-label={`Withdraw ${name}`} title="Withdraw" onClick={() => {
          actions.clearError();
          setOpen(true);
        }}>
        <UserMinus className="size-4" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Withdraw {name}?</DialogTitle>
            <DialogDescription>It leaves its flight; results already recorded stay.</DialogDescription>
          </DialogHeader>
          {actions.error ? (
            <p role="alert" className="text-sm text-destructive">
              {actions.error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Keep it in
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" className="min-h-11" disabled={actions.pending} onClick={() => actions.withdraw(entryId, () => setOpen(false))}>
              {actions.pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
