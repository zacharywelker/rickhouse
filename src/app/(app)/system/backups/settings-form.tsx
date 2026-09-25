"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IDLE_RESULT, type ActionResult } from "@/lib/admin/types";
import { saveBackupSettingsAction } from "./actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function BackupSettingsForm({
  enabled,
  intervalHours,
  keep,
}: {
  enabled: boolean;
  intervalHours: number;
  keep: number;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(saveBackupSettingsAction, IDLE_RESULT);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Checkbox id="enabled" name="enabled" defaultChecked={enabled} />
        <Label htmlFor="enabled">Back up automatically</Label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="intervalHours">Hours between backups</Label>
          <Input
            id="intervalHours"
            name="intervalHours"
            type="number"
            min={1}
            step={1}
            defaultValue={intervalHours}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="keep">Backups to keep</Label>
          <Input id="keep" name="keep" type="number" min={0} step={1} defaultValue={keep} required />
        </div>
      </div>

      {!state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : state.message ? (
        <p className="text-sm text-muted-foreground">{state.message}</p>
      ) : null}

      <div>
        <SaveButton />
      </div>
    </form>
  );
}
