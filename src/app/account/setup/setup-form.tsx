"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/passwords";
import { completeSetup, type SetupState } from "./actions";

export function SetupForm({ needsEmail }: { needsEmail: boolean }) {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(completeSetup, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {needsEmail ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          <p className="text-xs text-muted-foreground">For signing in, and for password resets once email is set up.</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          autoFocus={!needsEmail}
        />
        <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN_LENGTH} characters.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {state.error ? (
        <p id="setup-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save and continue"}
      </Button>
    </form>
  );
}
