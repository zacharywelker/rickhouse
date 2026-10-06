"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteReleaseAction, saveReleaseAction } from "@/app/(app)/expressions/release-actions";
import { IDLE_RESULT, type ActionResult } from "@/lib/admin/types";
import type { ReleaseRow } from "@/lib/releases";
import { ProofAbvFields } from "./proof-abv-field";
import { AgeFields } from "./age-fields";

/**
 * A release's own page form: the same name, year, proof, age and MSRP as its
 * row on the label form (one stored row behind both), plus its notes.
 */
export function ReleaseForm({ releaseId, initial, notes }: { releaseId: number; initial: ReleaseRow; notes: string }) {
  const router = useRouter();
  const [values, setValues] = React.useState(initial);
  const set = (key: keyof ReleaseRow, value: string) => setValues((prev) => ({ ...prev, [key]: value }));
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    saveReleaseAction.bind(null, releaseId),
    IDLE_RESULT,
  );

  React.useEffect(() => {
    if (state.ok && state.message) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="release-name">Name</Label>
          <Input id="release-name" name="name" required value={values.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="release-year">Year</Label>
          <Input
            id="release-year"
            name="year"
            inputMode="numeric"
            pattern="\d{4}"
            title="A four-digit year"
            value={values.year}
            onChange={(e) => set("year", e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <ProofAbvFields idPrefix="release" value={values.proof} onChange={(next) => set("proof", String(next ?? ""))} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="release-msrp">MSRP</Label>
          <Input
            id="release-msrp"
            name="msrp"
            inputMode="decimal"
            pattern="\$?\d+(\.\d{1,2})?"
            title="A price, like 99.99"
            value={values.msrp}
            onChange={(e) => set("msrp", e.target.value)}
          />
        </div>
      </div>
      <AgeFields
        idPrefix="release"
        values={{ ageYears: values.ageYears, ageMonths: values.ageMonths, ageDays: values.ageDays }}
        onChange={(name, next) => set(name, String(next ?? ""))}
        errors={{}}
        help="Leave blank to use the label's age."
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="release-notes">Notes</Label>
        <Textarea
          id="release-notes"
          name="notes"
          rows={4}
          defaultValue={notes}
          placeholder="What the distillery says about this one, what sets it apart"
        />
      </div>
      {!state.ok && state.error ? (
        <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.message ? <p className="text-sm text-muted-foreground">{state.message}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save release
        </Button>
      </div>
    </form>
  );
}

/** Delete, with what it would affect spelled out first (DESIGN.md §38). */
export function DeleteReleaseButton({
  releaseId,
  expressionId,
  warning,
}: {
  releaseId: number;
  expressionId: number;
  warning: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function confirmDelete() {
    setPending(true);
    setError(null);
    const result = await deleteReleaseAction(releaseId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.push(`/expressions/${expressionId}`);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this release?</DialogTitle>
            <DialogDescription>{warning ?? "Nothing else uses it. This cannot be undone."}</DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="mx-6 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Keep it
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
