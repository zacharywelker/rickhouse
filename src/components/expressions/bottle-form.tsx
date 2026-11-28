"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { Field, initialFieldValues, type FieldValue } from "@/components/forms/field";
import { saveBottleAction } from "@/app/(app)/bottles/actions";
import { usePopup } from "@/components/popup/popup";
import { BOTTLE_FIELDS, BOTTLE_SECTIONS, BOTTLE_STATE_SECTION } from "@/lib/expressions/bottle-fields";
import { fieldVisible, sectionVisible } from "@/lib/expressions/fields";
import type { FieldGroup } from "@/db/schema";
import type { CategoryKind, LabelDates } from "@/lib/expressions/rules";
import { IDLE_RESULT, type ActionResult, type Option } from "@/lib/admin/types";
import { ageBetween, ageFilled, describeAge } from "@/lib/bottles/age";
import { ProofAbvFields } from "./proof-abv-field";
import { OpenedLevel, SEALED } from "@/components/bottles/opened-level";
import { withOption } from "@/lib/forms/values";
import { specForKind } from "@/lib/expressions/kind-options";
import type { FieldSpec } from "@/lib/admin/types";
import { AgeFields } from "./age-fields";
import { ChipField } from "@/components/sheet/chips";
import { CHIP, CHIP_LABEL } from "@/components/sheet/chip-styles";
import { MoreLine, SheetRow } from "@/components/sheet/sheet-row";
import { NewLookToggle, useNewLook } from "@/components/sheet/use-new-look";
import { BOTTLE_CHIP_LABELS, BOTTLE_SHEET_MORE, BOTTLE_SHEET_ROWS } from "@/lib/expressions/bottle-sheet-layout";
import { releaseUnit } from "@/lib/bottles/terminology";
import { bottleFieldNotUsed, type LabelFacts } from "@/lib/expressions/bottle-applicability";
import { isAgaveKind } from "@/lib/expressions/spirit-details";
import { isGinKind } from "@/lib/expressions/gin-details";
import { withStatementAge } from "@/lib/expressions/whiskey-age";

/**
 * Offers to work the age out from the fill and bottling dates (SPEC M8).
 *
 * Offers, rather than computes on change: an age statement you typed is the
 * one that should win, and silently rewriting fields as you tab through dates
 * is how people lose what they entered. Nothing moves until this is clicked.
 */
export function DeriveAge({
  values,
  set,
  from = "barrelFilledOn",
  className = "col-span-full",
  inherited,
}: {
  values: Record<string, FieldValue>;
  set: (name: string, value: FieldValue) => void;
  /** The field holding the earlier date: the barrel fill on a bottle, the distillation on a label. */
  from?: string;
  className?: string;
  /** The label's dates, which a bottle with none of its own goes by. */
  inherited?: { barrelFilledOn?: string | null; bottledOn?: string | null } | undefined;
}) {
  const filled = String(values[from] || (from === "barrelFilledOn" ? inherited?.barrelFilledOn : "") || "");
  const bottled = String(values.bottledOn || inherited?.bottledOn || "");
  const age = filled && bottled ? ageBetween(filled, bottled) : null;
  if (!age) return null;

  const already =
    String(values.ageYears ?? "") === String(age.years) &&
    String(values.ageMonths ?? "") === String(age.months) &&
    String(values.ageDays ?? "") === String(age.days);

  return (
    <div className={cn("flex flex-wrap items-center gap-3 border border-border bg-muted/40 px-3 py-2", className)}>
      <p className="text-sm text-muted-foreground">
        Those dates are <span className="text-foreground">{describeAge(age)}</span> apart.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={already}
        onClick={() => {
          set("ageYears", String(age.years));
          set("ageMonths", String(age.months));
          set("ageDays", String(age.days));
        }}
      >
        {already ? "Age filled in" : "Use that as the age"}
      </Button>
    </div>
  );
}

/**
 * The bottle's fields without a form around them, for the bottle form and
 * for the search-first Add bottle page, which chooses the label itself and
 * so leaves the Label picker out (`omit`).
 */
