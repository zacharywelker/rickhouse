"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

type Provider = { providerId: string; name: string };
type Linked = { providerId: string; accountId: string };

/**
 * "Linked SSO": the only way a single sign-on identity gets attached to an
 * account. You prove you own both — you're signed in here, and you sign in
 * there — so nothing is ever matched up by email.
 */
export function LinkedSignIns({ providers, linked }: { providers: Provider[]; linked: Linked[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (providers.length === 0) {
    return <p className="text-sm text-muted-foreground">No single sign-on providers are set up here yet.</p>;
  }

  function link(provider: string) {
    startTransition(async () => {
      setError(null);
      const { error: failure } = await authClient.linkSocial({
        provider,
        callbackURL: "/account",
        errorCallbackURL: "/account?linkError=1",
      });
      if (failure) setError("Couldn't start linking. Try again.");
    });
  }

  function unlink(entry: Linked) {
    startTransition(async () => {
      setError(null);
      const { error: failure } = await authClient.unlinkAccount({ accountId: entry.accountId });
      if (failure) setError("Couldn't unlink it.");
      else router.refresh();
    });
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {providers.map((provider) => {
          const entry = linked.find((l) => l.providerId === provider.providerId);
          return (
            <li key={provider.providerId} className="flex items-center justify-between py-2 text-sm">
              <span>
                {provider.name}
                <span className="ml-2 text-xs text-muted-foreground">{entry ? "Linked" : "Not linked"}</span>
              </span>
              {entry ? (
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => unlink(entry)}>
                  Unlink
                </Button>
              ) : (
                <Button type="button" size="sm" disabled={pending} onClick={() => link(provider.providerId)}>
                  Link
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
