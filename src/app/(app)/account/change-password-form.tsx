"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, isRateLimited } from "@/lib/auth/client";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/auth/passwords";

/**
 * Through Better Auth's HTTP endpoint, not a server action, so guesses at
 * the current password are rate limited like sign-in.
 */
export function ChangePasswordForm() {
  const [status, setStatus] = useState<{ kind: "error" | "done"; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    const problem = passwordProblem(newPassword);
    if (problem) return setStatus({ kind: "error", message: problem });
    if (newPassword !== confirm) return setStatus({ kind: "error", message: "The two new passwords don't match." });

    setPending(true);
    setStatus(null);
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    setPending(false);

    if (!error) {
      formElement.reset();
      setStatus({ kind: "done", message: "Password changed. Other devices have been signed out." });
    } else if (isRateLimited(error)) {
      setStatus({ kind: "error", message: "Too many tries. Give it a minute and try again." });
    } else if (error.code === "INVALID_PASSWORD") {
      setStatus({ kind: "error", message: "Your current password is not right." });
    } else {
      setStatus({ kind: "error", message: error.message ?? "Could not change the password." });
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
        <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN_LENGTH} characters.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {status ? (
        <p role={status.kind === "error" ? "alert" : "status"} className={status.kind === "error" ? "text-sm text-destructive" : "text-sm"}>
          {status.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
