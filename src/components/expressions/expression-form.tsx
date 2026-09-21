"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, initialFieldValues, type FieldValue } from "@/components/forms/field";
import { saveExpressionAction } from "@/app/(app)/expressions/actions";
import { EXPRESSION_SECTIONS, sectionVisible } from "@/lib/expressions/fields";
import { IDLE_RESULT, type ActionResult, type FieldSpec, type Option } from "@/lib/admin/types";
import type { FieldGroup } from "@/db/schema";
import { OrderedPicker, type LinkedRow } from "./ordered-picker";

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
  const set = (name: string, value: FieldValue) => setValues((prev) => ({ ...prev, [name]: value }));

  const categoryRaw = values.categoryId;
  const categoryId = typeof categoryRaw === "string" && categoryRaw !== "" ? Number(categoryRaw) : null;
  const fieldGroup: FieldGroup = (categoryId !== null ? categoryGroups[categoryId] : undefined) ?? "other";

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {EXPRESSION_SECTIONS.map((section) => {
        if (!sectionVisible(section, fieldGroup, values)) return null;
        return (
          <Card key={section.id}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              {section.description ? <CardDescription>{section.description}</CardDescription> : null}
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.fields.map((field) => (
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
              ))}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Where it came from</CardTitle>
          <CardDescription>
            A blend has several of each, and the order matters. These are real links, so a distillery&rsquo;s page will
            list this expression among its contributions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
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
            description="One per contributing recipe. A blend of three has three."
            resource={null}
            emptyHint="Add mashbills under Configuration — their grains have to total 100%."
            options={optionsByField.mashbillLinks ?? []}
            amountLabel="Share"
            amountSuffix="%"
            value={links.mashbills}
            onChange={(rows) => setLinks((prev) => ({ ...prev, mashbills: rows }))}
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
        </CardContent>
      </Card>

      {!state.ok && state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" asChild>
          <Link href="/expressions">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {expressionId ? "Save expression" : "Create expression"}
        </Button>
      </div>
    </form>
  );
}
