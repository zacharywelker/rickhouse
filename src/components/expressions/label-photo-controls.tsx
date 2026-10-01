"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addLabelPhotoToBottleAction, removeLabelPhotoAction } from "@/app/(app)/expressions/photo-actions";
import type { ActionResult } from "@/lib/admin/types";

/** Upload, link, remove and copy-to-bottle for a label's photo, shown under its frame. */
export function LabelPhotoControls({
  expressionId,
  hasPhoto,
  bottles,
}: {
  expressionId: number;
  hasPhoto: boolean;
  bottles: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ error: boolean; text: string } | null>(null);
  const [linking, setLinking] = React.useState(false);
  const [link, setLink] = React.useState("");
  const [bottleId, setBottleId] = React.useState(bottles[0]?.id ?? 0);
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
    const response = await fetch(`/api/expressions/${expressionId}/photo`, { method: "POST", body: data });
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
              void removeLabelPhotoAction(expressionId).then(finish);
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

      {hasPhoto && bottles.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Bottle to add the photo to"
            value={bottleId}
            onChange={(event) => setBottleId(Number(event.target.value))}
            className="h-8 min-w-0 flex-1 border border-input bg-background px-2 text-sm"
          >
            {bottles.map((bottle) => (
              <option key={bottle.id} value={bottle.id}>
                {bottle.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setMessage(null);
              void addLabelPhotoToBottleAction(expressionId, bottleId).then(finish);
            }}
          >
            Add to bottle
          </Button>
        </div>
      ) : null}

      {message ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
