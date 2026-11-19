"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { LabelPhotoControls, type LabelPhotoControlsHandle } from "@/components/expressions/label-photo-controls";
import { Polaroid } from "@/components/ui/polaroid";
import type { MissingPhoto } from "@/lib/housekeeping/photo-queries";
import { cn } from "@/lib/utils";

/** The first image among pasted or dropped files, or null: a PDF, text or nothing is never sent. */
export function firstImage(files: FileList | File[] | null | undefined): File | null {
  return Array.from(files ?? []).find((file) => file.type.startsWith("image/")) ?? null;
}

const NOT_AN_IMAGE = "That needs to be an image.";

/**
 * One label, barrel or vintage that has no photo: the app's instant-photo frame with the same controls as the label
 * page. Click the card and paste a copied image, or drop a file on it. After a save the card stays put, so the page
 * does not shift under the next photo.
 */
export function PhotoCard({ item }: { item: MissingPhoto }) {
  const controls = React.useRef<LabelPhotoControlsHandle>(null);
  const [done, setDone] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  function take(files: FileList | null | undefined) {
    if (!files || files.length === 0) return;
    const image = firstImage(files);
    if (!image) {
      setNotice(NOT_AN_IMAGE);
      return;
    }
    setNotice(null);
    controls.current?.uploadFile(image);
  }

  const { target } = item;
  return (
    <div
      tabIndex={0}
      className={cn(
        "flex min-w-0 flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
        done && "opacity-60",
      )}
      onPaste={(event) => {
        // Pasting into the link box is for the link box.
        if ((event.target as HTMLElement).closest("input, textarea")) return;
        if (event.clipboardData.files.length === 0) return;
        event.preventDefault();
        take(event.clipboardData.files);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        take(event.dataTransfer.files);
      }}
    >
      <Polaroid seed={item.seed}>
        {done ? (
          <Check className="size-10 text-muted-foreground" aria-hidden />
        ) : (
          <p className="text-sm text-muted-foreground">No photo yet</p>
        )}
      </Polaroid>
      <div className="flex flex-col gap-0.5">
        <p className="break-words font-semibold leading-snug">{item.name}</p>
        <p className="text-xs text-muted-foreground">{item.meta}</p>
      </div>
      {done ? (
        <p role="status" className="text-sm text-success">
          Photo added.
        </p>
      ) : (
        <>
          <LabelPhotoControls
            ref={controls}
            hasPhoto={false}
            housekeeping
            refreshOnSave={false}
            onSaved={() => setDone(true)}
            {...(target.kind === "barrel"
              ? { bottleId: target.bottleId }
              : target.kind === "vintage"
                ? { expressionId: target.expressionId, releaseId: target.vintageId }
                : { expressionId: target.expressionId })}
          />
          {notice ? (
            <p role="alert" className="text-sm text-destructive">
              {notice}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
