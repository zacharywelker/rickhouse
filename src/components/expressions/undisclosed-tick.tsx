"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { HOME_COUNTRY, US_STATES, normalizeCountry, normalizePlace, normalizeState, undisclosedName } from "@/lib/places";
import type { LinkedRow } from "./ordered-picker";

/** The id of the first not-yet-saved place; the next ones count down from it. The save turns each into the account's placeholder row. */
export const PENDING_PLACE_ID = -1;

type Typed = { city: string; states: string[]; country: string };

/**
 * One not-yet-saved placeholder per state, each with its own temporary id (the
 * join table keeps one row per distillery). The city belongs to a single state,
 * so it is dropped when there are several.
 */
export function placeholderRows({ city, states, country }: Typed): LinkedRow[] {
  const places = (states.length > 0 ? states : [""]).map((state) => ({
    city: states.length > 1 ? "" : city,
    state,
    country,
  }));
  return places
    .filter((place) => {
      const normal = normalizePlace(place);
      return normal.city !== null || normal.state !== null || normal.country !== HOME_COUNTRY;
    })
    .map((place, index) => ({
      id: PENDING_PLACE_ID - index,
      label: undisclosedName(normalizePlace(place)),
      amount: "",
      undisclosed: true,
      place,
    }));
}

/**
 * "Distillery not disclosed": for a label that names a place and no distillery.
 * A tick under the distillery list that asks for the city, states and country,
 * the same fields as every other location, with a US state's abbreviation
 * corrected to its full name. More than one state is allowed — a blend of
 * undisclosed whiskies from Kentucky, Indiana and Tennessee — and each state
 * becomes its own placeholder. It holds only what was typed; the shared
 * "Undisclosed (…)" rows are found or made when the label is saved, so there
 * is nothing to wait on and nothing left behind by an abandoned form.
 *
 * `rows` are the label's undisclosed links, kept out of the list above: loaded
 * from a saved label or typed here.
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
  const typed = rows.filter((row) => row.place !== undefined);
  const [ticked, setTicked] = React.useState(rows.length > 0);
  const [changing, setChanging] = React.useState(false);
  const [city, setCity] = React.useState(typed[0]?.place?.city ?? "");
  const [states, setStates] = React.useState<string[]>(() =>
    typed.map((row) => row.place?.state ?? "").filter((state) => state !== ""),
  );
  const [draft, setDraft] = React.useState("");
  const [country, setCountry] = React.useState(typed[0]?.place?.country ?? HOME_COUNTRY);

  const showFields = ticked && (rows.length === 0 || typed.length > 0 || changing);

  const commit = (next: Typed) => onChange(placeholderRows(next));

  const toggle = (on: boolean) => {
    setTicked(on);
    setChanging(false);
    if (on) return;
    setCity("");
    setStates([]);
    setDraft("");
    setCountry(HOME_COUNTRY);
    onChange([]);
  };

  /** Adds the typed state (or several, comma separated), spelled out and without repeats. */
  const addStates = (text: string, nextCountry = country) => {
    const added = text
      .split(",")
      .map((part) => normalizeState(part, nextCountry))
      .filter((state) => state !== "");
    setDraft("");
    if (added.length === 0) return;
    const next = [...new Set([...states, ...added])];
    setStates(next);
    commit({ city, states: next, country: nextCountry });
  };

  const removeState = (state: string) => {
    const next = states.filter((s) => s !== state);
    setStates(next);
    commit({ city, states: next, country });
  };

  const names = placeholderRows({ city, states, country }).map((row) => row.label);

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
            The label names a place and no distillery. Every label that says the same shares one placeholder. Add more
            than one state when it blends whisky from several.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idPrefix}-city`} className="text-xs">
                City {states.length > 1 ? "(one state only)" : ""}
              </Label>
              <Input
                id={`${idPrefix}-city`}
                value={states.length > 1 ? "" : city}
                disabled={states.length > 1}
                placeholder="Louisville"
                onChange={(e) => {
                  setCity(e.target.value);
                  commit({ city: e.target.value, states, country });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idPrefix}-state`} className="text-xs">
                States
              </Label>
              <Input
                id={`${idPrefix}-state`}
                value={draft}
                list={normalizeCountry(country) === HOME_COUNTRY ? `${idPrefix}-state-list` : undefined}
                placeholder={states.length > 0 ? "Add another" : "KY or Kentucky"}
                autoFocus={rows.length === 0}
                autoComplete="off"
                onChange={(e) => {
                  const text = e.target.value;
                  // A comma, or picking a suggestion, finishes the state.
                  if (text.includes(",") || Object.values(US_STATES).includes(text)) addStates(text);
                  else setDraft(text);
                }}
                onBlur={() => addStates(draft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addStates(draft);
                  } else if (e.key === "Backspace" && draft === "" && states.length > 0) {
                    removeState(states[states.length - 1]!);
                  }
                }}
              />
              <datalist id={`${idPrefix}-state-list`}>
                {Object.values(US_STATES).map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
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
                  commit({ city, states, country: e.target.value });
                }}
                onBlur={() => {
                  const fixed = normalizeCountry(country);
                  const fixedStates = states.map((state) => normalizeState(state, fixed));
                  setCountry(fixed);
                  setStates(fixedStates);
                  commit({ city, states: fixedStates, country: fixed });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
            </div>
          </div>
          {states.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="States chosen">
              {states.map((state) => (
                <li key={state} className="flex items-center gap-1 border border-border bg-card py-0.5 pl-2 pr-0.5 text-sm">
                  {state}
                  <button
                    type="button"
                    className="p-1 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${state}`}
                    onClick={() => removeState(state)}
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Records{" "}
            <span className="text-foreground">{names.length > 0 ? names.join(" · ") : undisclosedName(normalizePlace({ country }))}</span>
            {names.length === 0 ? " once a state or city is given" : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
