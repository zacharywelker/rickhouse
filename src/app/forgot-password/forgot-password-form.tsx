"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, isRateLimited } from "@/lib/auth/client";

export function ForgotPasswordForm() {
  const [status, setStatus] = useState<"idle" | "sent" | "limited" | "failed">("idle");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!email) return;
    setPending(true);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    // Same answer whether or not the address has an account.
    setStatus(!error ? "sent" : isRateLimited(error) ? "limited" : "failed");
  }

  if (status === "sent") {
    return (
      <>
        <p role="status" className="text-sm">
          If that address belongs to an account here, a reset link is on its way. It works for 24 hours.
        </p>
        <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus required />
      </div>
      {status === "limited" ? (
        <p role="alert" className="text-sm text-destructive">
          Too many requests. Try again in a few minutes.
        </p>
      ) : status === "failed" ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&rsquo;t send the email. Try again, or ask an admin.
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <Link href="/login" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
