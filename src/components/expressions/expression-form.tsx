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
import { labelLinkSuggestionsAction, saveExpressionAction } from "@/app/(app)/expressions/actions";
import { usePopup } from "@/components/popup/popup";
import { EXPRESSION_SECTIONS, sectionVisible } from "@/lib/expressions/fields";
import { IDLE_RESULT, type ActionResult, type FieldSpec, type Option } from "@/lib/admin/types";
import type { FieldGroup } from "@/db/schema";
import { ageFilled, withAgeDefaults } from "@/lib/bottles/age";
import { matchesMashbillCategory } from "@/lib/mashbills";
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
  proofAfterBondToggle,
  proofSpread,
  spreadLabel,
  showsFinishes,
  BARREL_TYPE_SUGGESTIONS,
  barrelTypeKind,
  showsRegions,
  strengthTier,
  withNameRules,
  type CategoryKind,
  type NameContext,
  type ProofSpread,
} from "@/lib/expressions/rules";
import { countryForDistillery, effectiveDairy, piscoCountry, piscoStyle, stillForCountry } from "@/lib/expressions/spirit-details";
import { appellationNote } from "@/lib/expressions/derived-designation";
import { specForKind, withProduction } from "@/lib/expressions/kind-options";
import { SHEET_LAYOUT } from "@/lib/expressions/sheet-layout";
import { ChipField } from "@/components/sheet/chips";
import { SheetRow } from "@/components/sheet/sheet-row";
import { NewLookToggle, useNewLook } from "@/components/sheet/use-new-look";
import { withDerivedDesignation } from "@/lib/expressions/derived-designation";
import type { LinkedRow } from "./ordered-picker";
import { RegionPicker } from "./region-picker";
import { OTHER_NAME_COLUMNS, otherNameRows, RELEASE_COLUMNS } from "./label-list-columns";
import { DistilleryPicker, FinishPickers, IngredientPickers, MashbillPicker, type LabelLinks } from "./label-link-pickers";
import { DeriveAge } from "./bottle-form";
import { ProofAbvFields } from "./proof-abv-field";
import { AgeFields } from "./age-fields";
import { DeleteExpressionButton } from "./delete-expression-button";
import { PendingColas } from "./cola-approvals";
import { RowListEditor } from "./row-list-editor";
import { otherNamesRowsText, parseOtherNames } from "@/lib/other-names";
import type { ReleaseRow } from "@/lib/releases";
import { withStatementAge } from "@/lib/expressions/whiskey-age";

/** Every field on the label form, for seeding state from a row or from nothing. */
export const LABEL_FIELDS: FieldSpec[] = EXPRESSION_SECTIONS.flatMap((section) => section.fields);

/** Additive Free is a checkbox for whiskey and a three-state select for agave. */
export function initialLabelValues(
  existing: Record<string, string | number | boolean | null> | null,
  categoryGroups: Record<number, FieldGroup>,
): Record<string, FieldValue> {
  const values = initialFieldValues(LABEL_FIELDS, existing);
  if (categoryGroups[Number(existing?.categoryId)] === "whiskey") values.isAdditiveFree = existing?.isAdditiveFree === true;
  // Dairy is stated or it takes its kind's default (Cream is dairy); the select has no "unknown", so a new label must not start on its first option.
  values.dairyStatus = typeof existing?.dairyStatus === "string" ? existing.dairyStatus : "unknown";
  return values;
}

/** The section each field belongs to, for the spirit-by-spirit rule when a line draws fields from several. */
const SECTION_OF: ReadonlyMap<string, (typeof EXPRESSION_SECTIONS)[number]> = new Map(
  EXPRESSION_SECTIONS.flatMap((section) => section.fields.map((field) => [field.name, section] as const)),
);

export type { LabelLinks };

export const EMPTY_LINKS: LabelLinks = { distilleries: [], mashbills: [], finishes: [], ingredients: [] };

/**
 * One field changed, with what follows from it: Straight and Bottled In Bond
 * fill in an age, NAS offers its age statement, Bottled In Bond sets 100 proof,
 * and a name that starts to say Cask Strength, Bonded or Full Proof acts on it.
 */
