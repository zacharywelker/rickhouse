"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeLabelPhotoAction } from "@/app/(app)/expressions/photo-actions";
import { removeReleasePhotoAction } from "@/app/(app)/expressions/release-actions";
import type { ActionResult } from "@/lib/admin/types";

/** Upload, link and remove for a label's photo — or, with `releaseId`, one of its releases' — shown under its frame. */
export function LabelPhotoControls({
  expressionId,
  releaseId,
  hasPhoto,
}: {
  expressionId: number;
  releaseId?: number;
  hasPhoto: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ error: boolean; text: string } | null>(null);
  const [linking, setLinking] = React.useState(false);
  const [link, setLink] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function finish(result: ActionResult) {
    setBusy(false);
    setMessage(result.ok ? { error: false, text: result.message ?? "Done." } : { error: true, text: result.error });
    router.refresh();
  }

  async function upload(file: File | null, imageUrl?: string) {
    if (!file && !imageUrl) return;
    const data = new FormData();
    if (file) data.append("photo", file);
    if (imageUrl) data.append("imageUrl", imageUrl);
    setBusy(true);
    setMessage(null);
    const url =
      releaseId === undefined
        ? `/api/expressions/${expressionId}/photo`
        : `/api/expressions/${expressionId}/releases/${releaseId}/photo`;
    const response = await fetch(url, { method: "POST", body: data });
    const result: ActionResult = await response.json();
    if (result.ok) {
      setLink("");
      setLinking(false);
    }
    if (inputRef.current) inputRef.current.value = "";
    await finish(result);
  }

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
        {hasPhoto ? (
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
          aria-label="Upload label photo"
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
}