export function BottleFields({
  values,
  onChange,
  options,
  onOptionCreated,
  errors,
  suggestions,
  labelVersions,
  releases,
  labelDates,
  omit = [],
  idPrefix = "bottle",
  collapseLabelPicker = false,
  fieldGroup = "whiskey",
  categoryKind = "american",
  inheritedTequilaClass = null,
  inheritedGinAged,
  inheritedAged,
  inheritedGinNas,
  openedLevel,
}: {
  values: Record<string, FieldValue>;
  onChange: (name: string, value: FieldValue) => void;
  options: Record<string, Option[]>;
  onOptionCreated: (name: string, option: Option) => void;
  errors: Record<string, string>;
  /** Past values for the free-text fields (Picked By, Warehouse, …), by field name. */
  suggestions?: Partial<Record<string, string[]>>;
  /** Each label's older names (by label id), for the Label Version choice. */
  labelVersions?: Record<number, Array<{ value: string; label: string }>>;
  /** Each label's vintages (by label id), for the Release choice. */
  releases?: Record<number, Array<{ value: string; label: string }>>;
  /** Each label's dates (by label id): a bottle goes by them unless it has its own. */
  labelDates?: Record<number, LabelDates>;
  omit?: string[];
  idPrefix?: string;
  /** Existing bottles keep the label picker tucked away unless changing it. */
  collapseLabelPicker?: boolean;
  fieldGroup?: FieldGroup;
  categoryKind?: CategoryKind;
  inheritedTequilaClass?: string | null;
  inheritedGinAged?: boolean;
  /** Rum, amaro and liqueur: the label's Aged toggle. */
  inheritedAged?: boolean;
  inheritedGinNas?: boolean;
  openedLevel?: Pick<React.ComponentProps<typeof OpenedLevel>, "value" | "onChange" | "error">;
}) {
  // With an age filled in the statement is greyed out; triple-clicking it makes it editable again.
  const [statementOpen, setStatementOpen] = React.useState(false);
  const [ageOpen, setAgeOpen] = React.useState(false);
  const statementLocked = values.ageYearsSource !== "derived" && ageFilled(values) && !statementOpen;
  const newLook = useNewLook();
  const unit = releaseUnit(fieldGroup, categoryKind);
  const unitTitle = unit[0]!.toUpperCase() + unit.slice(1);
  const effectiveTequilaClass = String(values.tequilaClass || inheritedTequilaClass || "");
  const labelOption = options.expressionId?.find((option) => option.value === Number(values.expressionId));
  const ginAged = isGinKind(categoryKind) && (inheritedGinAged ?? labelOption?.isAgedGin) === true;
  const labelFacts: LabelFacts = { group: fieldGroup, kind: categoryKind, isAgedGin: ginAged, isAged: (inheritedAged ?? labelOption?.isAged) === true, tequilaClass: inheritedTequilaClass };
  const ginNas = values.ginIsNas === "true" || values.ginIsNas === true || ((values.ginIsNas === "" || values.ginIsNas == null) && (inheritedGinNas ?? labelOption?.isNas) === true);
  /** One bottle field as the form draws it; `chip` is the data-sheet look of the composites and references (the plain fields are drawn by `ChipField`). */
  const drawField = (originalField: FieldSpec, chip = false): React.ReactNode => {
            const field = originalField.name === "isSingleBarrel"
              ? { ...originalField, label: `Single ${unitTitle}` }
              : originalField.name === "barrelNumber"
                ? { ...originalField, label: `${unitTitle} Number`, placeholder: `${unitTitle} 24` }
                : originalField;
            // One function decides which bottle fields a label's spirit has (and the bulk editor asks the same one).
            // A vintage already chosen stays visible even where the spirit no longer offers the choice (gin, tequila), so it can be cleared.
            const keptVintage = field.name === "releaseId" && String(values.releaseId ?? "") !== "";
            const notUsed = (name: string) => bottleFieldNotUsed(name, labelFacts, { tequilaClass: effectiveTequilaClass || null }) !== null;
            // The age group is drawn by its years field: with years unavailable (a Reposado) but months or days not, it stays.
            const ageGroupStays = field.name === "ageYears" && (!notUsed("ageMonths") || !notUsed("ageDays"));
            if (notUsed(field.name) && !keptVintage && !ageGroupStays) return null;
            if (!fieldVisible(field, values) || omit.includes(field.name)) return null;
            // Proof/ABV and the age triplet render as linked composites
            // rather than the generic field; see the label form for the same
            // pattern. `field` stays in BOTTLE_FIELDS so seeding and the
            // server's allow-list still see these names.
            if (field.name === "status" && field.kind === "select" && openedLevel) {
              return (
                <Field
                  chip={chip}
                  key={field.name}
                  spec={{ ...field, options: field.options.map((option) => option.value === "owned" ? { ...option, label: "Sealed" } : option) }}
                  idPrefix={idPrefix}
                  value={values.status ?? "owned"}
                  error={errors.status}
                  onChange={(next) => {
                    onChange("status", next);
                    if (next === "owned") openedLevel.onChange(SEALED);
                    if (next === "open") openedLevel.onChange({ ...openedLevel.value, isOpen: true });
                  }}
                />
              );
            }
            if (field.name === "proof") {
              return (
                <ProofAbvFields
                  chip={chip}
                  key={field.name}
                  idPrefix={idPrefix}
                  value={values.proof ?? ""}
                  onChange={(next) => onChange("proof", next)}
                  error={errors.proof}
                />
              );
            }
            if (field.name === "expressionNameId") {
              const versions = labelVersions?.[Number(values.expressionId)] ?? [];
              if (versions.length === 0 || field.kind !== "select") return null;
              return (
                <Field
                  chip={chip}
                  key={field.name}
                  spec={{ ...field, options: [...field.options, ...versions] }}
                  idPrefix={idPrefix}
                  value={values.expressionNameId ?? ""}
                  onChange={(next) => onChange("expressionNameId", next)}
                  error={errors.expressionNameId}
                />
              );
            }
            if (field.name === "releaseId") {
              const choices = releases?.[Number(values.expressionId)] ?? [];
              if (choices.length === 0 || field.kind !== "select") return null;
              return (
                <Field
                  chip={chip}
                  key={field.name}
                  spec={{ ...field, options: [...field.options, ...choices] }}
                  idPrefix={idPrefix}
                  value={values.releaseId ?? ""}
                  onChange={(next) => onChange("releaseId", next)}
                  error={errors.releaseId}
                />
              );
            }
            // A chosen release supplies these; the server clears them to match.
            if ((field.name === "batch" || field.name === "releaseYear") && values.releaseId) return null;
            if (field.name === "batch" && isAgaveKind(categoryKind)) return <Field chip={chip} key={field.name} spec={{ ...field, label: "LOT #" }} idPrefix={idPrefix} value={values.batch ?? ""} onChange={(next) => onChange("batch", next)} error={errors.batch} />;
            if (field.name === "ageMonths" || field.name === "ageDays") return null;
            if (field.name === "ageYears") {
              return (
                <AgeFields
                  chip={chip}
                  key="age"
                  idPrefix={idPrefix}
                  values={{
                    ageYears: values.ageYears ?? "",
                    ageMonths: values.ageMonths ?? "",
                    ageDays: values.ageDays ?? "",
                  }}
                  onChange={(name, next) => onChange(name, next)}
                  showYears={!notUsed("ageYears")}
                  showDays={!notUsed("ageDays")}
                  locked={!ageOpen && ((isGinKind(categoryKind) && ginNas) || String(values.ageStatement ?? "").trim() !== "")}
                  onUnlock={() => setAgeOpen(true)}
                  errors={{
                    ageYears: errors.ageYears,
                    ageMonths: errors.ageMonths,
                    ageDays: errors.ageDays,
                  }}
                  help="Filled and bottled above will offer to work this out."
                />
              );
            }
            const dates = labelDates?.[Number(values.expressionId)];
            const labelDate = field.name === "barrelFilledOn"
              ? dates?.barrelFilledOn
              : field.name === "bottledOn"
                ? dates?.bottledOn
                : null;
            const control = (
              <Field
                  chip={chip}
                key={field.name}
                {...(chip ? { chipLabel: BOTTLE_CHIP_LABELS[field.name] ?? field.label } : {})}
                spec={labelDate ? { ...field, help: `The label's is ${labelDate}. Leave blank to use it.` } : specForKind(field, categoryKind)}
                idPrefix={idPrefix}
                value={values[field.name] ?? ""}
                onChange={(next) => onChange(field.name, next)}
                error={errors[field.name]}
                options={options[field.name] ?? []}
                onOptionCreated={(option) => onOptionCreated(field.name, option)}
                suggestions={suggestions?.[field.name]}
                locked={field.name === "ageStatement" && statementLocked}
                onUnlock={() => setStatementOpen(true)}
              />
            );
            if (field.name === "expressionId" && collapseLabelPicker) {
              const selectedLabel = options.expressionId?.find((option) => option.value === Number(values.expressionId))?.label;
              return (
                <details key={field.name} className="col-span-full border border-border px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    Change label <span className="font-normal text-muted-foreground">
                      {selectedLabel ? "· " + selectedLabel : ""}
                    </span>
                  </summary>
                  <div className="pt-3">{control}</div>
                </details>
              );
            }
            return control;
  };

  /** The data-sheet look of the bottle form (design: 2026-11-25-data-sheet-forms-design.md, slice 4): rows of chips and a More line. */
  const owningSection = (name: string) => BOTTLE_SECTIONS.find((section) => section.fields.some((field) => field.name === name));
  const sectionShown = (section: (typeof BOTTLE_SECTIONS)[number]) =>
    sectionVisible(section, null, values) &&
    !(section.id === "pick" && isGinKind(categoryKind) && !ginAged) &&
    !(section.id === "pick" && fieldGroup === "rum" && !labelFacts.isAged) &&
    !((fieldGroup === "vodka" || fieldGroup === "amaro" || fieldGroup === "liqueur") && (section.id === "release" || section.id === "pick"));
  const named = (field: FieldSpec): FieldSpec => {
    const label = field.name === "batch" && isAgaveKind(categoryKind) ? "Lot #" : field.name === "isSingleBarrel" ? `Single ${unitTitle}` : field.name === "barrelNumber" ? `${unitTitle} Number` : BOTTLE_CHIP_LABELS[field.name] ?? field.label;
    return { ...field, label, ...(field.name === "barrelNumber" && "placeholder" in field ? { placeholder: `${unitTitle} 24` } : {}) } as FieldSpec;
  };
  const stillApplies = (field: FieldSpec): boolean => {
    const keptVintage = field.name === "releaseId" && String(values.releaseId ?? "") !== "";
    const notUsed = (name: string) => bottleFieldNotUsed(name, labelFacts, { tequilaClass: effectiveTequilaClass || null }) !== null;
    const ageGroupStays = field.name === "ageYears" && (!notUsed("ageMonths") || !notUsed("ageDays"));
    if (notUsed(field.name) && !keptVintage && !ageGroupStays) return false;
    return fieldVisible(field, values) && !omit.includes(field.name);
  };
  // The fields the form draws itself (a composite, a list of this label's vintages or versions, a field a vintage supplies): the chip look wraps them, it does not redo them.
  const SELF_DRAWN = ["expressionId", "expressionNameId", "releaseId", "proof", "ageYears", "ageMonths", "ageDays", "status"];
  const sheetCell = (name: string): React.ReactNode => {
    if (name === "@status") return null; // the status is drawn as its own field (below), with the opened level
    const section = owningSection(name);
    const spec = section?.fields.find((field) => field.name === name);
    if (!section || !spec || !sectionShown(section) || !stillApplies(spec)) return null;
    if (SELF_DRAWN.includes(name)) return drawField(spec, true);
    // A chosen vintage supplies the batch and the year.
    if ((name === "batch" || name === "releaseYear") && values.releaseId) return null;
    const field = named(specForKind(spec, categoryKind));
    const labelDate = name === "barrelFilledOn" ? labelDates?.[Number(values.expressionId)]?.barrelFilledOn : name === "bottledOn" ? labelDates?.[Number(values.expressionId)]?.bottledOn : null;
    return (
      <ChipField
        key={name} spec={labelDate && "help" in field ? { ...field, help: `The label's is ${labelDate}. Leave blank to use it.` } as FieldSpec : field} idPrefix={idPrefix}
        value={values[name] ?? ""} onChange={(next) => onChange(name, next)} error={errors[name]}
        locked={name === "ageStatement" && statementLocked} onUnlock={() => setStatementOpen(true)}
        onField={() => drawField(spec, true)} suggestions={suggestions?.[name]}
      />
    );
  };
  const statusCell = () => {
    const spec = owningSection("status")?.fields.find((field) => field.name === "status");
    if (!spec || spec.kind !== "select" || !stillApplies(spec)) return null;
    const options = openedLevel ? spec.options.map((option) => (option.value === "owned" ? { ...option, label: "Sealed" } : option)) : spec.options;
    return (
      <label key="status" className={CHIP}>
        <span className={CHIP_LABEL}>Status</span>
        <select
          id={`${idPrefix}-status`} name="status" value={String(values.status ?? "owned")}
          onChange={(event) => {
            const next = event.target.value;
            onChange("status", next);
            if (openedLevel && next === "owned") openedLevel.onChange(SEALED);
            if (openedLevel && next === "open") openedLevel.onChange({ ...openedLevel.value, isOpen: true });
          }}
          className="min-w-0 border-0 bg-transparent p-0 text-[12px] font-semibold outline-none"
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    );
  };
  // A row stays closed only when nothing in it will be posted: closed rows are not mounted, so a saved value there would be erased by the next save.
  // "false" counts for a select (Gin's "not NAS" is a saved answer) but not for a checkbox, where it just means unticked.
  const hasValue = (name: string) => {
    const value = values[name];
    if (value === undefined || value === null || value === "" || value === false) return false;
    if (value !== "false") return true;
    return owningSection(name)?.fields.find((field) => field.name === name)?.kind === "select";
  };
  const renderSheet = () => {
    const rows = BOTTLE_SHEET_ROWS.map((row) => {
      const cells = row.items.map((item) => (item === "@status" ? statusCell() : sheetCell(item)));
      const level = row.items.includes("@status") && openedLevel && statusCell() !== null ? (
        <div key="opened-level" className="basis-full">
          <OpenedLevel
            {...openedLevel}
            fieldGroup={fieldGroup}
            onChange={(next) => {
              openedLevel.onChange(next);
              if (values.status === "owned" || values.status === "open") onChange("status", next.isOpen ? "open" : "owned");
            }}
          />
        </div>
      ) : null;
      if (cells.every((cell) => cell === null)) return null;
      return <SheetRow key={row.label} label={row.label}>{cells}{level}</SheetRow>;
    });
    const more = BOTTLE_SHEET_MORE.flatMap((item) => {
      const cells = item.fields.map((name) => sheetCell(name));
      if (cells.every((cell) => cell === null)) return [];
      const label = item.id === "single" ? `Single ${unit}` : item.label;
      const differs = item.id === "differs" && !(isGinKind(categoryKind) || fieldGroup === "vodka" || fieldGroup === "amaro" || fieldGroup === "liqueur")
        ? <DeriveAge key="derive" values={values} set={onChange} inherited={labelDates?.[Number(values.expressionId)]} /> : null;
      return [{
        id: item.id, label, opened: [...item.fields, ...(item.id === "differs" ? ["ageMonths", "ageDays"] : [])].some((name) => hasValue(name)),
        content: <SheetRow label={label}>{cells}{differs}</SheetRow>,
      }];
    });
    return (
      <div className="flex min-w-0 flex-col border-t-2 border-foreground pt-2">
        {rows}
        <MoreLine items={more} />
      </div>
    );
  };

  return (
    <>
      <input type="hidden" name="ageYearsSource" value={String(values.ageYearsSource ?? "entered")} />
      {newLook ? renderSheet() : BOTTLE_SECTIONS.map((section) => {
        // The pick block is revealed by the single-barrel checkboxes, the same
        // way the label form reveals its per-spirit sections.
        if (!sectionVisible(section, null, values)) return null;
        if (section.id === "pick" && isGinKind(categoryKind) && !ginAged) return null;
        if (section.id === "pick" && fieldGroup === "rum" && !labelFacts.isAged) return null;
        if ((fieldGroup === "vodka" || fieldGroup === "amaro" || fieldGroup === "liqueur") && (section.id === "release" || section.id === "pick")) return null;
        return (
        <Section key={section.id}>
          <SectionHeader>
            <SectionTitle>{section.id === "pick" ? `Single ${unit} detail` : section.title}</SectionTitle>
            {section.description ? <SectionDescription>{section.description}</SectionDescription> : null}
          </SectionHeader>
          <SectionContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {section.fields.map((originalField) => drawField(originalField))}
            {section.id === "bottle" && openedLevel ? (
              <div className="col-span-full">
                <OpenedLevel
                  {...openedLevel}
                  fieldGroup={fieldGroup}
                  onChange={(next) => {
                    openedLevel.onChange(next);
                    if (values.status === "owned" || values.status === "open") {
                      onChange("status", next.isOpen ? "open" : "owned");
                    }
                  }}
                />
              </div>
            ) : null}
            {section.id === "override" ? (
              isGinKind(categoryKind) || fieldGroup === "vodka" || fieldGroup === "amaro" || fieldGroup === "liqueur" ? null : <DeriveAge values={values} set={onChange} inherited={labelDates?.[Number(values.expressionId)]} />
            ) : null}
          </SectionContent>
        </Section>
        );
      })}
    </>
  );
}

