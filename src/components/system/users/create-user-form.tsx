"use client";

import { useActionState } from "react";
import { createUserAction, type UserActionResult } from "@/app/(app)/system/users/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemporaryPassword } from "./temporary-password";

export function CreateUserForm({ canInvite }: { canInvite: boolean }) {
  const [state, formAction, pending] = useActionState<UserActionResult | null, FormData>(createUserAction, null);
  // Remount the fields after a success so the next account starts blank.
  const formKey = state?.ok ? state.password : "form";

  return (
    <div className="flex flex-col gap-4">
      <form key={formKey} action={formAction} className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-user-name">Name</Label>
          <Input id="new-user-name" name="name" autoComplete="off" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-user-username">Username</Label>
          <Input id="new-user-username" name="username" autoComplete="off" autoCapitalize="none" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-user-email">Email</Label>
          <Input id="new-user-email" name="email" type="email" autoComplete="off" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-user-role">Role</Label>
          <select
            id="new-user-role"
            name="role"
            defaultValue="member"
            className="flex h-10 w-full border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {canInvite ? (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="invite" defaultChecked />
            Email them an invitation to choose their own password (instead of a temporary one)
          </label>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create account"}
          </Button>
        </div>
      </form>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.ok && !state.password ? (
        <p role="status" className="text-sm">
          {state.message}
        </p>
      ) : null}
      {state?.ok && state.password ? (
        <TemporaryPassword label={`${state.message} Their temporary password:`} password={state.password} />
      ) : null}
    </div>
  );
}
