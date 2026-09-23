"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { GripVertical, ImagePlus, Loader2, Star, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteBottleImageAction,
  reorderBottleImagesAction,
  setImageKindAction,
  setPrimaryImageAction,
} from "@/app/(app)/bottles/actions";
import type { ActionResult } from "@/lib/admin/types";
import type { PhotoKind } from "@/db/schema";

export type BottleImage = {
  id: number;
  filePath: string;
  thumbPath: string | null;
  isPrimary: boolean;
  kind: PhotoKind;
};

export function BottleImages({ bottleId, images }: { bottleId: number; images: BottleImage[] }) {
  const router = useRouter();
  const [order, setOrder] = React.useState(images);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setOrder(images), [images]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const data = new FormData();
    for (const file of Array.from(files)) data.append("images", file);
    setBusy(true);
    setError(null);
    // A route handler, not a Server Action: with this app's auth middleware
    // matching every route, Next.js 15.5's Server Action body-cloning path
    // can silently drop multipart file data in production (the request still
    // completes with 200, just with an empty FormData on the other end). A
    // route handler reads the request body directly and doesn't hit that path.
    const response = await fetch(`/api/bottles/${bottleId}/images`, { method: "POST", body: data });
    const result: ActionResult = await response.json();
    setBusy(false);
    if (!result.ok) setError(result.error);
    if (inputRef.current) inputRef.current.value = "";
    // Refresh explicitly rather than leaning on revalidation to land in time:
    // the new photo has to appear the moment the upload returns.
    router.refresh();
  }

  async function persist(next: BottleImage[]) {
    setOrder(next);
    await reorderBottleImagesAction(
      bottleId,
      next.map((image) => image.id),
    );
  }

  function moveTo(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row!);
    void persist(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl">Photos</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          Add photos
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label="Add photos"
          onChange={(e) => void upload(e.target.files)}
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {order.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No photos yet. The first one you add becomes the hero image.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {order.map((image, index) => (
            <li
              key={image.id}
              draggable
              onDragStart={() => setDragging(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null) moveTo(dragging, index);
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
              className={cn(
                "group relative overflow-hidden rounded-lg border border-border bg-muted",
                dragging === index && "opacity-50",
              )}
            >
              <Image
                src={`/api/images/${image.thumbPath ?? image.filePath}`}
                alt=""
                width={480}
                height={480}
                unoptimized
                className="aspect-square w-full object-cover"
              />

              {image.isPrimary ? (
                <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                  Hero
                </span>
              ) : null}

              {image.kind === "catalog" ? (
                <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
                  Catalog
                </span>
              ) : null}

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 p-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <span className="pl-1 text-white/70" aria-hidden="true">
                  <GripVertical className="size-4" />
                </span>
                <div className="flex flex-wrap items-center justify-end gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-white hover:bg-white/20"
                    onClick={() => void setPrimaryImageAction(image.id).then(() => router.refresh())}
                    disabled={image.isPrimary}
                    aria-label="Make hero image"
                  >
                    <Star className={cn("size-4", image.isPrimary && "fill-current")} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-white hover:bg-white/20"
                    onClick={() => {
                      const kind = image.kind === "catalog" ? "life" : "catalog";
                      void setImageKindAction(image.id, kind).then(() => router.refresh());
                    }}
                    aria-label={image.kind === "catalog" ? "Mark as a life photo" : "Mark as a catalog photo"}
                    aria-pressed={image.kind === "catalog"}
                  >
                    <Tag className={cn("size-4", image.kind === "catalog" && "fill-current")} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-white hover:bg-white/20"
                    onClick={() => void deleteBottleImageAction(image.id).then(() => router.refresh())}
                    aria-label="Delete photo"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
