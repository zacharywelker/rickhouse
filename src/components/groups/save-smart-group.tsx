"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSmartGroupAction } from "@/app/(app)/groups/actions";

/**
 * Turns the Collection's current filters into a group that keeps itself up
 * to date: "every store pick over 115 proof" stays true as bottles come and go.
 */
export function SaveSmartGroup({ query }: { query: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await createSmartGroupAction(name, query);
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors?.name ?? result.error);
      return;
    }
    setOpen(false);
    router.push(`/groups/${result.createdId}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Save as smart group
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save as smart group</DialogTitle>
          <DialogDescription>
            A group that keeps these filters. Bottles join and leave it on their own as the collection changes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void save(e)} className="flex flex-col gap-4 p-6 pt-0">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smart-group-name">Name</Label>
            <Input
              id="smart-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Barrel-proof store picks"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "smart-group-error" : undefined}
              autoFocus
            />
            {error ? (
              <p id="smart-group-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save group
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
