"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { Field, initialFieldValues, type FieldValue } from "@/components/forms/field";
import { withOption } from "@/lib/forms/values";
import { saveExpressionAction } from "@/app/(app)/expressions/actions";
import { EXPRESSION_SECTIONS, sectionVisible } from "@/lib/expressions/fields";
import { IDLE_RESULT, type ActionResult, type FieldSpec, type Option } from "@/lib/admin/types";
import type { FieldGroup } from "@/db/schema";
import { ageFilled, withAgeDefaults } from "@/lib/bottles/age";
import {
  BOND_PROOF,
  baseReplacesMashbills,
  hiddenFields,
  looksAged,
  parseRegions,
  showsFinishes,
  showsRegions,
  type CategoryKind,
} from "@/lib/expressions/rules";
import { SCOTCH_REGIONS } from "@/db/schema";
import { ProofAbvFields } from "./proof-abv-field";
import { AgeFields } from "./age-fields";
import { OrderedPicker, serializeLinks, type LinkedRow } from "./ordered-picker";
import { DeleteExpressionButton } from "./delete-expression-button";
import { PendingColas } from "./cola-approvals";
import { RowListEditor } from "./row-list-editor";
import { otherNamesRowsText, parseOtherNames } from "@/lib/other-names";
import type { ReleaseRow } from "@/lib/releases";

/** Every field on the label form, for seeding state from a row or from nothing. */
export const LABEL_FIELDS: FieldSpec[] = EXPRESSION_SECTIONS.flatMap((section) => section.fields);

export type LabelLinks = { distilleries: LinkedRow[]; mashbills: LinkedRow[]; finishes: LinkedRow[] };

export const EMPTY_LINKS: LabelLinks = { distilleries: [], mashbills: [], finishes: [] };

/**
 * One field changed, with what follows from it: Straight fills in an age, an
 * age statement is offered as a designation is ticked, and Bottled In Bond
 * sets 100 proof.
 */
export function withLabelChange(
  prev: Record<string, FieldValue>,
  name: string,
  value: FieldValue,
): Record<string, FieldValue> {
  const next = withAgeDefaults(prev, { ...prev, [name]: value }, name);
  if (name === "isBottledInBond" && value === true) next.proof = BOND_PROOF;
  return next;
}

/** The Scotch regions, as buttons: a blend comes from several. */
function RegionPicker({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: string[];
  onChange: (regions: string[]) => void;
}) {
  return (
    <fieldset className="col-span-full flex flex-col gap-2 border border-border p-4">
      <legend className="px-1 text-sm font-medium">Regions</legend>
      <p className="-mt-1 text-xs text-muted-foreground">
        Where the whisky comes from; pick several for a blend. Linking a distillery that has a region adds it here.
      </p>
      <div className="flex flex-wrap gap-2">
        {SCOTCH_REGIONS.map((region) => {
          const on = value.includes(region);
          return (
            <Button
              key={region}
              id={`${idPrefix}-region-${region}`}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((r) => r !== region) : [...value, region])}
            >
              {region}
            </Button>
          );
        })}
      </div>
      <input type="hidden" name="regions" value={value.join(", ")} />
    </fieldset>
  );
}

/**
 * The label's fields and its three ordered lists, without a form around
 * them: New Label and Edit Label wrap them in their own form, and the
 * search-first Add bottle page puts them above the bottle's in one save.
 *
 * What shows depends on the category (see `rules`): vodka and unaged gin have
 * no age, Straight is American, Scotch has regions, and rum records its base
 * where other spirits list a mashbill.
 */
