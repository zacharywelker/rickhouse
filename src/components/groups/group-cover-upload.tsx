"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeGroupCoverAction } from "@/app/(app)/groups/actions";
import type { ActionResult } from "@/lib/admin/types";

/** A Group's cover image (DESIGN.md §23): one photo, uploaded the same way bottle photos are. */
export function GroupCoverUpload({ groupId, coverImagePath }: { groupId: number; coverImagePath: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const data = new FormData();
    data.append("cover", file);
    setBusy(true);
    setError(null);
    // Route handler, not a Server Action — see bottles/[id]/images for why.
    const response = await fetch(`/api/groups/${groupId}/cover`, { method: "POST", body: data });
    const result: ActionResult = await response.json();
    setBusy(false);
    if (!result.ok) setError(result.error);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex aspect-[3/2] w-full items-center justify-center overflow-hidden border border-border bg-muted/40">
        {coverImagePath ? (
          <Image src={`/api/images/${coverImagePath}`} alt="" fill unoptimized className="object-cover" />
        ) : (
          <p className="px-6 text-center text-sm text-muted-foreground">No cover image yet.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {coverImagePath ? "Replace cover" : "Add cover image"}
        </Button>
        {coverImagePath ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void removeGroupCoverAction(groupId).then(() => router.refresh())}
            disabled={busy}
          >
            <Trash2 className="size-4" />
            Remove
          </Button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Upload cover image"
          onChange={(e) => void upload(e.target.files)}
        />
      </div>

      {error ? (
        <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
