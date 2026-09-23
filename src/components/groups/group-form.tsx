"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveGroupAction } from "@/app/(app)/groups/actions";
import { IDLE_RESULT, type ActionResult } from "@/lib/admin/types";

export type GroupFormValues = { name: string; description: string | null };

export function GroupForm({
  groupId,
  initialValues,
}: {
  groupId: number | null;
  initialValues: GroupFormValues | null;
}) {
  const router = useRouter();
  const action = saveGroupAction.bind(null, groupId);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, IDLE_RESULT);

  const saved = state.ok && state.message !== "";
  const createdId = state.ok ? state.createdId : undefined;
  React.useEffect(() => {
    if (!saved || createdId === undefined) return;
    router.push(`/groups/${createdId}`);
    router.refresh();
  }, [saved, createdId, router]);

  const fieldErrors = !state.ok && state.fieldErrors ? state.fieldErrors : {};

  return (
    <Card className="max-w-xl">
      <CardContent className="p-5">
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={120}
              placeholder="Japan 2026"
              defaultValue={initialValues?.name ?? ""}
            />
            {fieldErrors.name ? (
              <p role="alert" className="text-sm text-destructive">
                {fieldErrors.name}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={4}
              placeholder="What ties these bottles together?"
              defaultValue={initialValues?.description ?? ""}
            />
            {fieldErrors.description ? (
              <p role="alert" className="text-sm text-destructive">
                {fieldErrors.description}
              </p>
            ) : null}
          </div>

          {!state.ok && state.error ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {groupId ? "Save changes" : "Create group"}
            </Button>
            {groupId ? (
              <Button type="button" variant="outline" onClick={() => router.push(`/groups/${groupId}`)} disabled={pending}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