export function ExpressionFields({
  values,
  onChange,
  links,
  onLinksChange,
  options,
  onOptionCreated,
  categoryGroups,
  categoryKinds,
  errors,
  idPrefix = "expression",
}: {
  values: Record<string, FieldValue>;
  onChange: (name: string, value: FieldValue) => void;
  links: LabelLinks;
  onLinksChange: (links: LabelLinks) => void;
  options: Record<string, Option[]>;
  onOptionCreated: (name: string, option: Option) => void;
  /** categoryId -> field group, so sections react without a round trip. */
  categoryGroups: Record<number, FieldGroup>;
  /** categoryId -> which whiskey it is; without it Straight is always offered. */
  categoryKinds?: Record<number, CategoryKind>;
  errors: Record<string, string>;
  idPrefix?: string;
}) {
  const categoryRaw = values.categoryId;
  const categoryId = typeof categoryRaw === "string" && categoryRaw !== "" ? Number(categoryRaw) : null;
  const fieldGroup: FieldGroup = (categoryId !== null ? categoryGroups[categoryId] : undefined) ?? "other";
  const kind: CategoryKind | null = categoryKinds ? (categoryId !== null ? (categoryKinds[categoryId] ?? "other") : "other") : null;

  // A gin is unaged until it is marked aged; one that already has an age opens as aged.
  const [ginChoice, setGinChoice] = React.useState<boolean | null>(null);
  const ginAged = ginChoice ?? looksAged(values, links.finishes.length);
  const context = { group: fieldGroup, kind, values, ginAged };
  const hidden = hiddenFields(context);
  const regions = parseRegions(values.regions);
  // With an age filled in the statement is greyed out; triple-clicking it makes it editable again.
  const [statementOpen, setStatementOpen] = React.useState(false);
  const ageGreyed = ageFilled(values) && !statementOpen;

  const bondField = LABEL_FIELDS.find((field) => field.name === "isBottledInBond");
  const baseField = LABEL_FIELDS.find((field) => field.name === "molassesOrCane");
  const bonded = fieldGroup === "whiskey" && !hidden.has("isBottledInBond") && values.isBottledInBond === true;

  /** A linked distillery brings its Scotch region along. */
  const changeLinks = (next: LabelLinks) => {
    onLinksChange(next);
    if (!showsRegions(context)) return;
    const known = new Set(links.distilleries.map((row) => row.id));
    const brought = next.distilleries
      .filter((row) => !known.has(row.id))
      .map((row) => options.distilleryLinks?.find((option) => option.value === row.id)?.region)
      .filter((region): region is string => region !== undefined && !regions.includes(region));
    if (brought.length > 0) onChange("regions", [...new Set([...regions, ...brought])].join(", "));
  };

  const renderField = (field: FieldSpec) => {
    // Proof/ABV and the age triplet render as linked composites
    // rather than the generic field, but stay in `fields` above
    // so validation and per-category writability still see them.
    if (field.name === "proof") {
      return (
        <ProofAbvFields
          key={field.name}
          idPrefix={idPrefix}
          value={values.proof ?? ""}
          onChange={(next) => onChange("proof", next)}
          error={errors.proof}
          locked={bonded}
        />
      );
    }
    if (field.name === "ageMonths" || field.name === "ageDays") return null;
    if (hidden.has(field.name)) return null;
    // The slug is made from the name, so it is not asked for; a saved one is carried through unchanged.
    if (field.name === "slug") return <input key="slug" type="hidden" name="slug" value={String(values.slug ?? "")} />;
    if (field.name === "ageYears") {
      return (
        <AgeFields
          key="age"
          idPrefix={idPrefix}
          values={{
            ageYears: values.ageYears ?? "",
            ageMonths: values.ageMonths ?? "",
            ageDays: values.ageDays ?? "",
          }}
          onChange={(name, next) => onChange(name, next)}
          errors={{
            ageYears: errors.ageYears,
            ageMonths: errors.ageMonths,
            ageDays: errors.ageDays,
          }}
        />
      );
    }
    return (
      <Field
        key={field.name}
        spec={
          field.name === "ageStatement" && ageGreyed
            ? { ...field, help: "Greyed out while an age is filled in. Triple-click to edit anyway." }
            : field
        }
        idPrefix={idPrefix}
        value={values[field.name] ?? ""}
        onChange={(next) => onChange(field.name, next)}
        error={errors[field.name]}
        options={options[field.name] ?? []}
        onOptionCreated={(option) => onOptionCreated(field.name, option)}
        locked={field.name === "ageStatement" && ageGreyed}
        onUnlock={() => setStatementOpen(true)}
      />
    );
  };

  return (
    <>
      {EXPRESSION_SECTIONS.map((section) => {
        if (!sectionVisible(section, fieldGroup, values)) return null;
        return (
          <Section key={section.id}>
            <SectionHeader>
              <SectionTitle>{section.title}</SectionTitle>
              {section.description ? <SectionDescription>{section.description}</SectionDescription> : null}
            </SectionHeader>
            <SectionContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.id === "strength" && fieldGroup === "gin" ? (
                <div className="col-span-full flex items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant={ginAged ? "default" : "outline"}
                    aria-pressed={ginAged}
                    onClick={() => setGinChoice(!ginAged)}
                  >
                    Aged
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {ginAged ? "Age, age statement and finishes apply." : "Gin is unaged unless you say it was aged."}
                  </span>
                </div>
              ) : null}
              {section.fields.map((field) => {
                // Bottled In Bond and Regions belong to the whiskey section but are drawn elsewhere;
                // rum's Base is drawn with the origin lists.
                if (field.name === "regions" || field.name === "isBottledInBond" || field.name === "molassesOrCane") {
                  return null;
                }
                const drawn = renderField(field);
                if (field.name === "isCaskStrength" && bondField && fieldGroup === "whiskey" && !hidden.has("isBottledInBond")) {
                  return (
                    <React.Fragment key={field.name}>
                      {drawn}
                      <Field
                        spec={bondField}
                        idPrefix={idPrefix}
                        value={values.isBottledInBond ?? false}
                        onChange={(next) => onChange("isBottledInBond", next)}
                        error={errors.isBottledInBond}
                      />
                    </React.Fragment>
                  );
                }
                return drawn;
              })}
            </SectionContent>
          </Section>
        );
      })}

      <Section>
        <SectionHeader>
          <SectionTitle>Where it came from</SectionTitle>
          <SectionDescription>
            A blend has several of each, and the order matters. These are real links, so a distillery&rsquo;s page will
            list this label among its contributions.
          </SectionDescription>
        </SectionHeader>
        <SectionContent className="grid grid-cols-1 gap-4">
          {showsRegions(context) ? (
            <RegionPicker idPrefix={idPrefix} value={regions} onChange={(next) => onChange("regions", next.join(", "))} />
          ) : null}
          <OrderedPicker
            name="distilleryLinks"
            label="Distilleries"
            description="Every distillery that contributed, in the order you would list them. Tick Inferred when the label does not name it and you worked it out elsewhere."
            resource="distilleries"
            options={options.distilleryLinks ?? []}
            amountLabel="Share"
            amountSuffix="%"
            amountMax={100}
            inferable
            undisclosable
            value={links.distilleries}
            onChange={(rows) => changeLinks({ ...links, distilleries: rows })}
          />
          {baseReplacesMashbills(fieldGroup) && baseField ? (
            <>
              <Field
                spec={{ ...baseField, help: "What the rum is made from." }}
                idPrefix={idPrefix}
                value={values.molassesOrCane ?? ""}
                onChange={(next) => onChange("molassesOrCane", next)}
                error={errors.molassesOrCane}
              />
              {/* Rum has no mashbill list, but one it already has is kept. */}
              <input type="hidden" name="mashbillLinks" value={serializeLinks(links.mashbills)} />
            </>
          ) : (
            <OrderedPicker
              name="mashbillLinks"
              label="Mashbills"
              description="One per contributing recipe. A blend of three has three. With more than one distillery above, say which one made each."
              resource={null}
              emptyHint="No mashbills yet — add a new one from here."
              options={options.mashbillLinks ?? []}
              amountLabel="Share"
              amountSuffix="%"
              amountMax={100}
              value={links.mashbills}
              onChange={(rows) => onLinksChange({ ...links, mashbills: rows })}
              distilleryChoices={links.distilleries.map((d) => ({ id: d.id, name: d.label }))}
            />
          )}
          {showsFinishes(context) ? (
            <OrderedPicker
              name="finishLinks"
              label="Finishes"
              description="In sequence, for a double or triple finish."
              resource="finishes"
              options={options.finishLinks ?? []}
              amountLabel="Months"
              amountSuffix="mo"
              value={links.finishes}
              onChange={(rows) => onLinksChange({ ...links, finishes: rows })}
            />
          ) : (
            // Vodka never has finishes, but any it already has are kept; an unaged gin has none.
            <input
              type="hidden"
              name="finishLinks"
              value={serializeLinks(fieldGroup === "vodka" ? links.finishes : [])}
            />
          )}
        </SectionContent>
      </Section>
    </>
  );
}

