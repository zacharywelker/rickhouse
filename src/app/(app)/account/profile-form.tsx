"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile, type ProfileState } from "./actions";

export function ProfileForm({ name, username }: { name: string; username: string }) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(updateProfile, {
    ok: true,
    message: null,
  });

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input id="profile-name" name="name" defaultValue={name} autoComplete="name" required />
        <p className="text-xs text-muted-foreground">The first word is what the header shows.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-username">Username</Label>
        <Input
          id="profile-username"
          name="username"
          defaultValue={username}
          autoComplete="username"
          autoCapitalize="none"
          required
        />
        <p className="text-xs text-muted-foreground">Letters, numbers, dots and underscores. You sign in with it.</p>
      </div>
      {state.message ? (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm" : "text-sm text-destructive"}>
          {state.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
