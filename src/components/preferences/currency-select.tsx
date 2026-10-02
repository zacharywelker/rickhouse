"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { savePreferencesAction } from "@/app/(app)/admin/preferences-actions";
import { CURRENCIES } from "@/lib/currency";

/** The currency prices are shown in, saved as soon as it is picked. Labels only; nothing is converted. */
export function CurrencySelect({ value: initial }: { value: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const id = "preference-currency";

  const change = (next: string) => {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await savePreferencesAction({ currency: next });
      if (!result.ok) {
        setValue(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        Currency
      </label>
      <select
        id={id}
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        aria-describedby={`${id}-help`}
        className="h-9 w-64 max-w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name} ({c.symbol.trim()})
          </option>
        ))}
      </select>
      <p id={`${id}-help`} className="text-sm text-muted-foreground">
        How prices are shown and entered. Amounts are never converted, so changing this only changes the symbol.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
