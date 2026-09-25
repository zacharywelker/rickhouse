"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import {
  deleteUserAction,
  resetPasswordAction,
  setActiveAction,
  setRoleAction,
  type UserActionResult,
} from "@/app/(app)/system/users/actions";
import type { UserRole } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TemporaryPassword } from "./temporary-password";

type Props = { userId: number; username: string; role: UserRole; active: boolean };

export function UserActions({ userId, username, role, active }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<UserActionResult | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  function run(action: () => Promise<UserActionResult>, after?: () => void) {
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setRoleAction(userId, role === "admin" ? "member" : "admin"))}
        >
          {role === "admin" ? "Make member" : "Make admin"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setActiveAction(userId, !active))}
        >
          {active ? "Deactivate" : "Reactivate"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => resetPasswordAction(userId))}>
          Reset password
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          aria-label={`Delete ${username}`}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {result && !result.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      ) : null}
      {result?.ok && result.password ? <TemporaryPassword label={result.message} password={result.password} /> : null}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {username}?</DialogTitle>
            <DialogDescription>
              Their account and their entire collection — bottles, labels, groups and photos — are removed for good. To
              keep everything but lock them out, deactivate the account instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Keep it
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => deleteUserAction(userId), () => setConfirmDelete(false))}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
