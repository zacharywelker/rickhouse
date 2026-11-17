"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HOME_COUNTRY, US_STATES, normalizeCountry, normalizePlace, normalizeState, undisclosedName } from "@/lib/places";
import type { LinkedRow } from "./ordered-picker";

const EMPTY_PLACE = { city: "", states: "", country: "" };

/** Each country can contribute several states. Saved and pending locations share the same list. */
export function UndisclosedTick({
  idPrefix,
  rows,
  onChange,
}: {
  idPrefix: string;
  rows: LinkedRow[];
  onChange: (rows: LinkedRow[]) => void;
}) {
  const [ticked, setTicked] = React.useState(rows.length > 0);
  const [draft, setDraft] = React.useState(EMPTY_PLACE);
  const [draftId, setDraftId] = React.useState(() => Math.min(0, ...rows.map((row) => row.id)) - 1);
  const added = rows.filter((row) => !row.place || row.id > draftId);
  const pending = rows.filter((row) => row.place && row.id <= draftId);

  function update(next: typeof draft) {
    setDraft(next);
    const country = next.country.trim();
    const states = [...new Set(next.states.split(",").map((state) => normalizeState(state, country)).filter(Boolean))];
    const places = country || states.length || next.city.trim()
      ? (states.length ? states : [""]).map((state) => ({
        city: states.length > 1 ? "" : next.city,
        state,
        country: country || HOME_COUNTRY,
      }))
      : [];
    const known = new Set(added.map((row) => row.label.toLowerCase()));
    const incoming = places.map((place, index) => ({
      id: draftId - index,
      label: undisclosedName(normalizePlace(place)),
      amount: "",
      undisclosed: true,
      place,
    })).filter((row) => {
      const label = row.label.toLowerCase();
      if (known.has(label)) return false;
      known.add(label);
      return true;
    });
    onChange([...added, ...incoming]);
  }

  function addLocation() {
    if (pending.length === 0) return;
    setDraftId(Math.min(...pending.map((row) => row.id)) - 1);
    setDraft(EMPTY_PLACE);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex w-fit items-center gap-2 text-sm">
        <input
          id={`${idPrefix}-tick`}
          type="checkbox"
          checked={ticked}
          onChange={(event) => {
            setTicked(event.target.checked);
            if (event.target.checked) return;
            setDraft(EMPTY_PLACE);
            setDraftId(-1);
            onChange([]);
          }}
        />
        Distillery not disclosed
      </label>

      {ticked ? (
        <div className="flex flex-col gap-3 border border-border bg-muted/30 p-3">
          {added.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Undisclosed locations">
              {added.map((row) => (
                <li key={row.id} className="flex items-center gap-1 border border-border bg-card py-0.5 pl-2 pr-0.5 text-sm">
                  {row.label}
                  <button
                    type="button"
                    className="p-1 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${row.label}`}
                    onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3" onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            addLocation();
          }}>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idPrefix}-country`}>Country</Label>
              <Input id={`${idPrefix}-country`} placeholder="USA" value={draft.country} onChange={(event) => update({ ...draft, country: event.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idPrefix}-state`}>States or provinces</Label>
              <Input
                id={`${idPrefix}-state`}
                placeholder="KY, IN, TN"
                value={draft.states}
                list={normalizeCountry(draft.country) === HOME_COUNTRY ? `${idPrefix}-state-list` : undefined}
                onChange={(event) => update({ ...draft, states: event.target.value })}
              />
              <datalist id={`${idPrefix}-state-list`}>
                {Object.values(US_STATES).map((name) => <option key={name} value={name} />)}
              </datalist>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idPrefix}-city`}>City</Label>
              <Input
                id={`${idPrefix}-city`}
                placeholder="Optional"
                disabled={draft.states.split(",").filter((state) => state.trim()).length > 1}
                value={draft.city}
                onChange={(event) => update({ ...draft, city: event.target.value })}
              />
            </div>
          </div>
          {pending.length > 0 ? <p className="text-xs text-muted-foreground">{pending.map((row) => row.label).join(" · ")}</p> : null}
          <Button type="button" variant="outline" size="sm" className="self-start" disabled={pending.length === 0} onClick={addLocation}>
            Add location
          </Button>
        </div>
      ) : null}
    </div>
  );
}
