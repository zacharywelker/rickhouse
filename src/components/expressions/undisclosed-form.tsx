"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findOrCreateUndisclosedAction } from "@/app/(app)/admin/actions";
import type { Option } from "@/lib/admin/types";
import { HOME_COUNTRY, normalizeCountry, normalizePlace, normalizeState, undisclosedName } from "@/lib/places";

/**
 * "Not disclosed": for a label that names a place and no distillery. Asks for
 * the place, corrects a state written as an abbreviation, and adds the one
 * shared "Undisclosed (…)" placeholder for it, so it never has to be made by hand.
 *
 * It sits inside the label form, so it is a div and not a nested form.
 */
export function UndisclosedForm({
  idPrefix,
  chosen,
  onAdd,
}: {
  idPrefix: string;
  /** Ids already on the label, so the same placeholder is not added twice. */
  chosen: ReadonlySet<number>;
  onAdd: (option: Option) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [city, setCity] = React.useState("");
  const [state, setState] = React.useState("");
  const [country, setCountry] = React.useState(HOME_COUNTRY);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const close = () => {
    setOpen(false);
    setError(null);
  };

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        Not disclosed…
      </Button>
    );
  }

  const name = undisclosedName(normalizePlace({ city, state, country }));

  async function submit() {
    setPending(true);
    setError(null);
    const result = await findOrCreateUndisclosedAction({ city, state, country });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (chosen.has(result.option.value)) {
      setError(`${result.option.label} is already on this label.`);
      return;
    }
    onAdd(result.option);
    setCity("");
    setState("");
    setCountry(HOME_COUNTRY);
    close();
  }

  const onEnter = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void submit();
  };

  return (
    <div className="flex flex-col gap-3 border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        The label names a place and no distillery. Fill in what it says; every label that says the same shares one
        placeholder.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-city`} className="text-xs">
            City
          </Label>
          <Input id={`${idPrefix}-city`} value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={onEnter} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-state`} className="text-xs">
            State
          </Label>
          <Input
            id={`${idPrefix}-state`}
            value={state}
            placeholder="IN or Indiana"
            onChange={(e) => setState(e.target.value)}
            // A US abbreviation becomes the full name as you leave the box.
            onBlur={() => setState(normalizeState(state, country))}
            onKeyDown={onEnter}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-country`} className="text-xs">
            Country
          </Label>
          <Input
            id={`${idPrefix}-country`}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            onBlur={() => {
              const next = normalizeCountry(country);
              setCountry(next);
              setState(normalizeState(state, next));
            }}
            onKeyDown={onEnter}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Adds <span className="text-foreground">{name}</span>
      </p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={() => void submit()} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Add
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={close} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