const STILL_FOR_APPELLATION: Record<string, string> = { "pays-d-auge": "pot", domfrontais: "column" };

export function withLabelChange(
  prev: Record<string, FieldValue>,
  name: string,
  value: FieldValue,
  /** What the name can say depends on the category; without it the name says nothing. */
  resolve?: (values: Record<string, FieldValue>) => NameContext,
): Record<string, FieldValue> {
  let next = withAgeDefaults(prev, { ...prev, [name]: value }, name);
  if (name === "categoryId" && resolve) {
    const group = resolve(next).group;
    if (group === "whiskey") next.isAdditiveFree = next.isAdditiveFree === true || next.isAdditiveFree === "true";
    if (group === "agave") next.isAdditiveFree = next.isAdditiveFree === true ? "true" : typeof next.isAdditiveFree === "string" ? next.isAdditiveFree : "";
  }
  if (resolve?.(next).group === "whiskey") next = withStatementAge(prev, next, name);
  if (resolve) next = withDerivedDesignation(next, name, resolve(next).kind);
  // Pays d'Auge is distilled in a pot still and Domfrontais in a column still.
  if (name === "mezcalProduction") next = withProduction(next, String(value));
  if (name === "calvadosAppellation") next = { ...next, ...(STILL_FOR_APPELLATION[String(value)] ? { stillType: STILL_FOR_APPELLATION[String(value)] } : {}) };
  if (name === "isBottledInBond" && value === true) next.proof = BOND_PROOF;
  return resolve ? withNameRules(prev, next, resolve) : next;
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
  const stashedProof = React.useRef<string | null>(null);
  const categoryRaw = values.categoryId;
  const categoryId = typeof categoryRaw === "string" && categoryRaw !== "" ? Number(categoryRaw) : null;
  const fieldGroup: FieldGroup = (categoryId !== null ? categoryGroups[categoryId] : undefined) ?? "other";
  const categorySlug = options.categoryId?.find((option) => option.value === categoryId)?.slug;
  const singleMalt = isSingleMaltCategory(categorySlug);
  const kind: CategoryKind | null = categoryKinds ? (categoryId !== null ? (categoryKinds[categoryId] ?? "other") : "other") : null;

  // A gin is unaged until it is marked aged; one that already has an age opens as aged.
  const ginAged = values.isAgedGin === true || (values.isAgedGin == null && looksAged(values, links.finishes.length));
  const context = { group: fieldGroup, kind, slug: categorySlug ?? null, values, ginAged };
  const newLook = useNewLook();
  const hidden = hiddenFields(context);
  // A pisco's country follows its distillery's: Mosto Verde is Peru's, and the Puro / Acholado or the class is worked out, not typed.
  const piscoLand = kind === "pisco" ? piscoCountry(links.distilleries.map((row) => options.distilleryLinks?.find((option) => option.value === row.id)?.country)) : null;
  if (kind === "pisco" && piscoLand !== "Peru") hidden.add("isMostoVerde");
  const piscoKind = kind === "pisco"
    ? piscoStyle(piscoLand, (links.ingredients ?? []).filter((item) => item.kind === "distillate" && item.family === "grape").length, values.proof ? Number(values.proof) / 2 : null)
    : null;
  const regions = parseRegions(values.regions);
  // NAS greys out the age and its statement, and an age filled in greys out the statement; Cask Strength greys out
  // the proof, and Full Proof the Entry Proof. Triple-clicking a greyed box makes it editable again.
  const [forced, setForced] = React.useState<ReadonlySet<string>>(new Set());
  const unlock = (group: string) => setForced((now) => new Set(now).add(group));
  const nas = values.isNas === true;
  const ageGreyed = (nas || String(values.ageStatement ?? "").trim() !== "") && !forced.has("age");
  const statementGreyed = (nas || (values.ageYearsSource !== "derived" && ageFilled(values))) && !forced.has("statement");
  const proofGreyed = values.isCaskStrength === true && !hidden.has("isCaskStrength") && !forced.has("proof");
  const nameContext: NameContext = { group: fieldGroup, kind };
  const says = nameSays(values.name, nameContext);
  const entryGreyed = followsProof(values.name, nameContext) && !forced.has("entry");
  const change = (name: string, value: FieldValue) => {
    if (name === "isNas") setForced((now) => new Set([...now].filter((g) => g !== "age" && g !== "statement")));
    if (name === "isCaskStrength") setForced((now) => (now.has("proof") ? new Set([...now].filter((g) => g !== "proof")) : now));
    if (name === "amaroStyle") {
      // A style contributes one botanical. Only style-added choices are
      // removed when it changes; a manually chosen botanical stays.
      const botanical = value === "Carciofo" ? "Artichoke" : value === "Rabarbaro" ? "Rhubarb" : value === "Genepy" ? "Wormwood" : null;
      const manual = (links.ingredients ?? []).filter((item) => item.kind !== "botanical" || item.isManual !== false);
      const present = botanical && manual.some((item) => item.kind === "botanical" && item.name.toLocaleLowerCase() === botanical.toLocaleLowerCase());
      onLinksChange({ ...links, ingredients: botanical && !present ? [...manual, { name: botanical, kind: "botanical", isManual: false }] : manual });
    }
    if (name === "isBottledInBond") {
      const next = proofAfterBondToggle({ bonded: value === true, proof: String(values.proof ?? ""), stashed: stashedProof.current });
      stashedProof.current = next.stashed;
      onChange(name, value);
      if (next.proof !== String(values.proof ?? "")) onChange("proof", next.proof);
      return;
    }
    onChange(name, value);
  };

  const categoryOptions = options.categoryId ?? [];
  let mashbillCategory: string | null = null;
  const ancestors = new Set<number>();
  for (let category = categoryOptions.find((option) => option.value === categoryId);
    category && !ancestors.has(category.value);
    category = categoryOptions.find((option) => option.value === category?.parentId)) {
    if (category.slug === "bourbon" || category.slug === "rye") {
      mashbillCategory = category.slug;
      break;
    }
    // Tennessee follows the bourbon recipe rule exactly.
    if (category.slug === "tennessee") {
      mashbillCategory = "bourbon";
      break;
    }
    ancestors.add(category.value);
  }
  const matchesRecipe = (option: Option) => matchesMashbillCategory(option.grains ?? [], mashbillCategory);
  const brand = options.brandId?.find((option) => option.value === Number(values.brandId));
  const distilleryOptions = (options.distilleryLinks ?? []).filter((option) =>
    !option.undisclosed && (!option.country || countryForDistillery(kind, option.country)),
  );
  const mashbillOptions = (options.mashbillLinks ?? []).filter(matchesRecipe);
  const distilleryKey = links.distilleries.filter((row) => !row.undisclosed).map((row) => row.id).join(",");
  const mashbillKey = links.mashbills.map((row) => row.id).join(",");
  const [pairings, setPairings] = React.useState<Awaited<ReturnType<typeof labelLinkSuggestionsAction>>>([]);
  React.useEffect(() => {
    if (!distilleryKey && !mashbillKey) return;
    let active = true;
    const ids = (key: string) => key ? key.split(",").map(Number) : [];
    void labelLinkSuggestionsAction(ids(distilleryKey), ids(mashbillKey))
      .then((result) => { if (active) setPairings(result); })
      .catch(() => { if (active) setPairings([]); });
    return () => { active = false; };
  }, [distilleryKey, mashbillKey]);

  const bonded = fieldGroup === "whiskey" && !hidden.has("isBottledInBond") && values.isBottledInBond === true;

  /** A linked distillery brings its Scotch region along. */
  const changeLinks = (next: LabelLinks) => {
    onLinksChange(next);
    if (kind === "agricole" && !values.stillType) {
      const added = next.distilleries.filter((row) => !links.distilleries.some((known) => known.id === row.id));
      if (added.some((row) => stillForCountry(options.distilleryLinks?.find((option) => option.value === row.id)?.country) === "column")) onChange("stillType", "column");
    }
    if (!showsRegions(context)) return;
    const known = new Set(links.distilleries.map((row) => row.id));
    const brought = next.distilleries
      .filter((row) => !known.has(row.id))
      .map((row) => options.distilleryLinks?.find((option) => option.value === row.id)?.region)
      .filter((region): region is string => region !== undefined && !regions.includes(region));
    if (brought.length > 0) onChange("regions", [...new Set([...regions, ...brought])].join(", "));
  };

  const mashbillsForDistillery = (distillery: LinkedRow) => (
    <LinkSuggestions
      label="Common mashbills"
      options={pairings.filter((pair) => pair.distilleryId === distillery.id).flatMap((pair) => {
        const option = mashbillOptions.find((item) => item.value === pair.mashbillId);
        return option && !links.mashbills.some((row) => row.id === option.value) ? [option] : [];
      })}
      onSelect={(option) => onLinksChange({
        ...links,
        mashbills: [...links.mashbills, {
          id: option.value, label: option.label, hint: option.hint, amount: "", distilleryId: distillery.id,
        }],
      })}
    />
  );

  const distilleriesForMashbill = (mashbill: LinkedRow) => {
    const named = links.distilleries.filter((row) => !row.undisclosed);
    if ((named.length === 1 && links.distilleries.length === 1) || named.some((row) => row.id === mashbill.distilleryId)) return null;
    return (
      <LinkSuggestions
        label="Common distilleries"
        options={pairings.filter((pair) => pair.mashbillId === mashbill.id).flatMap((pair) => {
          const option = distilleryOptions.find((item) => item.value === pair.distilleryId);
          return option ? [option] : [];
        })}
        onSelect={(option) => changeLinks({
          ...links,
          distilleries: links.distilleries.some((row) => row.id === option.value)
            ? links.distilleries
            : [...links.distilleries, { id: option.value, label: option.label, hint: option.hint, amount: "" }],
          mashbills: links.mashbills.map((row) => row.id === mashbill.id ? { ...row, distilleryId: option.value } : row),
        })}
      />
    );
  };

  const renderField = (field: FieldSpec, chip = false) => {
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
          chip={chip}
        />
      );
    }
    if (field.name === "ageMonths" || field.name === "ageDays") return null;
    // The age group is drawn by its years field: with years hidden but months or days not, it is still drawn.
    if (hidden.has(field.name) && !(field.name === "ageYears" && !(hidden.has("ageMonths") && hidden.has("ageDays")))) return null;
    if (field.name === "isNonChillFiltered") return (
      <label key={field.name} className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name={field.name}
          checked={values[field.name] === true}
          onChange={(event) => change(field.name, event.target.checked)}
        />
        {field.label}
      </label>
    );
    if (field.name === "peatStatus" && kind === "irish") return (
      <label key="peatStatus" className="flex items-center gap-2 text-sm">
        <input type="hidden" name="peatStatus" value={String(values.peatStatus ?? "unknown")} />
        <input type="checkbox" checked={values.peatStatus === "peated"} onChange={(event) => change("peatStatus", event.target.checked ? "peated" : "unknown")} />
        Peated
      </label>
    );
    if (field.name === "peatStatus" && kind === "scotch") return (
      <fieldset key="peatStatus" className="flex flex-col gap-2 text-sm">
        <legend className="font-medium">Peat</legend>
        <div className="inline-flex w-fit border border-border">
          {(["unknown", "unpeated", "peated"] as const).map((status) => (
            <label key={status} className={`cursor-pointer px-3 py-2 ${values.peatStatus === status || (!values.peatStatus && status === "unknown") ? "bg-foreground text-background" : ""}`}>
              <input className="sr-only" type="radio" name="peatStatus" value={status} checked={(values.peatStatus ?? "unknown") === status} onChange={() => change("peatStatus", status)} />
              {status[0]!.toUpperCase() + status.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>
    );
    // The slug is made from the name, so it is not asked for; a saved one is carried through unchanged.
    if (field.name === "slug") return <input key="slug" type="hidden" name="slug" value={String(values.slug ?? "")} />;
    if (field.name === "ageYears") {
      return (
        <AgeFields
          key="age"
          chip={chip}
          idPrefix={idPrefix}
          compact
          showDays={!hidden.has("ageDays")}
          showYears={!hidden.has("ageYears")}
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
            : field.name === "calvadosAppellation"
              ? { ...field, help: appellationNote(values) ?? field.help }
            : entry && entryGreyed
              ? { ...field, help: "Follows Proof, as the name says Full Proof. Triple-click to edit anyway." }
              : specForKind(field, kind, values)
        }
        idPrefix={idPrefix}
        value={field.name === "dairyStatus" ? effectiveDairy(kind, values.dairyStatus) : (values[field.name] ?? "")}
        onChange={(next) => change(field.name, next)}
        error={errors[field.name]}
        options={options[field.name] ?? []}
        onOptionCreated={(option) => onOptionCreated(field.name, option)}
        locked={greyed}
        onUnlock={() => unlock(entry ? "entry" : "statement")}
        chip={chip}
      />
    );
  };

  /** One line of a section: the fields it names, side by side, skipping any this spirit does not have. */
  /** One cell of a row: a field (drawn by `draw`) or a token, or null where this spirit does not have it. */
  const cellFor = (name: string, draw: (field: FieldSpec) => React.ReactNode): React.ReactNode => {
    const tier = strengthTier(fieldGroup, values.proof);
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
    return draw(field);
  };

  /** Proof's line explains what the name did and, for a cask-strength label, why the proof is greyed. */
  const rowNotes = (names: ReadonlyArray<string>): string[] => {
    const notes: string[] = [];
    if (names.includes("proof")) {
      if (says.isCaskStrength && values.isCaskStrength === true) notes.push(`Cask Strength, as the name says “${says.isCaskStrength}”.`);
      if (says.isBottledInBond && values.isBottledInBond === true) notes.push(`Bottled In Bond, as the name says “${says.isBottledInBond}”.`);
      if (proofGreyed && !bonded) notes.push(spreadLabel(spread));
    }
    return notes;
  };

  /** The data-sheet look of one simple field: a chip, a toggle, a "+" chip (the form's own field for what a chip cannot be). */
  const renderChip = (field: FieldSpec) => {
    const composite = ["brandId", "name", "categoryId", "slug", "proof", "ageYears", "ageMonths", "ageDays", "isNonChillFiltered", "peatStatus"];
    // The name is a chip with no label inside (the value says what it is); brand and category are compact picker chips.
    if (field.name === "name") {
      return <ChipField key="name" bare spec={field} idPrefix={idPrefix} value={values.name ?? ""} onChange={(next) => change("name", next)} error={errors.name} onField={() => renderField(field, true)} />;
    }
    if (composite.includes(field.name) || (hidden.has(field.name))) return renderField(field, true);
    const entry = field.name === "entryProof";
    const greyed = (field.name === "ageStatement" && statementGreyed) || (entry && entryGreyed);
    return (
      <ChipField
        key={field.name} spec={specForKind(field, kind, values)} idPrefix={idPrefix}
        value={values[field.name] ?? ""} onChange={(next) => change(field.name, next)} error={errors[field.name]}
        locked={greyed} onUnlock={() => unlock(entry ? "entry" : "statement")}
        onField={() => renderField(field, true)}
      />
    );
  };

  /** A section's rows in the data-sheet look (null for a section that has no layout yet). */
  const renderSheet = (sectionId: string, extra?: React.ReactNode) => {
    const layout = SHEET_LAYOUT[sectionId];
    if (!layout) return null;
    return (
      <div className="flex min-w-0 flex-col sm:flex-row sm:gap-5">
        <div className="flex min-w-0 flex-1 flex-col border-t border-border">
          {layout.map((row) => {
            const cells = row.items.map((name) => cellFor(name, renderChip));
            if (cells.every((cell) => cell === null)) return null;
            const notes = rowNotes(row.items);
            return (
              <SheetRow key={row.label} label={row.label}>
                {cells}
                {notes.map((note) => <p key={note} className="basis-full text-xs text-muted-foreground">{note}</p>)}
              </SheetRow>
            );
          })}
        </div>
        {extra ? <div className="shrink-0 border-t border-border pt-3 sm:w-28 sm:border-t-0">{extra}</div> : null}
      </div>
    );
  };

  const renderRow = (names: ReadonlyArray<string>, key: number) => {
    const cells = names.map((name) => cellFor(name, renderField));
    if (cells.every((cell) => cell === null)) return null;
    const notes = rowNotes(names);
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
      <input type="hidden" name="ageYearsSource" value={String(values.ageYearsSource ?? "entered")} />
      <input type="hidden" name="originCountryManual" value={values.originCountryManual === true ? "true" : "false"} />
      <input type="hidden" name="originRegionManual" value={values.originRegionManual === true ? "true" : "false"} />
      <NewLookToggle />
      {EXPRESSION_SECTIONS.map((section) => {
        if (!sectionVisible(section, fieldGroup, values)) return null;
        // The data-sheet look draws the sections it has a layout for as rows (the rest keep the form's own look until their slice).
        if (newLook && SHEET_LAYOUT[section.id]) return <React.Fragment key={section.id}>{renderSheet(section.id, section.id === "identity" ? photoSlot : undefined)}</React.Fragment>;
        // The brandy detail holds a few single-spirit fields: for the rest of the brandies it is not drawn at all.
        if (section.id === "brandy" && section.fields.every((field) => hidden.has(field.name)) && kind !== "pisco") return null;
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
                {section.id === "brandy" && kind === "pisco" ? (
                  <p className="col-span-full text-sm text-muted-foreground">
                    {piscoLand === null ? "Link a Peruvian or Chilean distillery to see what the grapes or the strength make it."
                      : piscoKind ? <>Worked out: <span className="font-medium text-foreground">{piscoLand === "Peru" ? `Pisco ${piscoKind}` : piscoKind}</span>{piscoLand === "Peru" && values.isMostoVerde === true ? " · Mosto Verde" : ""}</>
                      : piscoLand === "Peru" ? "Add the grapes to see whether it is a Puro or an Acholado." : "Enter a proof of at least 60 to see the class."}
                  </p>
                ) : null}
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
            <RegionPicker idPrefix={idPrefix} value={regions} error={errors.regions} onChange={(next) => onChange("regions", next.join(", "))} />
          ) : null}
          <DistilleryPicker fieldGroup={fieldGroup} kind={kind} options={distilleryOptions} links={links} changeLinks={changeLinks} brand={brand}
            onOptionCreated={(option) => onOptionCreated("distilleryLinks", option)} renderRowExtra={mashbillsForDistillery} />
          <IngredientPickers fieldGroup={fieldGroup} kind={kind} links={links} onLinksChange={onLinksChange} />
          <MashbillPicker fieldGroup={fieldGroup} kind={kind} singleMalt={singleMalt} categoryName={options.categoryId?.find((option) => option.value === categoryId)?.label} mashbillCategory={mashbillCategory} options={options.mashbillLinks ?? []} links={links} onLinksChange={onLinksChange}
            matchesOption={matchesRecipe} onOptionCreated={(option) => onOptionCreated("mashbillLinks", option)} renderRowExtra={distilleriesForMashbill} />
          <FinishPickers kind={kind} shown={showsFinishes(context)} barrelType={barrelTypeKind(context) ? { suggestions: BARREL_TYPE_SUGGESTIONS[categorySlug ?? ""] ?? [] } : null} options={options.finishLinks ?? []} links={links} onLinksChange={onLinksChange} fieldGroup={fieldGroup} />
        </SectionContent>
      </Section>
    </>
  );
}

function LinkSuggestions({ label, options, onSelect }: {
  label: string;
  options: Option[];
  onSelect: (option: Option) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="basis-full pl-7 text-xs">
      <span className="mr-2 text-muted-foreground">{label}</span>
      {options.slice(0, 3).map((option) => (
        <Button key={option.value} type="button" variant="ghost" size="sm"
          className="h-auto px-1 py-0 text-xs underline underline-offset-2"
          onClick={() => onSelect(option)}>
          {option.label}
        </Button>
      ))}
    </div>
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
export function PhotoBox({
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
  const newLook = useNewLook();
  if (newLook) {
    // The data-sheet look: the one photo slot, small, at the right of the first rows (the photo flow itself is phase 5).
    return (
      <div className="flex flex-col items-start gap-1.5">
        <button type="button" onClick={() => inputRef.current?.click()} aria-label={file ? "Replace photo" : "Add photo"} className="relative flex aspect-[3/4] w-28 items-center justify-center overflow-hidden border border-dashed border-border bg-muted/30 p-2 text-center text-xs text-muted-foreground hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {chosen ? null : <span>+ Photo or link</span>}
          <PhotoPreview file={file} link={link.trim()} />
        </button>
        <div className="flex gap-3 text-xs">
          <button type="button" aria-expanded={linking} onClick={() => setLinking((on) => !on)} className="underline underline-offset-2 text-muted-foreground hover:text-foreground">From a link</button>
          {chosen ? <button type="button" onClick={() => { onFile(null); onLink(""); if (inputRef.current) inputRef.current.value = ""; }} className="underline underline-offset-2 text-muted-foreground hover:text-foreground">Remove</button> : null}
        </div>
        <input ref={inputRef} id="expression-photo" type="file" accept="image/*" className="sr-only" aria-label="Upload label photo" onChange={(event) => { onFile(event.target.files?.[0] ?? null); if (event.target.files?.[0]) onLink(""); }} />
        {linking || link.trim() !== "" ? <Input id="expression-photo-link" type="url" inputMode="url" placeholder="https://" aria-label="Or a link" value={link} onChange={(event) => { onLink(event.target.value); if (event.target.value.trim() !== "") { onFile(null); if (inputRef.current) inputRef.current.value = ""; } }} className="h-8 w-44 text-xs" /> : null}
      </div>
    );
  }
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
  /** Vintages, as `releaseRow` shapes them. */
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
  const popup = usePopup();
  const [values, setValues] = React.useState<Record<string, FieldValue>>(() => ({ ...initialLabelValues(initialValues, categoryGroups), ageYearsSource: initialValues?.ageYearsSource === "derived" ? "derived" : "entered", originCountryManual: initialValues?.originCountryManual === true, originRegionManual: initialValues?.originRegionManual === true }));
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
  // In the bulk editor's popup a save is reported to the popup (once) instead of navigating away.
  const reported = React.useRef(false);
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
      if (popup) {
        if (reported.current) return;
        reported.current = true;
        popup.saved({ labelId: savedId ?? expressionId ?? undefined, ...(bottleId !== undefined ? { bottleId } : {}) });
        return;
      }
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
  }, [saved, bottleId, savedId, state, router, expressionId, popup]);

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
            columns={OTHER_NAME_COLUMNS}
            initialRows={otherNameRows(parseOtherNames(initialOtherNames).names)}
            toText={otherNamesRowsText}
            error={fieldErrors.otherNames}
          />
        </SectionContent>
      </Section>

      {!["vodka", "amaro", "liqueur"].includes(
        (typeof values.categoryId === "string" && values.categoryId !== "" ? categoryGroups[Number(values.categoryId)] : undefined) ?? "other",
      ) ? <Section>
        <SectionHeader>
          <SectionTitle>Vintages</SectionTitle>
          <SectionDescription>
            Batches or yearly editions of this label. A bottle can say which one it is, and takes its proof, age and
            MSRP unless the bottle says otherwise. Leave a box blank to use the label&apos;s.
          </SectionDescription>
        </SectionHeader>
        <SectionContent>
          <RowListEditor
            name="releases"
            idPrefix="expression-release"
            addLabel="Add a vintage"
            columns={RELEASE_COLUMNS}
            initialRows={initialReleases}
            toText={(rows) => JSON.stringify(rows)}
            removeWarning={(row) => releaseImpact[row.id ?? ""] ?? null}
            error={fieldErrors.releases}
          />
        </SectionContent>
      </Section> : null}

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
        {popup ? (
          <Button type="button" variant="outline" onClick={popup.close}>
            Cancel
          </Button>
        ) : (
          <Button type="button" variant="outline" asChild>
            <Link href={expressionId ? `/expressions/${expressionId}` : "/expressions"}>Cancel</Link>
          </Button>
        )}
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
