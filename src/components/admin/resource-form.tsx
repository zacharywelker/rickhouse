"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { saveResourceAction } from "@/app/(app)/admin/actions";
import { IDLE_RESULT, type ActionResult, type AdminRow, type FieldSpec, type Option } from "@/lib/admin/types";
import { descendantsOf } from "@/lib/admin/tree";
import { MashbillSum } from "./mashbill-sum";
import { ReferenceCombobox } from "./reference-combobox";

type FormValues = Record<string, string | boolean>;

function initialValues(fields: FieldSpec[], row: AdminRow | null): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    const existing = row?.values[field.name];
    if (field.kind === "checkbox") {
      values[field.name] = existing === true;
    } else if (field.kind === "select") {
      values[field.name] = typeof existing === "string" ? existing : (field.options[0]?.value ?? "");
    } else if (existing === null || existing === undefined) {
      // Creating: fall back to the column default so required fields with a
      // sensible value are not presented as empty and then rejected.
      values[field.name] = row === null && field.kind === "text" ? (field.defaultValue ?? "") : "";
    } else {
      values[field.name] = String(existing);
    }
  }
  return values;
}

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
  const [values, setValues] = React.useState<FormValues>(() => initialValues(fields, row));
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
  const set = (name: string, value: string | boolean) => setValues((prev) => ({ ...prev, [name]: value }));

  return (
    <form action={formAction} className="flex min-h-0 flex-col">
      <div className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto p-6 sm:grid-cols-2">
        {fields.map((field) => {
          const error = fieldErrors[field.name];
          const inputId = `${resourceKey}-${field.name}`;
          const span = field.span === "half" ? "sm:col-span-1" : "col-span-full";

          return (
            <React.Fragment key={field.name}>
              <div className={cn("flex flex-col gap-1.5", span)}>
                {/* The asterisk sits outside the <label> so the label's text is
                    exactly the field name, for screen readers and for tests. */}
                <div className="flex items-center gap-1">
                  <Label id={`${inputId}-label`} htmlFor={inputId}>
                    {field.label}
                  </Label>
                  {"required" in field && field.required ? (
                    <span aria-hidden="true" className="text-sm text-destructive">
                      *
                    </span>
                  ) : null}
                </div>

                {field.kind === "text" || field.kind === "number" ? (
                  <Input
                    id={inputId}
                    name={field.name}
                    type={field.kind === "number" ? "number" : "text"}
                    value={String(values[field.name] ?? "")}
                    onChange={(e) => set(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    aria-invalid={error ? true : undefined}
                    className={cn(error && "border-destructive")}
                    {...(field.kind === "number"
                      ? { min: field.min, max: field.max, step: field.step ?? 1 }
                      : {})}
                  />
                ) : null}

                {field.kind === "textarea" ? (
                  <Textarea
                    id={inputId}
                    name={field.name}
                    value={String(values[field.name] ?? "")}
                    onChange={(e) => set(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    className={cn(error && "border-destructive")}
                  />
                ) : null}

                {field.kind === "select" ? (
                  <select
                    id={inputId}
                    name={field.name}
                    value={String(values[field.name] ?? "")}
                    onChange={(e) => set(field.name, e.target.value)}
                    className={cn(
                      "h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      error && "border-destructive",
                    )}
                  >
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : null}

                {field.kind === "checkbox" ? (
                  <div className="flex h-10 items-center gap-2">
                    <Checkbox
                      id={inputId}
                      checked={values[field.name] === true}
                      onCheckedChange={(checked) => set(field.name, checked === true)}
                    />
                    <input type="hidden" name={field.name} value={values[field.name] === true ? "on" : ""} />
                    <Label htmlFor={inputId} className="cursor-pointer text-foreground">
                      {field.help ?? field.label}
                    </Label>
                  </div>
                ) : null}

                {field.kind === "reference"
                  ? (() => {
                      const all = optionsByField[field.name] ?? [];
                      const raw = values[field.name];
                      const current = typeof raw === "string" && raw !== "" ? Number(raw) : null;
                      const excludeIds =
                        field.excludeSelfAndDescendants && row
                          ? descendantsOf(all.map((o) => ({ id: o.value, parentId: o.parentId })), row.id)
                          : undefined;
                      return (
                        <>
                          <ReferenceCombobox
                            id={inputId}
                            labelledBy={`${inputId}-label`}
                            resource={field.resource}
                            options={all}
                            value={current}
                            onChange={(next) => set(field.name, next === null ? "" : String(next))}
                            onOptionCreated={(option) =>
                              setOptionsByField((prev) => ({
                                ...prev,
                                [field.name]: [...(prev[field.name] ?? []), option].sort((a, b) =>
                                  a.label.localeCompare(b.label),
                                ),
                              }))
                            }
                            {...(excludeIds ? { excludeIds } : {})}
                            invalid={error !== undefined}
                          />
                          <input type="hidden" name={field.name} value={String(values[field.name] ?? "")} />
                        </>
                      );
                    })()
                  : null}

                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : field.help && field.kind !== "checkbox" ? (
                  <p className="text-xs text-muted-foreground">{field.help}</p>
                ) : null}
              </div>

              {resourceKey === "mashbills" && field.name === "otherGrain" ? <MashbillSum values={values} /> : null}
            </React.Fragment>
          );
        })}

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
