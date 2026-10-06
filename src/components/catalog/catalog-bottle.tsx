"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { Inferred } from "@/components/ui/inferred";
import { initialFieldValues } from "@/components/forms/field";
import {
  EMPTY_LINKS,
  ExpressionFields,
  LABEL_FIELDS,
  withLabelChange,
  type LabelLinks,
} from "@/components/expressions/expression-form";
import { BottleFields } from "@/components/expressions/bottle-form";
import { PendingColas } from "@/components/expressions/cola-approvals";
import { serializeLinks } from "@/components/expressions/ordered-picker";
import { BOTTLE_FIELDS } from "@/lib/expressions/bottle-fields";
import { guessNewLabel } from "@/lib/expressions/label-search";
import { withOption } from "@/lib/forms/values";
import { formatNumeric } from "@/lib/utils";
import type { BottleSuggestions } from "@/lib/bottles/suggestions";
import type { FieldGroup } from "@/db/schema";
import type { ActionResult, Option } from "@/lib/admin/types";
import {
  catalogBottleAction,
  catalogLabelAction,
  searchCatalogLabelsAction,
  type CatalogHit,
  type CatalogSearch,
} from "@/app/(app)/bottles/add/actions";
import type { CatalogLabel } from "@/lib/expressions/catalog";
import { LabelSearchBox } from "./label-search-box";

/** The first half of the page: still looking, a label chosen, or a new one being written. */
type Phase =
  | { kind: "search" }
  | { kind: "existing"; label: CatalogLabel; editing: boolean }
  | { kind: "new" };

type Staged = { file: File; url: string };

const NO_ERRORS = { label: {} as Record<string, string>, bottle: {} as Record<string, string>, message: null as string | null };

/**
 * The search-first Add bottle page (switched on per account in
 * Configuration). One page per physical bottle: find the label or start one,
 * then everything about this bottle and its photos, then one save. The label
 * and bottle stay separate records; only the order of entering them changes.
 */
