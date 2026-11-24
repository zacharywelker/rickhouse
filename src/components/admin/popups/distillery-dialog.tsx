"use client";

import * as React from "react";
import {
  createdOptionAction,
  referenceOptionsAction,
  resourceFormSpecAction,
  saveResourceAction,
} from "@/app/(app)/admin/actions";
import { ReferenceCombobox } from "@/components/admin/reference-combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SCOTCH_REGIONS } from "@/db/schema";
import { countryForKind, distilleryNameOf, placeIdentifier } from "@/lib/admin/distillery-defaults";
import { titleCase, type Problem } from "@/lib/admin/popup-problems";
import { IDLE_RESULT, type Option } from "@/lib/admin/types";
import type { CategoryKind } from "@/lib/expressions/rules";
import { isScotchCountry, normalizeCountry, normalizeState } from "@/lib/places";
import { cn } from "@/lib/utils";
import { PopupRow as Row, PopupShell } from "./popup-shell";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  /** The country the label's spirit is made in, from its category. */
  defaultCountry?: string;
  /** The label's spirit, which decides the identifier beside Country (DSP, NOM or Scotch region). */
  kind?: CategoryKind;
  defaultCompanyId?: number;
  onCreated: (option: Option) => void;
};

type MoreKey = "founded" | "names" | "notes";

/**
 * Add distillery: a name, its company, and where it is, with the one identifier its spirit uses beside the
 * country. Founded, defunct, older names and notes sit under More. "Not disclosed" stays on its own flow.
 */
export function DistilleryDialog(props: Props) {
  return props.open ? <DistilleryDialogBody {...props} /> : null;
}

