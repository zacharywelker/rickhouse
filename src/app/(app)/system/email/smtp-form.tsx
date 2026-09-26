"use client";

import { useActionState, useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IDLE_RESULT, type ActionResult } from "@/lib/admin/types";
import type { SmtpSummary } from "@/lib/email/settings";
import { removeSmtpAction, saveSmtpAction, sendTestEmailAction } from "./actions";

function Message({ result }: { result: ActionResult | null }) {
  if (!result || (result.ok && !result.message)) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm" : "text-sm text-destructive"}>
      {result.ok ? result.message : result.error}
    </p>
  );
}

export function SmtpForm({ current }: { current: SmtpSummary | null }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(saveSmtpAction, IDLE_RESULT);
  const [other, setOther] = useState<ActionResult | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="smtp-host">SMTP server</Label>
          <Input id="smtp-host" name="host" defaultValue={current?.host ?? ""} placeholder="smtp.fastmail.com" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="smtp-port">Port</Label>
          <Input id="smtp-port" name="port" type="number" defaultValue={current?.port ?? 587} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="smtp-username">Username</Label>
          <Input id="smtp-username" name="username" defaultValue={current?.username ?? ""} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="smtp-password">Password</Label>
          <Input
            id="smtp-password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder={current?.hasPassword ? "Saved — leave blank to keep" : ""}
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="smtp-from">From</Label>
          <Input
            id="smtp-from"
            name="fromAddress"
            defaultValue={current?.fromAddress ?? ""}
            placeholder="Rickhouse <rickhouse@example.com>"
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="secure" defaultChecked={current?.secure ?? false} />
          Use TLS from the start (usually port 465). Leave off for 587, which upgrades with STARTTLS.
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {current ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => startTransition(async () => setOther(await sendTestEmailAction()))}
              >
                Send me a test email
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => startTransition(async () => setOther(await removeSmtpAction()))}
              >
                Turn email off
              </Button>
            </>
          ) : null}
        </div>
      </form>
      <Message result={state} />
      <Message result={other} />
    </div>
  );
}
