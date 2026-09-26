"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, isRateLimited } from "@/lib/auth/client";

type Method = "app" | "backup" | "email";

const LABELS: Record<Method, string> = {
  app: "Code from your authenticator app",
  backup: "One of your backup codes",
  email: "Code from the email we just sent",
};

export function TwoFactorForm({ next, canEmail }: { next: string; canEmail: boolean }) {
  const [method, setMethod] = useState<Method>("app");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function switchTo(target: Method) {
    setError(null);
    setMethod(target);
    if (target === "email") {
      const { error: failure } = await authClient.twoFactor.sendOtp();
      if (failure) setError(isRateLimited(failure) ? "Too many tries. Give it a minute." : "Couldn't send the email.");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    if (!code) return setError("Enter the code.");
    setPending(true);
    setError(null);
    const { error: failure } =
      method === "app"
        ? await authClient.twoFactor.verifyTotp({ code })
        : method === "backup"
          ? await authClient.twoFactor.verifyBackupCode({ code })
          : await authClient.twoFactor.verifyOtp({ code });
    if (!failure) {
      window.location.assign(next);
      return;
    }
    setPending(false);
    if (isRateLimited(failure)) setError("Too many tries. Give it a minute and try again.");
    else if (failure.status === 401 && /session|cookie|expired/i.test(failure.message ?? "")) {
      setError("That took too long. Sign in again.");
    } else setError("That code isn't right.");
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">{LABELS[method]}</Label>
          <Input
            key={method}
            id="code"
            name="code"
            inputMode={method === "backup" ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoFocus
            required
          />
        </div>
        {error ? (
          <p id="two-factor-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Checking…" : "Verify"}
        </Button>
      </form>
      <div className="flex flex-col items-start gap-1 border-t border-border pt-3 text-sm">
        {method !== "app" ? (
          <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => void switchTo("app")}>
            Use my authenticator app
          </button>
        ) : null}
        {method !== "backup" ? (
          <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => void switchTo("backup")}>
            Use a backup code
          </button>
        ) : null}
        {canEmail && method !== "email" ? (
          <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => void switchTo("email")}>
            Email me a code
          </button>
        ) : null}
        <Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">
          Start over
        </Link>
      </div>
    </div>
  );
}
