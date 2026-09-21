"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, initialFieldValues, type FieldValue } from "@/components/forms/field";
import { saveBottleAction } from "@/app/(app)/bottles/actions";
import { BOTTLE_FIELDS } from "@/lib/expressions/bottle-fields";
import { IDLE_RESULT, type ActionResult, type Option } from "@/lib/admin/types";

export function BottleForm({
  bottleId,
  initialValues,
  options,
}: {
  bottleId: number | null;
  initialValues: Record<string, string | number | boolean | null> | null;
  options: Record<string, Option[]>;
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
  const set = (name: string, value: FieldValue) => setValues((prev) => ({ ...prev, [name]: value }));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{bottleId ? "This bottle" : "Add a bottle"}</CardTitle>
          <CardDescription>
            What is true of this particular bottle. The mashbill, proof and distillery live on the expression, so a
            second bottle of the same thing only needs filling in once.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {BOTTLE_FIELDS.map((field) => (
            <Field
              key={field.name}
              spec={field}
              idPrefix="bottle"
              value={values[field.name] ?? ""}
              onChange={(next) => set(field.name, next)}
              error={fieldErrors[field.name]}
              options={optionsByField[field.name] ?? []}
              onOptionCreated={(option) =>
                setOptionsByField((prev) => ({
                  ...prev,
                  [field.name]: [...(prev[field.name] ?? []), option].sort((a, b) => a.label.localeCompare(b.label)),
                }))
              }
            />
          ))}
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
