"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, isRateLimited } from "@/lib/auth/client";

type Setup = { qr: string; secret: string; backupCodes: string[] };

/**
 * Authenticator-app codes, with backup codes for a lost phone — and emailed
 * codes too when the admin has set email up. Turning it on or off asks for
 * the password, so an unattended session can't quietly change it.
 */
export function TwoFactorSection({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const fail = (failure: { status?: number }, fallback: string) =>
    setError(isRateLimited(failure) ? "Too many tries. Give it a minute." : fallback);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setPending(true);
    setError(null);
    const { data, error: failure } = await authClient.twoFactor.enable({ password, method: "totp" });
    setPending(false);
    if (failure || !data || data.method !== "totp") return fail(failure ?? {}, "That password isn't right.");
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    setSetup({ qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 192 }), secret, backupCodes: data.backupCodes });
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (failure) return fail(failure, "That code isn't right. Check the time on your phone and try again.");
    setDone("Two-step sign-in is on. Keep your backup codes somewhere safe.");
    router.refresh();
  }

  async function turnOff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.twoFactor.disable({ password });
    setPending(false);
    if (failure) return fail(failure, "That password isn't right.");
    setSetup(null);
    setDone("Two-step sign-in is off.");
    router.refresh();
  }

  const message = (
    <>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-sm">
          {done}
        </p>
      ) : null}
    </>
  );

  if (setup) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
          <li>
            Scan this with your authenticator app (1Password, Google Authenticator, Aegis…), or enter the key by hand.
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise */}
            <img src={setup.qr} alt="QR code for your authenticator app" width={192} height={192} className="mt-2 border border-border" />
            <code className="mt-1 block select-all break-all text-xs">{setup.secret}</code>
          </li>
          <li>
            Save these backup codes. Each works once, if you lose your phone.
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">
              {setup.backupCodes.map((code) => (
                <li key={code} className="select-all">
                  {code}
                </li>
              ))}
            </ul>
          </li>
        </ol>
        {done ? null : (
          <form onSubmit={confirm} className="flex max-w-sm flex-col gap-3">
            <Label htmlFor="totp-code">Enter the code your app shows, to finish</Label>
            <Input id="totp-code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
            <div>
              <Button type="submit" disabled={pending}>
                {pending ? "Checking…" : "Turn on"}
              </Button>
            </div>
          </form>
        )}
        {message}
      </div>
    );
  }

  return (
    <form onSubmit={enabled ? turnOff : start} className="flex max-w-sm flex-col gap-3">
      <p className="text-sm">
        {enabled
          ? "On. Signing in with your password also asks for a code."
          : "Off. Turn it on so a stolen password isn't enough to get in."}
      </p>
      <Label htmlFor="two-factor-password">Your password</Label>
      <Input id="two-factor-password" name="password" type="password" autoComplete="current-password" required />
      <div>
        <Button type="submit" variant={enabled ? "outline" : "default"} disabled={pending}>
          {enabled ? "Turn off two-step sign-in" : "Set up two-step sign-in"}
        </Button>
      </div>
      {message}
    </form>
  );
}