export function BottleForm({
  bottleId,
  initialValues,
  options,
  suggestions,
  labelVersions,
  releases,
  labelDates,
  collapseLabelPicker = false,
  categoryGroups,
  categoryKinds,
  duplicateSourceId = null,
  tagOptions = [],
  initialTagIds = [],
}: {
  bottleId: number | null;
  initialValues: Record<string, string | number | boolean | null> | null;
  options: Record<string, Option[]>;
  suggestions?: Partial<Record<string, string[]>>;
  labelVersions?: Record<number, Array<{ value: string; label: string }>>;
  releases?: Record<number, Array<{ value: string; label: string }>>;
  labelDates?: Record<number, LabelDates>;
  collapseLabelPicker?: boolean;
  categoryGroups: Record<number, FieldGroup>;
  categoryKinds: Record<number, CategoryKind>;
  duplicateSourceId?: number | null;
  tagOptions?: Option[];
  initialTagIds?: number[];
}) {
  const router = useRouter();
  const popup = usePopup();
  const [values, setValues] = React.useState<Record<string, FieldValue>>(() => ({ ...initialFieldValues(BOTTLE_FIELDS, initialValues), ageYearsSource: initialValues?.ageYearsSource === "derived" ? "derived" : "entered" }));
  const [copyState, setCopyState] = React.useState(() => initialFieldValues(BOTTLE_STATE_SECTION.fields, initialValues));
  const [life, setLife] = React.useState(SEALED);
  const [copyPhotos, setCopyPhotos] = React.useState(true);
  const [copiedTagIds, setCopiedTagIds] = React.useState(initialTagIds);
  const [optionsByField, setOptionsByField] = React.useState(options);

  const action = saveBottleAction.bind(null, bottleId);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, IDLE_RESULT);
  const newLook = useNewLook();

  const saved = state.ok && state.message !== "";
  const createdId = state.ok ? state.createdId : undefined;
  // In the bulk editor's popup a save is reported to the popup (once, even if the effect runs twice) instead of navigating away.
  const reported = React.useRef(false);
  React.useEffect(() => {
    if (!saved) return;
    if (popup) {
      if (reported.current) return;
      reported.current = true;
      popup.saved({ bottleId: createdId ?? bottleId ?? undefined });
      return;
    }
    if (createdId === undefined) return;
    router.push(`/bottles/${createdId}`);
    router.refresh();
  }, [saved, createdId, bottleId, router, popup]);

  const fieldErrors = !state.ok && state.fieldErrors ? state.fieldErrors : {};
  // Changing the label drops a version or release picked for the previous one.
  const set = (name: string, value: FieldValue) =>
    setValues((prev) => {
      const next: Record<string, FieldValue> = {
        ...prev,
        [name]: value,
        ...(name === "expressionId" ? { expressionNameId: "", releaseId: "" } : {}),
      };
      const selected = options.expressionId?.find((option) => option.value === Number(next.expressionId));
      return categoryGroups[selected?.categoryId ?? -1] === "whiskey" ? withStatementAge(prev, next, name) : next;
    });

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <NewLookToggle />
      {duplicateSourceId !== null ? <input type="hidden" name="duplicateSourceId" value={duplicateSourceId} /> : null}
      {duplicateSourceId !== null ? <input type="hidden" name="copyPhotos" value={copyPhotos ? "1" : "0"} /> : null}
      {duplicateSourceId !== null ? <input type="hidden" name="duplicateTagIds" value={JSON.stringify(copiedTagIds)} /> : null}
      <BottleFields
        values={values}
        onChange={set}
        options={optionsByField}
        onOptionCreated={(name, option) => setOptionsByField((prev) => withOption(prev, name, option))}
        errors={fieldErrors}
        suggestions={suggestions}
        labelVersions={labelVersions}
        releases={releases}
        labelDates={labelDates}
        collapseLabelPicker={collapseLabelPicker}
        openedLevel={bottleId === null && duplicateSourceId === null
          ? { value: life, onChange: setLife, error: fieldErrors.dateOpened ?? fieldErrors.fillPct }
          : undefined}
        fieldGroup={categoryGroups[options.expressionId?.find((option) => option.value === Number(values.expressionId))?.categoryId ?? -1] ?? "other"}
        categoryKind={categoryKinds[options.expressionId?.find((option) => option.value === Number(values.expressionId))?.categoryId ?? -1] ?? "other"}
        inheritedTequilaClass={options.expressionId?.find((option) => option.value === Number(values.expressionId))?.tequilaClass ?? null}
      />

      {bottleId === null && duplicateSourceId === null ? (
        <>
          <input type="hidden" name="isOpen" value={life.isOpen ? "true" : ""} />
          <input type="hidden" name="fillPct" value={life.fillPct} />
          <input type="hidden" name="dateOpened" value={life.isOpen ? life.dateOpened : ""} />
        </>
      ) : null}

      {duplicateSourceId !== null ? <Section>
        <SectionHeader><SectionTitle>Copied bottle state</SectionTitle><SectionDescription>Adjust the original bottle&apos;s opened state, fill level, dates, and favorite status for this new bottle.</SectionDescription></SectionHeader>
        <SectionContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {BOTTLE_STATE_SECTION.fields.map((field) => <Field key={field.name} spec={field} idPrefix="duplicate" value={copyState[field.name] ?? ""} onChange={(value) => setCopyState((current) => ({ ...current, [field.name]: value }))} error={fieldErrors[field.name]} />)}
          <label className="col-span-full flex items-center gap-2 text-sm"><input type="checkbox" checked={copyPhotos} onChange={(event) => setCopyPhotos(event.target.checked)} />Copy bottle photos</label>
          {tagOptions.length > 0 ? <fieldset className="col-span-full flex flex-wrap gap-3 border-t border-border pt-3">
            <legend className="text-sm font-medium">Tags for the new bottle</legend>
            {tagOptions.map((tag) => <label key={tag.value} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={copiedTagIds.includes(tag.value)} onChange={(event) => setCopiedTagIds((ids) => event.target.checked ? [...ids, tag.value] : ids.filter((id) => id !== tag.value))} />
              {tag.label}
            </label>)}
          </fieldset> : null}
        </SectionContent>
      </Section> : null}

      {!state.ok && state.error ? (
        <p
          role="alert"
          className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", newLook && "order-first sticky top-0 z-30 -mx-1 border-b border-border bg-background/95 px-1 py-2")}>
        {popup ? (
          <Button type="button" variant="outline" onClick={popup.close}>
            Cancel
          </Button>
        ) : (
          <Button type="button" variant="outline" asChild>
            <Link href={bottleId ? `/bottles/${bottleId}` : "/bottles"}>Cancel</Link>
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {bottleId ? "Save bottle" : "Add bottle"}
        </Button>
      </div>
    </form>
  );
}
