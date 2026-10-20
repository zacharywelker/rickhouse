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
import { BOTTLE_FIELDS, BOTTLE_SECTIONS } from "@/lib/expressions/bottle-fields";
import { fieldVisible, sectionVisible } from "@/lib/expressions/fields";
import type { FieldGroup } from "@/db/schema";
import type { CategoryKind, LabelDates } from "@/lib/expressions/rules";
import { IDLE_RESULT, type ActionResult, type Option } from "@/lib/admin/types";
import { ageBetween, ageFilled, describeAge } from "@/lib/bottles/age";
import { ProofAbvFields } from "./proof-abv-field";
import { withOption } from "@/lib/forms/values";
import { AgeFields } from "./age-fields";
import { releaseUnit } from "@/lib/bottles/terminology";

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
  /** Each label's known releases (by label id), for the Release choice. */
  releases?: Record<number, Array<{ value: string; label: string }>>;
  /** Each label's dates (by label id): a bottle goes by them unless it has its own. */
  labelDates?: Record<number, LabelDates>;
  omit?: string[];
  idPrefix?: string;
  /** Existing bottles keep the label picker tucked away unless changing it. */
  collapseLabelPicker?: boolean;
  fieldGroup?: FieldGroup;
  categoryKind?: CategoryKind;
}) {
  // With an age filled in the statement is greyed out; triple-clicking it makes it editable again.
  const [statementOpen, setStatementOpen] = React.useState(false);
  const statementLocked = ageFilled(values) && !statementOpen;
  const unit = releaseUnit(fieldGroup, categoryKind);
  const unitTitle = unit[0]!.toUpperCase() + unit.slice(1);
  return (
    <>
      {BOTTLE_SECTIONS.map((section) => {
        // The pick block is revealed by the single-barrel checkboxes, the same
        // way the label form reveals its per-spirit sections.
        if (!sectionVisible(section, null, values)) return null;
        return (
        <Section key={section.id}>
          <SectionHeader>
            <SectionTitle>{section.id === "pick" ? `Single ${unit} detail` : section.title}</SectionTitle>
            {section.description ? <SectionDescription>{section.description}</SectionDescription> : null}
          </SectionHeader>
          <SectionContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {section.fields.map((originalField) => {
            const field = originalField.name === "isSingleBarrel"
              ? { ...originalField, label: `Single ${unitTitle}` }
              : originalField.name === "barrelNumber"
                ? { ...originalField, label: `${unitTitle} Number`, placeholder: `${unitTitle} 24` }
                : originalField;
            if (!fieldVisible(field, values) || omit.includes(field.name)) return null;
            // Proof/ABV and the age triplet render as linked composites
            // rather than the generic field; see the label form for the same
            // pattern. `field` stays in BOTTLE_FIELDS so seeding and the
            // server's allow-list still see these names.
            if (field.name === "proof") {
              return (
                <ProofAbvFields
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
            if (field.name === "ageMonths" || field.name === "ageDays") return null;
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
                key={field.name}
                spec={labelDate ? { ...field, help: `The label's is ${labelDate}. Leave blank to use it.` } : field}
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
          })}
            {section.id === "override" ? (
              <DeriveAge values={values} set={onChange} inherited={labelDates?.[Number(values.expressionId)]} />
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
}) {
  const router = useRouter();
  const [values, setValues] = React.useState(() => initialFieldValues(BOTTLE_FIELDS, initialValues));
  const [optionsByField, setOptionsByField] = React.useState(options);

  const action = saveBottleAction.bind(null, bottleId);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, IDLE_RESULT);

  const saved = state.ok && state.message !== "";
  const createdId = state.ok ? state.createdId : undefined;
  React.useEffect(() => {
    if (!saved || createdId === undefined) return;
    router.push(`/bottles/${createdId}`);
    router.refresh();
  }, [saved, createdId, router]);

  const fieldErrors = !state.ok && state.fieldErrors ? state.fieldErrors : {};
  // Changing the label drops a version or release picked for the previous one.
  const set = (name: string, value: FieldValue) =>
    setValues((prev) => ({
      ...prev,
      [name]: value,
      ...(name === "expressionId" ? { expressionNameId: "", releaseId: "" } : {}),
    }));

  return (
    <form action={formAction} className="flex flex-col gap-6">
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
        fieldGroup={categoryGroups[Number(values.expressionId)] ?? "whiskey"}
        categoryKind={categoryKinds[Number(values.expressionId)] ?? "american"}
      />

      {!state.ok && state.error ? (
        <p
          role="alert"
          className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" asChild>
          <Link href={bottleId ? `/bottles/${bottleId}` : "/bottles"}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {bottleId ? "Save bottle" : "Add bottle"}
        </Button>
      </div>
    </form>
  );
}