export function CatalogBottle({
  labelOptions,
  bottleOptions,
  categoryGroups,
  colaLookup,
  initialLabel,
  suggestions,
  releases,
}: {
  labelOptions: Record<string, Option[]>;
  bottleOptions: Record<string, Option[]>;
  categoryGroups: Record<number, FieldGroup>;
  colaLookup: boolean;
  initialLabel: CatalogLabel | null;
  /** Past values for Picked By, Warehouse, Rick / Floor and Where It Lives. */
  suggestions: BottleSuggestions;
  /** Each label's known releases (by label id), for the Release choice. */
  releases: Record<number, Array<{ value: string; label: string }>>;
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const [phase, setPhase] = React.useState<Phase>(
    initialLabel ? { kind: "existing", label: initialLabel, editing: false } : { kind: "search" },
  );

  const [errors, setErrors] = React.useState(NO_ERRORS);

  // --- Search -------------------------------------------------------------
  const [query, setQuery] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<number | null>(null);
  // Each answer remembers what it answered, so a slower, older one never
  // replaces a newer one, and "searching" is simply "not answered yet".
  const [answer, setAnswer] = React.useState<{ key: string; search: CatalogSearch } | null>(null);
  const [picking, setPicking] = React.useState(false);
  const searchKey = `${categoryId ?? ""}|${query}`;
  const search = answer?.search ?? null;
  const searching = phase.kind === "search" && answer?.key !== searchKey;

  React.useEffect(() => {
    if (phase.kind !== "search") return;
    const key = `${categoryId ?? ""}|${query}`;
    let superseded = false;
    const timer = window.setTimeout(async () => {
      const result = await searchCatalogLabelsAction(query, categoryId).catch(() => null);
      if (result && !superseded) setAnswer({ key, search: result });
    }, 120);
    return () => {
      superseded = true;
      window.clearTimeout(timer);
    };
  }, [query, categoryId, phase.kind]);

  // --- The label ------------------------------------------------------------
  const [labelOptionsState, setLabelOptions] = React.useState(labelOptions);
  const [labelValues, setLabelValues] = React.useState(() => initialFieldValues(LABEL_FIELDS, null));
  const [labelLinks, setLabelLinks] = React.useState<LabelLinks>(EMPTY_LINKS);
  const [pendingTtb, setPendingTtb] = React.useState<string[]>([]);
  // Remounts the TTB picker, which keeps its own list, whenever a new label starts.
  const [colaKey, setColaKey] = React.useState(0);

  const guess = React.useMemo(
    () =>
      guessNewLabel(
        query,
        (labelOptionsState.brandId ?? []).map((o) => ({ id: o.value, name: o.label })),
        (labelOptionsState.categoryId ?? []).map((o) => ({ id: o.value, name: o.label })),
      ),
    [query, labelOptionsState],
  );

  const newLabelText = (() => {
    if (search?.code && search.hits.length === 0) {
      return search.code.kind === "upc" ? `New label with barcode ${search.code.value}` : `New label with TTB ID ${search.code.value}`;
    }
    if (query.trim() === "") return "New label";
    return guess.brandName ? `New label: ${guess.brandName} · ${guess.name}` : `New label: ${query.trim()}`;
  })();

  // Where focus goes once the next render is on screen: a field's id, the
  // search box, or the first field in error. Set alongside the state change
  // that renders it, and moved in an effect, which runs after the commit; a
  // requestAnimationFrame can fire before the new fields exist.
  const pendingFocus = React.useRef<string | null>(null);
  React.useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === "search") searchRef.current?.focus();
    else if (target === "error") formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
    else document.getElementById(target)?.focus();
  });
  const focusLater = (target: string) => {
    pendingFocus.current = target;
  };

  const pick = async (hit: CatalogHit) => {
    setPicking(true);
    const label = await catalogLabelAction(hit.id).catch(() => null);
    setPicking(false);
    if (!label) {
      setErrors({ ...NO_ERRORS, message: "That label is gone. Search for it again." });
      return;
    }
    focusLater("bottle-pricePaid");
    setErrors(NO_ERRORS);
    // A release chosen under a previously picked label is not this label's.
    setBottleValues((prev) => ({ ...prev, releaseId: "" }));
    setPhase({ kind: "existing", label, editing: false });
  };

  const startNew = () => {
    const values = initialFieldValues(LABEL_FIELDS, null);
    const code = search?.code && search.hits.length === 0 ? search.code : null;
    if (code?.kind === "upc") {
      values.upc = code.value;
    } else if (query.trim() !== "") {
      if (guess.brandId !== null) values.brandId = String(guess.brandId);
      values.name = guess.name;
    }
    const category = categoryId ?? (code ? null : guess.categoryId);
    if (category !== null) values.categoryId = String(category);
    setLabelValues(values);
    setLabelLinks(EMPTY_LINKS);
    setPendingTtb(code?.kind === "ttb" ? [code.value] : []);
    setColaKey((key) => key + 1);
    focusLater(values.brandId ? "expression-name" : "expression-brandId");
    setErrors(NO_ERRORS);
    setPhase({ kind: "new" });
  };

  const editChosen = (label: CatalogLabel) => {
    setLabelValues(initialFieldValues(LABEL_FIELDS, label.values));
    setLabelLinks(label.links);
    setPhase({ kind: "existing", label, editing: true });
  };

  const backToSearch = () => {
    focusLater("search");
    setErrors(NO_ERRORS);
    setPhase({ kind: "search" });
  };

  // --- The bottle -------------------------------------------------------------
  const [bottleOptionsState, setBottleOptions] = React.useState(bottleOptions);
  const [bottleValues, setBottleValues] = React.useState(() => initialFieldValues(BOTTLE_FIELDS, null));
  const [photos, setPhotos] = React.useState<Staged[]>([]);
  // Previews are object URLs; let them go when the page does.
  const photosRef = React.useRef(photos);
  React.useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  React.useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const added = [...files].filter((file) => file.type.startsWith("image/")).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos((prev) => [...prev, ...added]);
  };
  const removePhoto = (index: number) =>
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index]!.url);
      return prev.filter((_, i) => i !== index);
    });

  // --- Saving -----------------------------------------------------------------
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase.kind === "search" || saving) return;

    const writesLabel = phase.kind === "new" || phase.editing;
    const form = formRef.current;
    setSaving(true);
    const result = await catalogBottleAction({
      expressionId: phase.kind === "existing" ? phase.label.id : null,
      label: writesLabel ? labelValues : null,
      links: writesLabel
        ? {
            distilleryLinks: serializeLinks(labelLinks.distilleries),
            mashbillLinks: serializeLinks(labelLinks.mashbills),
            finishLinks: serializeLinks(labelLinks.finishes),
          }
        : null,
      ttbIds: String(form ? (new FormData(form).get("ttbIds") ?? "") : ""),
      bottle: bottleValues,
    }).catch((): null => null);

    if (!result || !result.ok) {
      focusLater("error");
      setSaving(false);
      setErrors(
        result
          ? { label: result.labelErrors, bottle: result.bottleErrors, message: result.error }
          : { ...NO_ERRORS, message: "Could not reach Rickhouse. Try again." },
      );
      return;
    }

    // Photos go up once the bottle exists, through the bottle page's own route.
    if (photos.length > 0) {
      const body = new FormData();
      for (const photo of photos) body.append("images", photo.file);
      await fetch(`/api/bottles/${result.bottleId}/images`, { method: "POST", body }).catch(() => null);
    }

    router.push(`/bottles/${result.bottleId}`);
    router.refresh();
  };

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-8" noValidate>
      <Section>
        <SectionHeader>
          <SectionTitle>
            <span className="mr-2 tabular-nums text-muted-foreground">1</span>The label
          </SectionTitle>
          <SectionDescription>
            {phase.kind === "search"
              ? "Search everything on the bottle in your hand: brand, name, distillery, a barcode, or a TTB ID."
              : phase.kind === "new"
                ? "A new label: the product itself, shared by every bottle of it you will ever own."
                : "The product this bottle is. Its specs are shared by every bottle of it."}
          </SectionDescription>
        </SectionHeader>
        <SectionContent>
          {phase.kind === "search" ? (
            <div className="relative">
              <LabelSearchBox
                query={query}
                onQueryChange={setQuery}
                categoryId={categoryId}
                onCategoryChange={setCategoryId}
                search={search}
                searching={searching || picking}
                newLabelText={newLabelText}
                onPick={pick}
                onNew={startNew}
                inputRef={searchRef}
              />
            </div>
          ) : null}

          {phase.kind === "existing" ? (
            <ChosenLabel
              label={phase.label}
              editing={phase.editing}
              onChange={backToSearch}
              onEdit={() => editChosen(phase.label)}
              onStopEditing={() => setPhase({ ...phase, editing: false })}
            />
          ) : null}

          {phase.kind === "new" ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {query.trim() !== "" ? (
                  <>
                    Started from &ldquo;<span className="text-foreground">{query.trim()}</span>&rdquo;.
                    {guess.brandId === null && !search?.code ? " No brand on file matched, so choose or create it below." : null}
                  </>
                ) : (
                  "Starting from a blank label."
                )}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={backToSearch}>
                Back to search
              </Button>
            </div>
          ) : null}
        </SectionContent>
      </Section>

      {phase.kind === "new" || (phase.kind === "existing" && phase.editing) ? (
        <div className="flex flex-col gap-6 border-l-2 border-border pl-4 sm:pl-6">
          <ExpressionFields
            values={labelValues}
            onChange={(name, value) => setLabelValues((prev) => withLabelChange(prev, name, value))}
            links={labelLinks}
            onLinksChange={setLabelLinks}
            options={labelOptionsState}
            onOptionCreated={(name, option) => setLabelOptions((prev) => withOption(prev, name, option))}
            categoryGroups={categoryGroups}
            errors={errors.label}
          />
          {phase.kind === "new" ? (
            <PendingColas
              key={colaKey}
              className="border-t border-foreground pt-3"
              brandName={labelOptionsState.brandId?.find((o) => String(o.value) === String(labelValues.brandId))?.label ?? ""}
              labelName={typeof labelValues.name === "string" ? labelValues.name : ""}
              distilleryIds={labelLinks.distilleries.map((row) => row.id).filter((id) => id > 0)}
              lookupEnabled={colaLookup}
              initialTtbIds={pendingTtb}
            />
          ) : null}
        </div>
      ) : null}

      {phase.kind === "search" ? (
        <p className="text-sm text-muted-foreground">
          <span className="mr-2 tabular-nums">2</span>The bottle in your hand, once the label is chosen.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-6">
            <h2 className="text-2xl leading-tight tracking-tight">
              <span className="mr-2 tabular-nums text-muted-foreground">2</span>The bottle in your hand
            </h2>
            <BottleFields
              // The label is chosen above, not a field here, so the release list is keyed by it.
              values={phase.kind === "existing" ? { ...bottleValues, expressionId: String(phase.label.id) } : bottleValues}
              releases={releases}
              onChange={(name, value) => setBottleValues((prev) => ({ ...prev, [name]: value }))}
              options={bottleOptionsState}
              onOptionCreated={(name, option) => setBottleOptions((prev) => withOption(prev, name, option))}
              errors={errors.bottle}
              suggestions={suggestions}
              omit={["expressionId"]}
            />
          </div>

          <Section>
            <SectionHeader>
              <SectionTitle>Photos</SectionTitle>
              <SectionDescription>The first is the catalog photo. More can be added from the bottle&rsquo;s page.</SectionDescription>
            </SectionHeader>
            <SectionContent className="flex flex-wrap gap-3">
              {photos.map((photo, i) => (
                <div key={photo.url} className="relative size-28 border border-border bg-muted">
                  <Image src={photo.url} alt={`Photo ${i + 1}`} fill unoptimized className="object-contain p-1" />
                  {i === 0 ? (
                    <span className="absolute bottom-0 left-0 bg-foreground px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-background">
                      Catalog
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute right-1 top-1 bg-background/90 p-0.5 hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <label className="flex size-28 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-border text-sm text-muted-foreground hover:border-foreground hover:text-foreground focus-within:ring-2 focus-within:ring-ring">
                <ImagePlus className="size-5" />
                Add photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    addPhotos(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
            </SectionContent>
          </Section>
        </>
      )}

      {errors.message ? (
        <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errors.message}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button type="button" variant="outline" asChild>
          <Link href="/bottles">Cancel</Link>
        </Button>
        {phase.kind !== "search" ? (
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {phase.kind === "new" ? "Save label and bottle" : "Save bottle"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** A chosen label, read back so you can see it is the right one before going on. */
function ChosenLabel({
  label,
  editing,
  onChange,
  onEdit,
  onStopEditing,
}: {
  label: CatalogLabel;
  editing: boolean;
  onChange: () => void;
  onEdit: () => void;
  onStopEditing: () => void;
}) {
  const specs = [
    label.category,
    label.proof ? `${formatNumeric(label.proof)} proof` : null,
    label.age,
    `${label.sizeMl} ml`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xl">
            {label.brand} <span className="text-accent">{label.name}</span>
          </p>
          <p className="text-sm text-muted-foreground">{specs.join(" · ")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={editing ? onStopEditing : onEdit}>
            {editing ? "Keep the label as it was" : "Edit label details"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onChange}>
            Choose another
          </Button>
        </div>
      </div>
      {!editing ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          {label.distilleries.length > 0 ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Distilleries</dt>
              <dd>
                {label.distilleries.map((d, i) => (
                  <React.Fragment key={d.name}>
                    {i > 0 ? ", " : null}
                    {d.inferred ? <Inferred>{d.name}</Inferred> : d.name}
                  </React.Fragment>
                ))}
              </dd>
            </div>
          ) : null}
          {label.mashbills.length > 0 ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Mashbills</dt>
              <dd>{label.mashbills.join("; ")}</dd>
            </div>
          ) : null}
          {label.finishes.length > 0 ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Finishes</dt>
              <dd>{label.finishes.join(", ")}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          Changes here are saved to the label with this bottle, and reach every bottle of it.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {label.bottles === 0
          ? "None of this label on your shelf yet."
          : `You have ${label.bottles === 1 ? "1 bottle" : `${label.bottles} bottles`} of this. `}
        <Link href={`/expressions/${label.id}`} className="text-primary underline underline-offset-2 hover:no-underline" target="_blank">
          Open the label
        </Link>
      </p>
    </div>
  );
}
