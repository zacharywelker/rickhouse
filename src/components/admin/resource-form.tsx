"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { saveResourceAction } from "@/app/(app)/admin/actions";
import { IDLE_RESULT, type ActionResult, type AdminRow, type FieldSpec, type Option } from "@/lib/admin/types";
import { Field, initialFieldValues, type FieldValue } from "@/components/forms/field";
import { GrainEditor, parseGrainRows, type GrainRow } from "./grain-editor";

type FormValues = Record<string, FieldValue>;

export function ResourceForm({
  resourceKey,
  singular,
  fields,
  options,
  row,
  onSaved,
}: {
  resourceKey: string;
  singular: string;
  fields: FieldSpec[];
  options: Record<string, Option[]>;
  row: AdminRow | null;
  onSaved: () => void;
}) {
  const [values, setValues] = React.useState<FormValues>(() => initialFieldValues(fields, row?.values ?? null));
  const [optionsByField, setOptionsByField] = React.useState(options);

  const action = saveResourceAction.bind(null, resourceKey, row?.id ?? null);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, IDLE_RESULT);

  // IDLE_RESULT is `ok` with an empty message, so a real success is the one
  // that carries text. Without that distinction the dialog closes on mount.
  const saved = state.ok && state.message !== "";
  React.useEffect(() => {
    if (saved) onSaved();
  }, [saved, onSaved]);

  const fieldErrors = !state.ok && state.fieldErrors ? state.fieldErrors : {};
  const set = (name: string, value: FieldValue) => setValues((prev) => ({ ...prev, [name]: value }));

  // Mashbill grains are a list, not a field — they ride along in one hidden
  // input the editor maintains.
  const [grains, setGrains] = React.useState<GrainRow[]>(() => parseGrainRows(row?.values?.grains));

  return (
    <form action={formAction} className="flex min-h-0 flex-col">
      <div className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto p-6 sm:grid-cols-2">
        {fields.map((field) => (
          <React.Fragment key={field.name}>
            <Field
              spec={field}
              idPrefix={resourceKey}
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
              excludeId={row?.id}
            />
            {resourceKey === "mashbills" && field.name === "distilleryId" ? (
              <GrainEditor rows={grains} onChange={setGrains} error={fieldErrors.grains} />
            ) : null}
          </React.Fragment>
        ))}

        {!state.ok && state.error ? (
          <p role="alert" className="col-span-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {row ? `Save ${singular.toLowerCase()}` : `Add ${singular.toLowerCase()}`}
        </Button>
      </DialogFooter>
    </form>
  );
}
