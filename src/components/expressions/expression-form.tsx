"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { Field, initialFieldValues, type FieldValue } from "@/components/forms/field";
import { saveExpressionAction } from "@/app/(app)/expressions/actions";
import { EXPRESSION_SECTIONS, sectionVisible } from "@/lib/expressions/fields";
import { IDLE_RESULT, type ActionResult, type FieldSpec, type Option } from "@/lib/admin/types";
import type { FieldGroup } from "@/db/schema";
import { defaultAgeStatement } from "@/lib/bottles/age";
import { ProofAbvFields } from "./proof-abv-field";
import { AgeFields } from "./age-fields";
import { OrderedPicker, type LinkedRow } from "./ordered-picker";
import { DeleteExpressionButton } from "./delete-expression-button";

/** Fields whose checkbox, when switched on, offers a default age statement. */
const AGE_DESIGNATION_FIELDS = new Set(["isStraight", "isBottledInBond", "isNas"]);

const ALL_FIELDS: FieldSpec[] = EXPRESSION_SECTIONS.flatMap((section) => section.fields);

export function ExpressionForm({
  expressionId,
  initialValues,
  initialLinks,
  options,
  categoryGroups,
}: {
  expressionId: number | null;
  initialValues: Record<string, string | number | boolean | null> | null;
  initialLinks: { distilleries: LinkedRow[]; mashbills: LinkedRow[]; finishes: LinkedRow[] };
  options: Record<string, Option[]>;
  /** categoryId -> field group, so sections react without a round trip. */
  categoryGroups: Record<number, FieldGroup>;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState(() => initialFieldValues(ALL_FIELDS, initialValues));
  const [optionsByField, setOptionsByField] = React.useState(options);
  const [links, setLinks] = React.useState(initialLinks);

  const action = saveExpressionAction.bind(null, expressionId);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, IDLE_RESULT);

  const saved = state.ok && state.message !== "";
  React.useEffect(() => {
    if (!saved) return;
    router.push("/expressions");
    router.refresh();
  }, [saved, state, router]);

  const fieldErrors = !state.ok && state.fieldErrors ? state.fieldErrors : {};
  const set = (name: string, value: FieldValue) =>
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      // Turning on Straight, Bottled In Bond or NAS offers a default age
      // statement, but only into a blank field — Old Grand Dad 7 is
      // bottled-in-bond and still reads "7 Year", not the BiB default.
      if (AGE_DESIGNATION_FIELDS.has(name) && value === true && String(prev.ageStatement ?? "").trim() === "") {
        next.ageStatement = defaultAgeStatement({
          isStraight: next.isStraight === true,
          isBottledInBond: next.isBottledInBond === true,
          isNas: next.isNas === true,
        });
      }
      return next;
    });

  const categoryRaw = values.categoryId;
  const categoryId = typeof categoryRaw === "string" && categoryRaw !== "" ? Number(categoryRaw) : null;
  const fieldGroup: FieldGroup = (categoryId !== null ? categoryGroups[categoryId] : undefined) ?? "other";

  return (
    <form action={formAction} className="flex flex-col gap-6">
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
                      idPrefix="expression"
                      value={values.proof ?? ""}
                      onChange={(next) => set("proof", next)}
                      error={fieldErrors.proof}
                    />
                  );
                }
                if (field.name === "ageMonths" || field.name === "ageDays") return null;
                if (field.name === "ageYears") {
                  return (
                    <AgeFields
                      key="age"
                      idPrefix="expression"
                      values={{
                        ageYears: values.ageYears ?? "",
                        ageMonths: values.ageMonths ?? "",
                        ageDays: values.ageDays ?? "",
                      }}
                      onChange={(name, next) => set(name, next)}
                      errors={{
                        ageYears: fieldErrors.ageYears,
                        ageMonths: fieldErrors.ageMonths,
                        ageDays: fieldErrors.ageDays,
                      }}
                    />
                  );
                }
                return (
                  <Field
                    key={field.name}
                    spec={field}
                    idPrefix="expression"
                    value={values[field.name] ?? ""}
                    onChange={(next) => set(field.name, next)}
                    error={fieldErrors[field.name]}
                    options={optionsByField[field.name] ?? []}
                    onOptionCreated={(option) =>
                      setOptionsByField((prev) => ({
                        ...prev,
                        [field.name]: [...(prev[field.name] ?? []), option].sort((a, b) =>
                          a.label.localeCompare(b.label),
                        ),
                      }))
                    }
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
            list this expression among its contributions.
          </SectionDescription>
        </SectionHeader>
        <SectionContent className="grid grid-cols-1 gap-4">
          <OrderedPicker
            name="distilleryLinks"
            label="Distilleries"
            description="Every distillery that contributed, in the order you would list them."
            resource="distilleries"
            options={optionsByField.distilleryLinks ?? []}
            amountLabel="Share"
            amountSuffix="%"
            value={links.distilleries}
            onChange={(rows) => setLinks((prev) => ({ ...prev, distilleries: rows }))}
          />
          <OrderedPicker
            name="mashbillLinks"
            label="Mashbills"
            description="One per contributing recipe. A blend of three has three. With more than one distillery above, say which one made each."
            resource={null}
            emptyHint="Add mashbills under Configuration — their grains have to total 100%."
            options={optionsByField.mashbillLinks ?? []}
            amountLabel="Share"
            amountSuffix="%"
            value={links.mashbills}
            onChange={(rows) => setLinks((prev) => ({ ...prev, mashbills: rows }))}
            distilleryChoices={links.distilleries.map((d) => ({ id: d.id, name: d.label }))}
          />
          <OrderedPicker
            name="finishLinks"
            label="Finishes"
            description="In sequence, for a double or triple finish."
            resource="finishes"
            options={optionsByField.finishLinks ?? []}
            amountLabel="Months"
            amountSuffix="mo"
            value={links.finishes}
            onChange={(rows) => setLinks((prev) => ({ ...prev, finishes: rows }))}
          />
        </SectionContent>
      </Section>

      {!state.ok && state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
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
          <Link href="/expressions">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {expressionId ? "Save Label" : "Create Label"}
        </Button>
      </div>
    </form>
  );
}
