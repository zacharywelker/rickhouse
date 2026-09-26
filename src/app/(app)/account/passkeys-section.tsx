"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

type Passkey = { id: number; name: string | null; createdAt: string | null };

export function PasskeysSection({ passkeys, available }: { passkeys: Passkey[]; available: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!available) {
    return (
      <p className="max-w-xl text-sm text-muted-foreground">
        Passkeys are tied to a web address, so they need <code>APP_URL</code> set, and HTTPS. Ask whoever runs this
        Rickhouse.
      </p>
    );
  }

  function add() {
    startTransition(async () => {
      setError(null);
      const { error: failure } = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
      if (failure) setError(failure.message ?? "That didn't work. Passkeys need HTTPS on the address in APP_URL.");
      else {
        setName("");
        router.refresh();
      }
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      setError(null);
      const { error: failure } = await authClient.passkey.deletePasskey({ id: String(id) });
      if (failure) setError("Couldn't remove it.");
      else router.refresh();
    });
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      {passkeys.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet. A passkey signs you in with your fingerprint, face or device PIN.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {passkeys.map((key) => (
            <li key={key.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {key.name || "Passkey"}
                {key.createdAt ? (
                  <span className="ml-2 text-xs text-muted-foreground">added {key.createdAt.slice(0, 10)}</span>
                ) : null}
              </span>
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${key.name || "passkey"}`} disabled={pending} onClick={() => remove(key.id)}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Passkey name"
          placeholder="Name it, e.g. My phone"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <Button type="button" onClick={add} disabled={pending}>
          <KeyRound className="size-4" />
          Add a passkey
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
