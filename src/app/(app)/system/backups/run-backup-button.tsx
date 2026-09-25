"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { IDLE_RESULT, type ActionResult } from "@/lib/admin/types";
import { runBackupNowAction } from "./actions";

function TriggerButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? "Backing up…" : "Run backup now"}
    </Button>
  );
}

export function RunBackupButton() {
  const [state, formAction] = useActionState<ActionResult, FormData>(runBackupNowAction, IDLE_RESULT);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <TriggerButton />
      {!state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : state.message ? (
        <p className="text-sm text-muted-foreground">{state.message}</p>
      ) : null}
    </form>
  );
}
