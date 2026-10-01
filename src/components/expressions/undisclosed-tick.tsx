"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HOME_COUNTRY, normalizeCountry, normalizePlace, normalizeState, undisclosedName } from "@/lib/places";
import type { LinkedRow } from "./ordered-picker";

/** The id a not-yet-saved place carries. The save turns it into the account's placeholder row. */
export const PENDING_PLACE_ID = -1;

/**
 * "Distillery not disclosed": for a label that names a place and no distillery.
 * A tick under the distillery list that asks for the state, with a US
 * abbreviation corrected to its full name. It holds only what was typed; the
 * shared "Undisclosed (…)" row is found or made when the label is saved, so
 * there is nothing to wait on and nothing left behind by an abandoned form.
 *
 * `rows` are the label's undisclosed links, kept out of the list above: usually
 * one, loaded from a saved label or typed here.
 */
export function UndisclosedTick({
  idPrefix,
  rows,
  onChange,
}: {
  idPrefix: string;
  rows: LinkedRow[];
  onChange: (rows: LinkedRow[]) => void;
}) {
  const typed = rows.find((row) => row.place !== undefined);
  const [ticked, setTicked] = React.useState(rows.length > 0);
  const [changing, setChanging] = React.useState(false);
  const [city, setCity] = React.useState(typed?.place?.city ?? "");
  const [state, setState] = React.useState(typed?.place?.state ?? "");
  const [country, setCountry] = React.useState(typed?.place?.country ?? HOME_COUNTRY);

  const showFields = ticked && (rows.length === 0 || typed !== undefined || changing);

  /** What the label records for these fields: nothing until a place is given. */
  const commit = (next: { city: string; state: string; country: string }) => {
    const place = normalizePlace(next);
    const hasPlace = place.city !== null || place.state !== null || place.country !== HOME_COUNTRY;
    onChange(
      hasPlace
        ? [{ id: PENDING_PLACE_ID, label: undisclosedName(place), amount: "", undisclosed: true, place: next }]
        : [],
    );
  };

  const toggle = (on: boolean) => {
    setTicked(on);
    setChanging(false);
    if (on) return;
    setCity("");
    setState("");
    setCountry(HOME_COUNTRY);
    onChange([]);
  };

  const name = undisclosedName(normalizePlace({ city, state, country }));

  return (
    <div className="flex flex-col gap-2">
      <label className="flex w-fit items-center gap-2 text-sm">
        <input
          id={`${idPrefix}-tick`}
          type="checkbox"
          checked={ticked}
          onChange={(e) => toggle(e.target.checked)}
        />
        Distillery not disclosed
      </label>

      {ticked && !showFields ? (
        <p className="flex flex-wrap items-center gap-2 pl-6 text-sm">
          <span>{rows.map((row) => row.label).join(" · ")}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(true)}>
            Change
          </Button>
        </p>
      ) : null}

      {showFields ? (
        <div className="flex flex-col gap-3 border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            The label names a place and no distillery. Every label that says the same shares one placeholder.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idPrefix}-state`} className="text-xs">
                State
              </Label>
              <Input
                id={`${idPrefix}-state`}
                value={state}
                placeholder="IN or Indiana"
                autoFocus={rows.length === 0}
                onChange={(e) => {
                  setState(e.target.value);
                  commit({ city, state: e.target.value, country });
                }}
                // A US abbreviation becomes the full name as you leave the box.
                onBlur={() => {
                  const fixed = normalizeState(state, country);
                  setState(fixed);
                  commit({ city, state: fixed, country });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idPrefix}-city`} className="text-xs">
                City <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id={`${idPrefix}-city`}
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  commit({ city: e.target.value, state, country });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idPrefix}-country`} className="text-xs">
                Country
              </Label>
              <Input
                id={`${idPrefix}-country`}
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  commit({ city, state, country: e.target.value });
                }}
                onBlur={() => {
                  const fixed = normalizeCountry(country);
                  const fixedState = normalizeState(state, fixed);
                  setCountry(fixed);
                  setState(fixedState);
                  commit({ city, state: fixedState, country: fixed });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Records <span className="text-foreground">{name}</span>
            {typed === undefined ? " once a state or city is given" : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