function DistilleryDialogBody({ onOpenChange, initialName, defaultCountry, kind, defaultCompanyId, onCreated }: Props) {
  const [name, setName] = React.useState(initialName);
  const [companyId, setCompanyId] = React.useState<number | null>(defaultCompanyId ?? null);
  const [companies, setCompanies] = React.useState<Option[]>([]);
  const [city, setCity] = React.useState("");
  const [state, setState] = React.useState("");
  const [country, setCountry] = React.useState(defaultCountry ?? "USA");
  // One value per kind of identifier, so changing the country after typing never files a DSP number as a NOM.
  const [identifiers, setIdentifiers] = React.useState<Record<"dsp" | "nom" | "region", string>>({ dsp: "", nom: "", region: "" });
  const [founded, setFounded] = React.useState("");
  const [defunct, setDefunct] = React.useState(false);
  const [otherNames, setOtherNames] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [more, setMore] = React.useState<ReadonlySet<MoreKey>>(new Set());
  const [existing, setExisting] = React.useState<Option[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    void Promise.all([referenceOptionsAction("distilleries"), resourceFormSpecAction("distilleries")])
      .then(([rows, spec]) => {
        if (!mounted.current) return;
        setExisting(rows);
        if (spec.ok) setCompanies(spec.options.companyId ?? []);
      })
      .catch(() => undefined);
    return () => {
      mounted.current = false;
    };
  }, []);

  const tidy = titleCase(name);
  const place = normalizeCountry(country);
  const chip = placeIdentifier(place);
  const identifier = chip === null ? "" : identifiers[chip];
  const setIdentifier = (value: string) => {
    if (chip !== null) setIdentifiers((prev) => ({ ...prev, [chip]: value }));
  };
  const expected = kind ? countryForKind(kind) : null;
  const countryFits = expected === null || place === normalizeCountry(expected) || (expected === "Scotland" && isScotchCountry(place));
  const duplicate = tidy === "" ? undefined : existing.find((option) => distilleryNameOf(option.label).toLowerCase() === tidy.toLowerCase());

  const problems: Problem[] = [];
  if (tidy === "") problems.push({ text: "Give it a name.", blocking: true });
  if (duplicate) {
    problems.push({
      text: `A distillery named “${distilleryNameOf(duplicate.label)}” is already in your collection.`,
      blocking: true,
      action: { label: "Use it", onClick: () => { onCreated(duplicate); onOpenChange(false); } },
    });
  }
  if (!countryFits) problems.push({ text: `This spirit is usually made in ${expected}. Check the country.`, blocking: false });
  if (serverError) problems.push({ text: serverError, blocking: false, notice: true });

  const clearError = () => setServerError(null);
  const toggleMore = (key: MoreKey) => setMore((prev) => new Set(prev).add(key));

  async function save() {
    if (tidy === "" || saving) return;
    setSaving(true);
    setServerError(null);
    try {
      const form = new FormData();
      form.set("name", tidy);
      if (companyId !== null) form.set("companyId", String(companyId));
      if (city.trim() !== "") form.set("city", city.trim());
      const stateValue = normalizeState(state, place);
      if (stateValue !== "") form.set("state", stateValue);
      form.set("country", place);
      if (chip !== null && identifier.trim() !== "") {
        form.set(chip === "dsp" ? "dspNumber" : chip === "nom" ? "nomNumber" : "region", identifier.trim());
      }
      if (founded.trim() !== "") form.set("founded", founded.trim());
      if (defunct) form.set("isDefunct", "on");
      if (otherNames.trim() !== "") form.set("otherNames", otherNames);
      if (notes.trim() !== "") form.set("notes", notes.trim());
      const result = await saveResourceAction("distilleries", null, IDLE_RESULT, form);
      if (!mounted.current) return;
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      const created = result.createdId === undefined ? null : await createdOptionAction("distilleries", result.createdId);
      if (!mounted.current) return;
      if (created?.ok) {
        onCreated(created.option);
        onOpenChange(false);
      } else {
        setServerError("It was saved, but could not be chosen here. Close this and pick it from the list.");
      }
    } catch {
      if (mounted.current) setServerError("Could not reach the server. Try again.");
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  const moreLinks = (["founded", "names", "notes"] as const).filter((key) => !more.has(key));

  return (
    <PopupShell
      title="Add distillery"
      description="Saved to your collection, and chosen here when you are done."
      open
      onOpenChange={onOpenChange}
      problems={problems}
      saveLabel="Save distillery"
      saving={saving}
      onSave={() => void save()}
    >
      <Row label="Name" htmlFor="distillery-name">
        <Input
          id="distillery-name"
          value={name}
          autoFocus
          onChange={(event) => {
            setName(event.target.value);
            clearError();
          }}
          onBlur={() => setName(titleCase(name))}
        />
      </Row>
      <Row label="Company">
        <span id="distillery-company-label" className="sr-only">
          Company
        </span>
        <ReferenceCombobox
          id="distillery-company"
          labelledBy="distillery-company-label"
          resource="companies"
          options={companies}
          value={companyId}
          onChange={setCompanyId}
          onOptionCreated={(option) => setCompanies((prev) => [...prev, option])}
          placeholder="Search or add a company"
        />
      </Row>
      <Row label="Place">
        <div className="flex flex-wrap items-center gap-2">
          <PlaceInput label="City" value={city} onChange={setCity} width="w-32" />
          <PlaceInput
            label="State"
            value={state}
            onChange={setState}
            onBlur={() => setState(normalizeState(state, place))}
            width="w-24"
          />
          <PlaceInput label="Country" value={country} onChange={setCountry} onBlur={() => setCountry(normalizeCountry(country))} width="w-24" />
          {chip === "region" ? (
            <select
              aria-label="Region"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="h-10 border border-input bg-card px-2 text-sm text-foreground"
            >
              <option value="">Region</option>
              {SCOTCH_REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          ) : chip === "dsp" || chip === "nom" ? (
            <PlaceInput
              label={chip === "dsp" ? "DSP" : "NOM"}
              value={identifier}
              onChange={setIdentifier}
              placeholder={chip === "dsp" ? "DSP-KY-95" : "1234"}
              width="w-28"
            />
          ) : null}
        </div>
      </Row>
      {more.has("founded") ? (
        <Row label="Founded">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="Founded"
              inputMode="numeric"
              value={founded}
              onChange={(event) => setFounded(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              placeholder="1870"
              className="w-24"
            />
            <button
              type="button"
              aria-pressed={defunct}
              onClick={() => setDefunct(!defunct)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border border-foreground px-3 text-xs",
                defunct ? "bg-foreground text-background" : "bg-card hover:bg-muted",
              )}
            >
              {defunct ? <span aria-hidden="true">✓</span> : null}
              Defunct
            </button>
          </div>
        </Row>
      ) : null}
      {more.has("names") ? (
        <Row label="Other names">
          <Textarea
            aria-label="Other or old names"
            value={otherNames}
            onChange={(event) => setOtherNames(event.target.value)}
            placeholder="One per line. Years are optional: (1980–1995), (from 1996)."
          />
        </Row>
      ) : null}
      {more.has("notes") ? (
        <Row label="Notes">
          <Textarea aria-label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Row>
      ) : null}
      {moreLinks.length > 0 ? (
        <Row label="More">
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1.5 text-sm">
            {moreLinks.map((key) => (
              <button key={key} type="button" onClick={() => toggleMore(key)} className="underline underline-offset-2">
                {key === "founded" ? "Founded or defunct" : key === "names" ? "Other / old names" : "Notes"}
              </button>
            ))}
          </div>
        </Row>
      ) : null}
    </PopupShell>
  );
}

function PlaceInput({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  width,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  width: string;
}) {
  // The label is the placeholder, so four fields fit on one line in the popup.
  return (
    <Input
      aria-label={label}
      value={value}
      placeholder={placeholder ?? label}
      title={placeholder ? `${label}, like ${placeholder}` : undefined}
      onChange={(event) => onChange(event.target.value)}
      {...(onBlur ? { onBlur } : {})}
      className={cn("h-10", width)}
    />
  );
}
