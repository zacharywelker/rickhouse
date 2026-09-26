"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, isRateLimited } from "@/lib/auth/client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const login = String(form.get("login") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!login || !password) {
      setError("Enter your username or email, and your password.");
      return;
    }

    setPending(true);
    setError(null);
    const { error: failure } = login.includes("@")
      ? await authClient.signIn.email({ email: login, password })
      : await authClient.signIn.username({ username: login, password });

    if (!failure) {
      // A full navigation, so middleware sees the new cookie. `next` was
      // checked to be a same-origin path by the page.
      window.location.assign(next);
      return;
    }

    setPending(false);
    if (failure.code === "BANNED_USER") {
      router.push("/cut-off");
    } else if (isRateLimited(failure)) {
      setError("Too many tries. Give it a minute and try again.");
    } else {
      setError("That username or password is not right.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="login">Username or email</Label>
        <Input id="login" name="login" type="text" autoComplete="username" autoCapitalize="none" autoFocus required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby={error ? "login-error" : undefined}
        />
      </div>
      {error ? (
        <p id="login-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Checking…" : "Unlock"}
      </Button>
    </form>
  );
}
