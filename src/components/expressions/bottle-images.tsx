"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { GripVertical, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Grain } from "@/components/ui/grain";
import { cn } from "@/lib/utils";
import { seededRandom, seededRange } from "@/lib/seeded-random";
import { scallopRectClipPath } from "@/lib/scallop-edge";
import { deleteBottleImageAction, reorderBottleImagesAction, setPrimaryImageAction } from "@/app/(app)/bottles/actions";
import type { ActionResult } from "@/lib/admin/types";
import type { PhotoKind } from "@/db/schema";

export type BottleImage = {
  id: number;
  filePath: string;
  thumbPath: string | null;
  isPrimary: boolean;
  kind: PhotoKind;
};

// A modern self-adhesive Forever stamp, not a water-activated one: a
// continuous die-cut wavy edge rather than round perforation holes, a
// thin frame right against the photo, and more white margin at the
// bottom than the other three sides.
const STAMP_MARGIN_X = 9;
const STAMP_MARGIN_TOP = 9;
const STAMP_MARGIN_BOTTOM = 16;

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
        <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {order.length === 0 ? (
        <p className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No photos yet. The first one you add becomes the hero image.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {order.map((image, index) => {
            // Catalog shots (label/product photos, usually already cut out)
            // read as die-cut stickers — the photo's own silhouette, no
            // frame. Life photos (snapshots of the actual bottle) read as
            // postage stamps — white paper, a punched-hole border. Seeded
            // off the image id so the tilt is stable across visits.
            const rng = seededRandom(image.id);
            const rotateDeg = seededRange(rng, -6, 6);
            const isSticker = image.kind === "catalog";

            return (
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
                className={cn("group relative aspect-square", isSticker && "p-1", dragging === index && "opacity-50")}
                style={{
                  transform: `rotate(${rotateDeg.toFixed(2)}deg)`,
                  ...(isSticker
                    ? {}
                    : {
                        // `filter` renders its effect region and *then* gets
                        // clipped by this same element's own `clip-path` — a
                        // drop-shadow that's supposed to bleed past the
                        // scalloped silhouette gets sliced off by that exact
                        // silhouette and disappears entirely. Keeping the
                        // shadow filter here, on the unclipped li, and the
                        // clip-path one level down on the card itself, lets
                        // the shadow trace the clipped shape without being
                        // clipped along with it.
                        filter:
                          // Light from 315° (upper-left) casts the shadow
                          // toward the opposite corner — equal x/y offset.
                          "drop-shadow(1px 1px 0.5px rgb(23 23 23 / 0.18))",
                      }),
                }}
              >
                {isSticker ? (
                  <Image
                    src={`/api/images/${image.thumbPath ?? image.filePath}`}
                    alt=""
                    width={480}
                    height={480}
                    unoptimized
                    className="size-full object-contain p-2 [filter:drop-shadow(0_3px_3px_rgb(0_0_0_/_0.35))]"
                  />
                ) : (
                  <div
                    className="relative size-full"
                    style={{
                      backgroundColor: "var(--color-paper)",
                      padding: `${STAMP_MARGIN_TOP}px ${STAMP_MARGIN_X}px ${STAMP_MARGIN_BOTTOM}px`,
                      clipPath: scallopRectClipPath(),
                    }}
                  >
                    {/* Paper fiber across the whole card. */}
                    <Grain opacity={0.11} />
                    <div
                      className="relative size-full overflow-hidden shadow-[inset_0_1px_3px_rgb(0_0_0_/_0.35)]"
                      style={{ border: "1px solid rgb(0 0 0 / 0.18)" }}
                    >
                      <Image
                        src={`/api/images/${image.thumbPath ?? image.filePath}`}
                        alt=""
                        width={480}
                        height={480}
                        unoptimized
                        className="size-full object-cover"
                      />
                      {/* A little vignette + print grain so the photo itself
                          doesn't read as a flat, evenly-lit render. */}
                      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_55%,rgb(0_0_0_/_0.18)_100%)]" />
                      <Grain opacity={0.08} />
                    </div>
                  </div>
                )}

                {image.isPrimary ? (
                  <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    Hero
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
                      onClick={() => void deleteBottleImageAction(image.id).then(() => router.refresh())}
                      aria-label="Delete photo"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
