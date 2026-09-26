"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IDLE_RESULT, type ActionResult } from "@/lib/admin/types";
import type { SsoProviderRow } from "@/lib/sso/providers";
import { createSsoAction, deleteSsoAction, updateSsoAction } from "./actions";

export function ProviderForm({ provider, callbackBase }: { provider: SsoProviderRow | null; callbackBase: string }) {
  const action = provider ? updateSsoAction.bind(null, provider.id) : createSsoAction;
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, IDLE_RESULT);
  const [kind, setKind] = useState(provider?.kind ?? "oidc");
  const [providerId, setProviderId] = useState(provider?.providerId ?? "");
  const [removed, setRemoved] = useState<ActionResult | null>(null);
  const [busy, startTransition] = useTransition();
  const key = provider?.providerId ?? `new-${state.ok ? state.message : ""}`;

  return (
    <form key={key} action={formAction} className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${key}-kind`}>Type</Label>
        <select
          id={`${key}-kind`}
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="flex h-10 w-full border border-input bg-card px-3 py-2 text-sm text-foreground"
        >
          <option value="oidc">OpenID Connect (Pocket ID, Authentik, Authelia…)</option>
          <option value="google">Google</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${key}-name`}>Button name</Label>
        <Input id={`${key}-name`} name="name" defaultValue={provider?.name ?? ""} placeholder="Pocket ID" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${key}-id`}>ID</Label>
        <Input
          id={`${key}-id`}
          name="providerId"
          value={providerId}
          onChange={(e) => setProviderId(e.target.value.toLowerCase())}
          disabled={provider !== null}
          placeholder="pocket-id"
          required
        />
        <p className="text-xs text-muted-foreground">Part of the callback URL, so it can&rsquo;t change later.</p>
      </div>
      {kind === "oidc" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${key}-discovery`}>Issuer URL</Label>
          <Input
            id={`${key}-discovery`}
            name="discoveryUrl"
            defaultValue={provider?.discoveryUrl ?? ""}
            placeholder="https://id.example.com"
            required
          />
        </div>
      ) : (
        <input type="hidden" name="discoveryUrl" value="" />
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${key}-client`}>Client ID</Label>
        <Input id={`${key}-client`} name="clientId" defaultValue={provider?.clientId ?? ""} autoComplete="off" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${key}-secret`}>Client secret</Label>
        <Input
          id={`${key}-secret`}
          name="clientSecret"
          type="password"
          autoComplete="new-password"
          placeholder={provider ? "Saved — leave blank to keep" : ""}
        />
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Callback URL to register with the provider:{" "}
        <code className="select-all text-foreground">
          {callbackBase}/api/auth/callback/{providerId || "<id>"}
        </code>
      </p>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="enabled" defaultChecked={provider?.enabled ?? true} />
        Show it on the sign-in page and in Account settings
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : provider ? "Save" : "Add provider"}
        </Button>
        {provider ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => startTransition(async () => setRemoved(await deleteSsoAction(provider.id)))}
          >
            Remove
          </Button>
        ) : null}
      </div>
      {[state, removed].map((result, index) =>
        result && !(result.ok && !result.message) ? (
          <p
            key={index}
            role={result.ok ? "status" : "alert"}
            className={result.ok ? "text-sm sm:col-span-2" : "text-sm text-destructive sm:col-span-2"}
          >
            {result.ok ? result.message : result.error}
          </p>
        ) : null,
      )}
    </form>
  );
}