/** The photo about to be saved: the chosen file, or the linked picture, so a wrong pick is seen before it is kept. */
function PhotoPreview({ file, link }: { file: File | null; link: string }) {
  const [read, setRead] = React.useState<{ file: File; url: string } | null>(null);
  const [brokenLink, setBrokenLink] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file) return;
    // A data URL rather than an object URL: it needs no revoking, and survives the effect running twice.
    const reader = new FileReader();
    reader.onload = () => setRead({ file, url: String(reader.result) });
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);

  const src = file ? (read?.file === file ? read.url : null) : /^https?:\/\//i.test(link) ? link : null;
  if (!src) return null;
  if (!file && brokenLink === link) {
    return <p className="col-span-full text-sm text-muted-foreground">That link does not show a picture.</p>;
  }
  return (
    <div className="col-span-full flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Preview</span>
      {/* A plain img: the source is a blob or someone else's URL, which next/image cannot optimise. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Label photo preview"
        className="max-h-64 w-fit max-w-full border border-border bg-muted/30 object-contain"
        onError={() => setBrokenLink(link)}
      />
    </div>
  );
}

export function ExpressionForm({
  expressionId,
  initialValues,
  initialLinks,
  initialOtherNames = "",
  initialReleases = [],
  releaseImpact = {},
  options,
  categoryGroups,
  categoryKinds,
  colaLookup = false,
}: {
  expressionId: number | null;
  initialValues: Record<string, string | number | boolean | null> | null;
  initialLinks: { distilleries: LinkedRow[]; mashbills: LinkedRow[]; finishes: LinkedRow[] };
  /** Older names, one per line, as `otherNamesText` writes them. */
  initialOtherNames?: string;
  /** Known releases, as `releaseRow` shapes them. */
  initialReleases?: ReleaseRow[];
  /** By release id: what removing it would affect, for the confirm before it goes. */
  releaseImpact?: Record<string, string>;
  options: Record<string, Option[]>;
  /** categoryId -> field group, so sections react without a round trip. */
  categoryGroups: Record<number, FieldGroup>;
  /** categoryId -> which whiskey it is, for Straight and Scotch regions. */
  categoryKinds?: Record<number, CategoryKind>;
  /** Whether TTB's registry can be searched; on New Label, for picking approvals to attach. */
  colaLookup?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState(() => initialFieldValues(LABEL_FIELDS, initialValues));
  const [optionsByField, setOptionsByField] = React.useState(options);
  const [links, setLinks] = React.useState(initialLinks);

  const action = saveExpressionAction.bind(null, expressionId);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, IDLE_RESULT);

  // A new label's photo, held until the label exists: the photo route needs its id.
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoLink, setPhotoLink] = React.useState("");
  const photo = React.useRef({ file: photoFile, link: photoLink });
  React.useEffect(() => {
    photo.current = { file: photoFile, link: photoLink.trim() };
  }, [photoFile, photoLink]);

  const saved = state.ok && state.message !== "";
  const bottleId = state.ok ? state.bottleId : undefined;
  const savedId = state.ok ? state.createdId : undefined;
  React.useEffect(() => {
    if (!saved) return;
    let cancelled = false;
    void (async () => {
      const { file, link } = photo.current;
      let photoFailed = false;
      if (expressionId === null && savedId !== undefined && (file || link !== "")) {
        const body = new FormData();
        if (file) body.append("photo", file);
        else body.append("imageUrl", link);
        const result = await fetch(`/api/expressions/${savedId}/photo`, { method: "POST", body })
          .then((response) => response.json() as Promise<ActionResult>)
          .catch(() => null);
        photoFailed = !result?.ok;
      }
      if (cancelled) return;
      // A failed photo lands on the label's page, which says so; the label is kept.
      // With a bottle just added, land on its edit page to fill in price, store,
      // etc.; otherwise on the label's own page.
      router.push(
        photoFailed
          ? `/expressions/${savedId}?photo=failed`
          : bottleId !== undefined
            ? `/bottles/${bottleId}/edit`
            : savedId !== undefined
              ? `/expressions/${savedId}`
              : "/expressions",
      );
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [saved, bottleId, savedId, state, router, expressionId]);

  const fieldErrors = !state.ok && state.fieldErrors ? state.fieldErrors : {};
  const set = (name: string, value: FieldValue) => setValues((prev) => withLabelChange(prev, name, value));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <ExpressionFields
        values={values}
        onChange={set}
        links={links}
        onLinksChange={setLinks}
        options={optionsByField}
        onOptionCreated={(name, option) => setOptionsByField((prev) => withOption(prev, name, option))}
        categoryGroups={categoryGroups}
        {...(categoryKinds ? { categoryKinds } : {})}
        errors={fieldErrors}
      />

      <Section>
        <SectionHeader>
          <SectionTitle>Other / old names</SectionTitle>
          <SectionDescription>
            Names this label has gone by. A bottle can say which version it is, and a search finds the label under any
            of them.
          </SectionDescription>
        </SectionHeader>
        <SectionContent>
          <RowListEditor
            name="otherNames"
            idPrefix="expression-otherName"
            addLabel="Add an older name"
            columns={[
              { key: "name", label: "Name", placeholder: "Old Grand-Dad Bonded" },
              { key: "yearFrom", label: "From", placeholder: "1980", inputMode: "numeric", pattern: "\\d{4}", title: "A four-digit year", className: "sm:w-24" },
              { key: "yearTo", label: "Until", placeholder: "1995", inputMode: "numeric", pattern: "\\d{4}", title: "A four-digit year", className: "sm:w-24" },
            ]}
            initialRows={parseOtherNames(initialOtherNames).names.map((n) => ({
              name: n.name,
              yearFrom: n.yearFrom === null ? "" : String(n.yearFrom),
              yearTo: n.yearTo === null ? "" : String(n.yearTo),
            }))}
            toText={otherNamesRowsText}
            error={fieldErrors.otherNames}
          />
        </SectionContent>
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>Known releases</SectionTitle>
          <SectionDescription>
            Batches or yearly editions of this label. A bottle can say which one it is, and takes its proof, age and
            MSRP unless the bottle says otherwise. Leave a box blank to use the label&apos;s.
          </SectionDescription>
        </SectionHeader>
        <SectionContent>
          <RowListEditor
            name="releases"
            idPrefix="expression-release"
            addLabel="Add a release"
            columns={[
              { key: "name", label: "Name", placeholder: "2024-01 Springfield" },
              { key: "year", label: "Year", placeholder: "2024", inputMode: "numeric", pattern: "\\d{4}", title: "A four-digit year", className: "sm:w-20" },
              { key: "proof", label: "Proof", kind: "proofAbv", className: "sm:w-24" },
              { key: "ageYears", label: "Years", placeholder: "7", inputMode: "decimal", pattern: "\\d+(\\.\\d)?", title: "Years, like 7 or 7.5", className: "sm:w-16" },
              { key: "ageMonths", label: "Months", placeholder: "2", inputMode: "numeric", pattern: "\\d+", title: "Whole months", className: "sm:w-16" },
              { key: "ageDays", label: "Days", placeholder: "3", inputMode: "numeric", pattern: "\\d+", title: "Whole days", className: "sm:w-16" },
              { key: "msrp", label: "MSRP", placeholder: "99.99", inputMode: "decimal", pattern: "\\$?\\d+(\\.\\d{1,2})?", title: "A price, like 99.99", className: "sm:w-24" },
            ]}
            initialRows={initialReleases}
            toText={(rows) => JSON.stringify(rows)}
            removeWarning={(row) => releaseImpact[row.id ?? ""] ?? null}
            error={fieldErrors.releases}
          />
        </SectionContent>
      </Section>

      {expressionId === null ? (
        // A new label's approvals, attached on create (SPEC M11). An existing
        // label's are managed below its form instead, saved as they are added.
        <PendingColas
          className="border-t border-foreground pt-3"
          brandName={optionsByField.brandId?.find((option) => String(option.value) === String(values.brandId))?.label ?? ""}
          labelName={typeof values.name === "string" ? values.name : ""}
          distilleryIds={links.distilleries.map((row) => row.id).filter((id) => id > 0)}
          lookupEnabled={colaLookup}
        />
      ) : null}

      {expressionId === null ? (
        <Section>
          <SectionHeader>
            <SectionTitle>Photo</SectionTitle>
            <SectionDescription>Optional. A file or a link; it is cut out from its background once the label is saved.</SectionDescription>
          </SectionHeader>
          <SectionContent className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expression-photo">Upload</Label>
              <Input
                id="expression-photo"
                type="file"
                accept="image/*"
                disabled={photoLink.trim() !== ""}
                onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expression-photo-link">Or a link</Label>
              <Input
                id="expression-photo-link"
                type="url"
                inputMode="url"
                placeholder="https://"
                disabled={photoFile !== null}
                value={photoLink}
                onChange={(event) => setPhotoLink(event.target.value)}
              />
            </div>
            <PhotoPreview file={photoFile} link={photoLink.trim()} />
          </SectionContent>
        </Section>
      ) : null}

      {!state.ok && state.error ? (
        <p
          role="alert"
          className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {expressionId ? (
          <div className="sm:mr-auto">
            <DeleteExpressionButton expressionId={expressionId} name={String(values.name ?? "This label")} />
          </div>
        ) : null}
        <Button type="button" variant="outline" asChild>
          <Link href={expressionId ? `/expressions/${expressionId}` : "/expressions"}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {expressionId ? "Save Label" : "Create Label"}
        </Button>
        {expressionId === null ? (
          <Button type="submit" name="addBottle" value="1" variant="outline" disabled={pending}>
            Create Label &amp; Add Bottle
          </Button>
        ) : null}
      </div>
    </form>
  );
}
