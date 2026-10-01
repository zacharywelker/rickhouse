"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createdOptionAction, resourceFormSpecAction } from "@/app/(app)/admin/actions";
import type { DetailedResource, Option, ResourceFormSpec } from "@/lib/admin/types";
import { ResourceForm } from "./resource-form";

/**
 * Any lookup row (company, brand, distillery, finish, store, tag, category or mashbill) made with its whole form, from
 * inside a picker on another page — so a label can be started with a brand
 * that does not exist yet without abandoning the label to go and make it.
 * Opened from a picker's "Add details" row; the new row is handed straight back
 * to that picker.
 */
export function CreateWithDetailsDialog({
  resource,
  open,
  onOpenChange,
  initialName,
  onCreated,
}: {
  resource: DetailedResource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What was typed in the picker, used as the new row's name. */
  initialName: string;
  onCreated: (option: Option) => void;
}) {
  const [spec, setSpec] = React.useState<ResourceFormSpec | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let current = true;
    void resourceFormSpecAction(resource).then((next) => current && setSpec(next));
    return () => {
      current = false;
      setSpec(null);
    };
  }, [open, resource]);

  const handleSaved = React.useCallback(
    (createdId?: number) => {
      onOpenChange(false);
      if (createdId === undefined) return;
      void createdOptionAction(resource, createdId).then((result) => {
        if (result.ok) onCreated(result.option);
      });
    },
    [onOpenChange, onCreated, resource],
  );

  const singular = spec?.ok ? spec.singular : resource === "companies" ? "Company" : "New";
  const hasName = resource !== "mashbills" && initialName.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add {singular.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Saved straight to your collection, and chosen here when you are done.
          </DialogDescription>
        </DialogHeader>
        {spec === null ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : !spec.ok ? (
          <p role="alert" className="p-6 text-sm text-destructive">
            {spec.error}
          </p>
        ) : (
          <ResourceForm
            resourceKey={resource}
            singular={spec.singular}
            fields={spec.fields}
            options={spec.options}
            row={null}
            onSaved={handleSaved}
            {...(hasName ? { initialValues: { name: initialName.trim() } } : {})}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
