"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeLabelPhotoAction } from "@/app/(app)/expressions/photo-actions";
import { removeReleasePhotoAction } from "@/app/(app)/expressions/release-actions";
import type { ActionResult } from "@/lib/admin/types";

/** Where a photo is posted, and the form field the route reads it from. A bottle's gallery takes `images`; the rest take `photo`. */
export function uploadTarget(t: { expressionId?: number; releaseId?: number; bottleId?: number }): {
  url: string;
  field: "photo" | "images";
} {
  if (t.bottleId !== undefined) return { url: `/api/bottles/${t.bottleId}/images`, field: "images" };
  if (t.expressionId === undefined) throw new Error("A photo target needs a label or a bottle.");
  if (t.releaseId !== undefined) return { url: `/api/expressions/${t.expressionId}/vintages/${t.releaseId}/photo`, field: "photo" };
  return { url: `/api/expressions/${t.expressionId}/photo`, field: "photo" };
}

/** What a parent can ask of the controls: save a file it was handed (a paste or a drop), as if it had been chosen. */
export type LabelPhotoControlsHandle = { uploadFile: (file: File) => void };

type Props = {
  /** The label. Not needed when `bottleId` is given. */
  expressionId?: number;
  releaseId?: number;
  /** Save to this bottle's gallery instead of a label or vintage photo. */
  bottleId?: number;
  hasPhoto: boolean;
  /** Said on arrival, as when New Label saved the label but not its photo. */
  initialError?: string | null;
  /** Sent with every request so the server applies Housekeeping's rules (the 600 px minimum). */
  housekeeping?: boolean;
  /** Refresh the page after a save. On by default; a list that keeps its cards in place turns it off. */
  refreshOnSave?: boolean;
  /** Called after a photo is saved. */
  onSaved?: () => void;
};

/** Upload, link and remove for a label's photo — or, with `releaseId`, one of its vintages' — shown under its frame. */
export const LabelPhotoControls = React.forwardRef<LabelPhotoControlsHandle, Props>(function LabelPhotoControls(
  { expressionId, releaseId, bottleId, hasPhoto, initialError = null, housekeeping = false, refreshOnSave = true, onSaved },
  ref,
) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  // A paste or drop can arrive twice before a render shows `busy`, so the guard is a ref.
  const working = React.useRef(false);
  const [message, setMessage] = React.useState<{ error: boolean; text: string } | null>(
    initialError ? { error: true, text: initialError } : null,
  );
  const [linking, setLinking] = React.useState(false);
  const [link, setLink] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function finish(result: ActionResult) {
    working.current = false;
    setBusy(false);
    setMessage(result.ok ? { error: false, text: result.message ?? "Done." } : { error: true, text: result.error });
    if (result.ok) onSaved?.();
    if (refreshOnSave) router.refresh();
  }

  async function upload(file: File | null, imageUrl?: string) {
    if (!file && !imageUrl) return;
    if (working.current) return;
    working.current = true;
    const target = uploadTarget({ expressionId, releaseId, bottleId });
    const data = new FormData();
    if (file) data.append(target.field, file);
    if (imageUrl) data.append("imageUrl", imageUrl);
    if (housekeeping) data.append("source", "housekeeping");
    setBusy(true);
    setMessage(null);
    const response = await fetch(target.url, { method: "POST", body: data });
    const result: ActionResult = await response.json();
    if (result.ok) {
      setLink("");
      setLinking(false);
    }
    if (inputRef.current) inputRef.current.value = "";
    await finish(result);
  }

  React.useImperativeHandle(ref, () => ({ uploadFile: (file: File) => void upload(file) }));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {hasPhoto ? "Replace photo" : "Add photo"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setLinking((on) => !on)}>
          From a link
        </Button>
        {hasPhoto && expressionId !== undefined ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void (releaseId === undefined ? removeLabelPhotoAction(expressionId) : removeReleasePhotoAction(releaseId)).then(
                finish,
              );
            }}
          >
            Remove
          </Button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={bottleId !== undefined ? "Upload bottle photo" : "Upload label photo"}
          onChange={(e) => void upload(e.target.files?.[0] ?? null)}
        />
      </div>

      {linking ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void upload(null, link.trim());
          }}
        >
          <Input
            type="url"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://example.com/label.jpg"
            aria-label="Link to a photo"
            autoComplete="off"
          />
          <Button type="submit" size="sm" disabled={busy || link.trim() === ""}>
            Add
          </Button>
        </form>
      ) : null}

      {message ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
});
