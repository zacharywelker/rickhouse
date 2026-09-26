"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, isRateLimited } from "@/lib/auth/client";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/auth/passwords";

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password") ?? "");
    const problem = passwordProblem(newPassword);
    if (problem) return setError(problem);
    if (newPassword !== String(form.get("confirm") ?? "")) return setError("The two passwords don't match.");

    setPending(true);
    setError(null);
    const { error: failure } = await authClient.resetPassword({ newPassword, token });
    if (!failure) {
      window.location.assign("/login");
      return;
    }
    setPending(false);
    setError(
      isRateLimited(failure)
        ? "Too many tries. Give it a minute."
        : "This link has expired or was already used. Ask for a new one.",
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" autoFocus required />
        <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN_LENGTH} characters.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
