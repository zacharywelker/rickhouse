"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { Field, initialFieldValues, type FieldValue } from "@/components/forms/field";
import { withOption } from "@/lib/forms/values";
import { saveExpressionAction } from "@/app/(app)/expressions/actions";
import { EXPRESSION_SECTIONS, sectionVisible } from "@/lib/expressions/fields";
import { IDLE_RESULT, type ActionResult, type FieldSpec, type Option } from "@/lib/admin/types";
import type { FieldGroup } from "@/db/schema";
import { offeredAgeStatement } from "@/lib/bottles/age";
import { ProofAbvFields } from "./proof-abv-field";
import { AgeFields } from "./age-fields";
import { OrderedPicker, type LinkedRow } from "./ordered-picker";
import { DeleteExpressionButton } from "./delete-expression-button";
import { PendingColas } from "./cola-approvals";
import { RowListEditor } from "./row-list-editor";
import { otherNamesRowsText, parseOtherNames } from "@/lib/other-names";
import type { ReleaseRow } from "@/lib/releases";

/** Every field on the label form, for seeding state from a row or from nothing. */
export const LABEL_FIELDS: FieldSpec[] = EXPRESSION_SECTIONS.flatMap((section) => section.fields);

export type LabelLinks = { distilleries: LinkedRow[]; mashbills: LinkedRow[]; finishes: LinkedRow[] };

export const EMPTY_LINKS: LabelLinks = { distilleries: [], mashbills: [], finishes: [] };

/** One field changed, with an age statement offered as the age is typed. */
export function withLabelChange(
  prev: Record<string, FieldValue>,
  name: string,
  value: FieldValue,
): Record<string, FieldValue> {
  const next = { ...prev, [name]: value };
  const offered = offeredAgeStatement(prev, next, name);
  if (offered !== null) next.ageStatement = offered;
  return next;
}

/**
 * The label's fields and its three ordered lists, without a form around
 * them: New Label and Edit Label wrap them in their own form, and the
 * search-first Add bottle page puts them above the bottle's in one save.
 */
export function ExpressionFields({
  values,
  onChange,
  links,
  onLinksChange,
  options,
  onOptionCreated,
  categoryGroups,
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
  errors: Record<string, string>;
  idPrefix?: string;
}) {
  const categoryRaw = values.categoryId;
  const categoryId = typeof categoryRaw === "string" && categoryRaw !== "" ? Number(categoryRaw) : null;
  const fieldGroup: FieldGroup = (categoryId !== null ? categoryGroups[categoryId] : undefined) ?? "other";

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
              {section.fields.map((field) => {
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
                    />
                  );
                }
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
                    />
                  );
                }
                return (
                  <Field
                    key={field.name}
                    spec={field}
                    idPrefix={idPrefix}
                    value={values[field.name] ?? ""}
                    onChange={(next) => onChange(field.name, next)}
                    error={errors[field.name]}
                    options={options[field.name] ?? []}
                    onOptionCreated={(option) => onOptionCreated(field.name, option)}
                  />
                );
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
            onChange={(rows) => onLinksChange({ ...links, distilleries: rows })}
          />
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
        </SectionContent>
      </Section>
    </>
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
  /** Whether TTB's registry can be searched; on New Label, for picking approvals to attach. */
  colaLookup?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState(() => initialFieldValues(LABEL_FIELDS, initialValues));
  const [optionsByField, setOptionsByField] = React.useState(options);
  const [links, setLinks] = React.useState(initialLinks);

  const action = saveExpressionAction.bind(null, expressionId);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, IDLE_RESULT);

  const saved = state.ok && state.message !== "";
  const bottleId = state.ok ? state.bottleId : undefined;
  const savedId = state.ok ? state.createdId : undefined;
  React.useEffect(() => {
    if (!saved) return;
    // With a bottle just added, land on its edit page to fill in price, store,
    // etc.; otherwise on the label's own page.
    router.push(
      bottleId !== undefined ? `/bottles/${bottleId}/edit` : savedId !== undefined ? `/expressions/${savedId}` : "/expressions",
    );
    router.refresh();
  }, [saved, bottleId, savedId, state, router]);

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
