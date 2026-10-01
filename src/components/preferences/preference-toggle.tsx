"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { savePreferencesAction } from "@/app/(app)/admin/preferences-actions";
import type { Preferences } from "@/lib/preferences";

/**
 * One preference, saved as soon as it is ticked. A checkbox rather than a
 * switch: it is the control the rest of the app's forms already use.
 */
export function PreferenceToggle({
  name,
  checked,
  label,
  children,
}: {
  name: keyof Preferences;
  checked: boolean;
  label: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(checked);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const id = `preference-${name}`;

  const change = (next: boolean) => {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await savePreferencesAction({ [name]: next });
      if (!result.ok) {
        setValue(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={value}
        disabled={pending}
        onCheckedChange={(state) => change(state === true)}
        aria-describedby={children ? `${id}-help` : undefined}
        className="mt-0.5"
      />
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {children ? (
          <div id={`${id}-help`} className="text-sm text-muted-foreground">
            {children}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
