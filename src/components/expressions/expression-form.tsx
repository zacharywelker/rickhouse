"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { Field, initialFieldValues, type FieldValue } from "@/components/forms/field";
import { withOption } from "@/lib/forms/values";
import { saveExpressionAction } from "@/app/(app)/expressions/actions";
import { EXPRESSION_SECTIONS, sectionVisible } from "@/lib/expressions/fields";
import { IDLE_RESULT, type ActionResult, type FieldSpec, type Option } from "@/lib/admin/types";
import type { FieldGroup } from "@/db/schema";
import { ageFilled, withAgeDefaults } from "@/lib/bottles/age";
import { cn } from "@/lib/utils";
import {
  BOND_PROOF,
  STRENGTH_TIER_LABELS,
  followsProof,
  hiddenFields,
  isSingleMaltCategory,
  looksAged,
  nameContextFor,
  nameSays,
  parseRegions,
  proofSpread,
  spreadLabel,
  showsFinishes,
  showsRegions,
  strengthTier,
  withNameRules,
  type CategoryKind,
  type NameContext,
  type ProofSpread,
} from "@/lib/expressions/rules";
import { SCOTCH_REGIONS } from "@/db/schema";
import type { IngredientChoice } from "@/lib/expressions/spirit-details";
import { BRANDY_MINIMUM_YEARS, countryForDistillery, isAgaveKind } from "@/lib/expressions/spirit-details";
import { isGinKind } from "@/lib/expressions/gin-details";
import { IngredientPicker } from "./ingredient-picker";
import { DeriveAge } from "./bottle-form";
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

/** The section each field belongs to, for the spirit-by-spirit rule when a line draws fields from several. */
const SECTION_OF: ReadonlyMap<string, (typeof EXPRESSION_SECTIONS)[number]> = new Map(
  EXPRESSION_SECTIONS.flatMap((section) => section.fields.map((field) => [field.name, section] as const)),
);

export type LabelLinks = { distilleries: LinkedRow[]; mashbills: LinkedRow[]; finishes: LinkedRow[]; ingredients?: IngredientChoice[] };

export const EMPTY_LINKS: LabelLinks = { distilleries: [], mashbills: [], finishes: [], ingredients: [] };

/**
 * One field changed, with what follows from it: Straight and Bottled In Bond
 * fill in an age, NAS offers its age statement, Bottled In Bond sets 100 proof,
 * and a name that starts to say Cask Strength, Bonded or Full Proof acts on it.
 */
