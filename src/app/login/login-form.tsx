"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, isRateLimited } from "@/lib/auth/client";

type Props = {
  next: string;
  sso: Array<{ providerId: string; name: string }>;
  passkeys: boolean;
  canReset: boolean;
  ssoError: string | null;
};

export function LoginForm({ next, sso, passkeys, canReset, ssoError }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(ssoError);
  const [pending, setPending] = useState(false);

  function explain(failure: { code?: string; status?: number }) {
    setPending(false);
    if (failure.code === "BANNED_USER") router.push("/cut-off");
    else if (isRateLimited(failure)) setError("Too many tries. Give it a minute and try again.");
    else setError("That username or password is not right.");
  }

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
    const { data, error: failure } = login.includes("@")
      ? await authClient.signIn.email({ email: login, password })
      : await authClient.signIn.username({ username: login, password });

    if (failure) return explain(failure);
    // Password was right; two-factor accounts still owe a code.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      window.location.assign(`/login/two-factor?next=${encodeURIComponent(next)}`);
      return;
    }
    // A full navigation, so middleware sees the new cookie. `next` was
    // checked to be a same-origin path by the page.
    window.location.assign(next);
  }

  async function withPasskey() {
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.signIn.passkey();
    if (failure) {
      setPending(false);
      setError(isRateLimited(failure) ? "Too many tries. Give it a minute and try again." : "That passkey didn't work.");
      return;
    }
    window.location.assign(next);
  }

  async function withSso(provider: string) {
    setPending(true);
    setError(null);
    // Redirects away to the provider and back to `next` (or /login?error=…).
    const { error: failure } = await authClient.signIn.social({
      provider,
      callbackURL: next,
      errorCallbackURL: `/login?next=${encodeURIComponent(next)}`,
    });
    if (failure) {
      setPending(false);
      setError("Single sign-on didn't start. Try again, or sign in with your password.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="login">Username or email</Label>
          <Input
            id="login"
            name="login"
            type="text"
            autoComplete="username webauthn"
            autoCapitalize="none"
            autoFocus
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            {canReset ? (
              <Link href="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                Forgot password?
              </Link>
            ) : null}
          </div>
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

      {passkeys || sso.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {passkeys ? (
            <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={() => void withPasskey()}>
              <KeyRound className="size-4" />
              Sign in with a passkey
            </Button>
          ) : null}
          {sso.map((provider) => (
            <Button
              key={provider.providerId}
              type="button"
              variant="outline"
              className="w-full"
              disabled={pending}
              onClick={() => void withSso(provider.providerId)}
            >
              Sign in with {provider.name}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