export function withLabelChange(
  prev: Record<string, FieldValue>,
  name: string,
  value: FieldValue,
  /** What the name can say depends on the category; without it the name says nothing. */
  resolve?: (values: Record<string, FieldValue>) => NameContext,
): Record<string, FieldValue> {
  const next = withAgeDefaults(prev, { ...prev, [name]: value }, name);
  if (name === "isBottledInBond" && value === true) next.proof = BOND_PROOF;
  return resolve ? withNameRules(prev, next, resolve) : next;
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
  photoSlot,
  spread = null,
}: {
  values: Record<string, FieldValue>;
  onChange: (name: string, value: FieldValue) => void;
  /** Drawn at the left of Identity, with the fields beside it: New Label's photo box. */
  photoSlot?: React.ReactNode;
  /** Proofs this label's releases and bottles span, for a cask-strength label, whose own proof is not one number. */
  spread?: ProofSpread | null;
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
  const singleMalt = isSingleMaltCategory(options.categoryId?.find((option) => option.value === categoryId)?.slug);
  const kind: CategoryKind | null = categoryKinds ? (categoryId !== null ? (categoryKinds[categoryId] ?? "other") : "other") : null;

  // A gin is unaged until it is marked aged; one that already has an age opens as aged.
  const ginAged = values.isAgedGin === true || (values.isAgedGin == null && looksAged(values, links.finishes.length));
  const context = { group: fieldGroup, kind, values, ginAged };
  const hidden = hiddenFields(context);
  const regions = parseRegions(values.regions);
  // NAS greys out the age and its statement, and an age filled in greys out the statement; Cask Strength greys out
  // the proof, and Full Proof the Entry Proof. Triple-clicking a greyed box makes it editable again.
  const [forced, setForced] = React.useState<ReadonlySet<string>>(new Set());
  const unlock = (group: string) => setForced((now) => new Set(now).add(group));
  const nas = values.isNas === true;
  const ageGreyed = nas && !forced.has("age");
  const statementGreyed = (nas || ageFilled(values)) && !forced.has("age");
  const proofGreyed = values.isCaskStrength === true && !hidden.has("isCaskStrength") && !forced.has("proof");
  const nameContext: NameContext = { group: fieldGroup, kind };
  const says = nameSays(values.name, nameContext);
  const entryGreyed = followsProof(values.name, nameContext) && !forced.has("entry");
  const change = (name: string, value: FieldValue) => {
    if (name === "isNas") setForced((now) => (now.has("age") ? new Set([...now].filter((g) => g !== "age")) : now));
    if (name === "isCaskStrength") setForced((now) => (now.has("proof") ? new Set([...now].filter((g) => g !== "proof")) : now));
    onChange(name, value);
  };

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
          onChange={(next) => change("proof", next)}
          error={errors.proof}
          locked={bonded}
          greyed={proofGreyed && !bonded}
          onUnlock={() => unlock("proof")}
          hint={false}
          className="w-28"
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
          compact
          locked={ageGreyed}
          onUnlock={() => unlock("age")}
          values={{
            ageYears: values.ageYears ?? "",
            ageMonths: values.ageMonths ?? "",
            ageDays: values.ageDays ?? "",
          }}
          onChange={(name, next) => change(name, next)}
          errors={{
            ageYears: errors.ageYears,
            ageMonths: errors.ageMonths,
            ageDays: errors.ageDays,
          }}
        />
      );
    }
    const entry = field.name === "entryProof";
    const greyed = (field.name === "ageStatement" && statementGreyed) || (entry && entryGreyed);
    return (
      <Field
        key={field.name}
        spec={
          field.name === "ageStatement" && statementGreyed
            ? {
                ...field,
                help: nas
                  ? "Greyed out for NAS. Triple-click to edit anyway."
                  : "Greyed out while an age is filled in. Triple-click to edit anyway.",
              }
            : field.name === "brandyGrade" && kind && BRANDY_MINIMUM_YEARS[kind] && values.brandyGrade
              ? { ...field, help: `At least ${BRANDY_MINIMUM_YEARS[kind]![String(values.brandyGrade) as "VS" | "VSOP" | "XO"]} years. Enter an exact age only when known.` }
            : entry && entryGreyed
              ? { ...field, help: "Follows Proof, as the name says Full Proof. Triple-click to edit anyway." }
              : field
        }
        idPrefix={idPrefix}
        value={values[field.name] ?? ""}
        onChange={(next) => change(field.name, next)}
        error={errors[field.name]}
        options={options[field.name] ?? []}
        onOptionCreated={(option) => onOptionCreated(field.name, option)}
        locked={greyed}
        onUnlock={() => unlock(entry ? "entry" : "age")}
      />
    );
  };

  /** One line of a section: the fields it names, side by side, skipping any this spirit does not have. */
  const renderRow = (names: ReadonlyArray<string>, key: number) => {
    const tier = strengthTier(fieldGroup, values.proof);
    const cells = names.map((name) => {
      if (name === "@dates") {
        return hidden.has("barrelFilledOn") ? null : <DeriveAge key={name} values={values} set={change} className="" />;
      }
      if (name === "@tier") {
        return tier ? (
          <span key={name} className="self-end pb-2.5 text-sm font-medium text-accent">
            {STRENGTH_TIER_LABELS[tier]}
          </span>
        ) : null;
      }
      const field = LABEL_FIELDS.find((candidate) => candidate.name === name);
      const owner = SECTION_OF.get(name);
      if (!field || (owner?.fieldGroups && !owner.fieldGroups.includes(fieldGroup))) return null;
      // Bottled In Bond is an American whiskey designation; the other spirits never see it.
      if (name === "isBottledInBond" && (fieldGroup !== "whiskey" || hidden.has(name))) return null;
      return renderField(field);
    });
    if (cells.every((cell) => cell === null)) return null;
    // Proof's line explains what the name did and, for a cask-strength label, why the proof is greyed.
    const notes: string[] = [];
    if (names.includes("proof")) {
      if (says.isCaskStrength && values.isCaskStrength === true) notes.push(`Cask Strength, as the name says “${says.isCaskStrength}”.`);
      if (says.isBottledInBond && values.isBottledInBond === true) notes.push(`Bottled In Bond, as the name says “${says.isBottledInBond}”.`);
      if (proofGreyed && !bonded) notes.push(spreadLabel(spread));
    }
    return (
      <div key={key} className="flex flex-wrap items-start gap-x-4 gap-y-3">
        {cells}
        {notes.map((note) => (
          <p key={note} className="basis-full text-xs text-muted-foreground">
            {note}
          </p>
        ))}
      </div>
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
            {section.rows ? (
              <SectionContent className={cn(section.id === "identity" && photoSlot && "flex flex-col gap-5 sm:flex-row")}>
                {section.id === "identity" ? photoSlot : null}
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                  {section.rows.map((row, index) => renderRow(row, index))}
                </div>
              </SectionContent>
            ) : (
              <SectionContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {section.fields.map((field) => {
                  // Bottled In Bond and Regions belong to the whiskey section but are drawn elsewhere.
                  if (field.name === "regions" || field.name === "isBottledInBond") return null;
                  return renderField(field);
                })}
              </SectionContent>
            )}
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
            label={fieldGroup === "rum" ? "Distilleries / Estates" : "Distilleries"}
            description="Every distillery that contributed, in the order you would list them. Tick Inferred when the label does not name it and you worked it out elsewhere."
            resource="distilleries"
            options={(options.distilleryLinks ?? []).filter((option) => !option.country || countryForDistillery(kind, option.country))}
            {...(isAgaveKind(kind) ? { defaultCountry: "Mexico" } : kind === "cognac" || kind === "armagnac" || kind === "calvados" ? { defaultCountry: "France" } : kind === "pisco" ? { defaultCountry: "Peru" } : {})}
            amountLabel="Share"
            amountSuffix="%"
            amountMax={100}
            inferable
            undisclosable
            value={links.distilleries}
            onChange={(rows) => changeLinks({ ...links, distilleries: rows })}
          />
          {fieldGroup === "gin" && isGinKind(kind) ? (
            <>
              <IngredientPicker kind="botanical" categoryKind={kind} value={links.ingredients ?? []} hiddenName={null}
                onChange={(selected) => onLinksChange({ ...links, ingredients: [...(links.ingredients ?? []).filter((item) => item.kind !== "botanical"), ...selected] })} />
              <IngredientPicker kind="gin_base" categoryKind={kind} value={links.ingredients ?? []} hiddenName={null}
                onChange={(selected) => onLinksChange({ ...links, ingredients: [...(links.ingredients ?? []).filter((item) => item.kind !== "gin_base"), ...selected] })} />
              <input type="hidden" name="ingredientLinks" value={JSON.stringify(links.ingredients ?? [])} />
              <input type="hidden" name="mashbillLinks" value={serializeLinks(links.mashbills)} />
            </>
          ) : (fieldGroup === "agave" || fieldGroup === "rum" || fieldGroup === "brandy") ? (
            <IngredientPicker
              kind={fieldGroup === "agave" ? "maguey" : fieldGroup === "rum" ? "rum_base" : "distillate"}
              categoryKind={kind}
              value={links.ingredients ?? []}
              onChange={(ingredients) => onLinksChange({ ...links, ingredients })}
            />
          ) : null}
          {fieldGroup === "gin" ? null : fieldGroup === "rum" || fieldGroup === "agave" || fieldGroup === "brandy" ? (
            <>
              {/* Older mashbill links remain stored while the relevant spirit uses ingredients. */}
              <input type="hidden" name="mashbillLinks" value={serializeLinks(links.mashbills)} />
            </>
          ) : singleMalt ? (
            <>
              <div className="border border-border p-4">
                <p className="text-sm font-medium">Mashbill</p>
                <p className="mt-1 text-sm text-muted-foreground">100% Malted Barley</p>
              </div>
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

/** The photo about to be saved, filling its box: the chosen file, or the linked picture, so a wrong pick is seen before it is kept. */
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

  const safeExternalImageUrl = (() => {
    const trimmed = link.trim();
    if (!trimmed) return null;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      if (!/\.(apng|avif|gif|jpe?g|png|svg|webp)$/i.test(parsed.pathname)) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  })();

  const src = file ? (read?.file === file ? read.url : null) : safeExternalImageUrl;
  if (!src) return null;
  if (!file && brokenLink === link) {
    return <p className="absolute inset-0 bg-background p-2 text-xs text-muted-foreground">That link does not show a picture.</p>;
  }
  return (
    // A plain img: the source is a blob or someone else's URL, which next/image cannot optimise.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Label photo preview"
      className="absolute inset-0 size-full bg-background object-contain"
      onError={() => setBrokenLink(link)}
    />
  );
}

/**
 * New Label's photo, always on show: a box where the picture will be, with Add photo and From a link beside it.
 * Held until the label is saved, because the photo route needs the label's id.
 */
function PhotoBox({
  file,
  link,
  onFile,
  onLink,
}: {
  file: File | null;
  link: string;
  onFile: (file: File | null) => void;
  onLink: (link: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [linking, setLinking] = React.useState(false);
  const chosen = file !== null || link.trim() !== "";
  return (
    <div className="flex flex-col gap-2 sm:w-56 sm:shrink-0">
      <div className="flex items-start gap-3">
        <div className="relative flex aspect-[3/4] w-28 shrink-0 items-center justify-center overflow-hidden border border-dashed border-border bg-muted/30 p-2 text-center text-xs text-muted-foreground">
          Photo goes here
          <PhotoPreview file={file} link={link.trim()} />
        </div>
        <div className="flex flex-col items-start gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            {file ? "Replace photo" : "Add photo"}
          </Button>
          <Button type="button" variant="outline" size="sm" aria-expanded={linking} onClick={() => setLinking((on) => !on)}>
            From a link
          </Button>
          {chosen ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onFile(null);
                onLink("");
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Remove
            </Button>
          ) : null}
          <input
            ref={inputRef}
            id="expression-photo"
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Upload label photo"
            onChange={(event) => {
              onFile(event.target.files?.[0] ?? null);
              if (event.target.files?.[0]) onLink("");
            }}
          />
        </div>
      </div>
      {linking || link.trim() !== "" ? (
        <Input
          id="expression-photo-link"
          type="url"
          inputMode="url"
          placeholder="https://"
          aria-label="Or a link"
          value={link}
          onChange={(event) => {
            onLink(event.target.value);
            if (event.target.value.trim() !== "") {
              onFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }
          }}
        />
      ) : null}
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
  bottleProofs = [],
}: {
  expressionId: number | null;
  initialValues: Record<string, string | number | boolean | null> | null;
  initialLinks: LabelLinks;
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
  /** The proofs this label's bottles carry, for the range a cask-strength label shows in place of one proof. */
  bottleProofs?: string[];
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
  const set = (name: string, value: FieldValue) =>
    setValues((prev) =>
      withLabelChange(prev, name, value, (next) => nameContextFor(next, categoryGroups, categoryKinds)),
    );
  const spread = React.useMemo(
    () => proofSpread(initialReleases.map((release) => release.proof), bottleProofs),
    [initialReleases, bottleProofs],
  );

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
        spread={spread}
        {...(expressionId === null
          ? { photoSlot: <PhotoBox file={photoFile} link={photoLink} onFile={setPhotoFile} onLink={setPhotoLink} /> }
          : {})}
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
