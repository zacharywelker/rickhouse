import * as React from "react";
import { cn } from "@/lib/utils";
import { Grain } from "@/components/ui/grain";
import { seededRandom, seededRange } from "@/lib/seeded-random";
import { tornRectClipPath } from "@/lib/torn-edge";
import { TAPE_FONTS } from "@/lib/tape-fonts";

/**
 * The bottle hero shot, framed like an instant photo someone tucked into
 * the page: white card, thick bottom margin, a slight tilt, and a caption
 * scrawled underneath. Seeded off the bottle id rather than `Math.random()`
 * so the look is stable across visits — it's a property of the page, not
 * of the render (unlike Tape, which deliberately rerolls on every mount).
 *
 * Roughly 4 in 10 bottles get a torn edge instead of a clean-cut one, so
 * the page doesn't read as "every photo has the same effect applied."
 */
export function Polaroid({
  seed,
  caption,
  className,
  children,
}: {
  seed: number;
  caption?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const rng = seededRandom(seed);
  const rotateDeg = seededRange(rng, -3, 3);
  const torn = rng() < 0.4;
  const clipPath = torn ? tornRectClipPath(rng, 6, 9) : undefined;
  const font = TAPE_FONTS[Math.floor(rng() * TAPE_FONTS.length)];

  return (
    <div
      className={cn("relative flex flex-col bg-paper p-3 pb-8", !torn && "rounded-sm", className)}
      style={{
        clipPath,
        transform: `rotate(${rotateDeg.toFixed(2)}deg)`,
        // Two shadows instead of one flat `shadow-md`: a tight, dark
        // contact shadow right under the paper (where it actually
        // touches the page) plus a wider, softer one for the lift —
        // a single uniform blur reads as "div with box-shadow," not a
        // print sitting on a surface. Cast at 315° (light from the
        // upper-left) to match the stamp's shadow, rather than straight
        // down — equal x/y offset on both layers.
        boxShadow: "1px 1px 1px rgb(23 23 23 / 0.22), 7px 7px 18px -8px rgb(23 23 23 / 0.28)",
        // The card stock isn't a flat swatch — a soft, off-axis gradient
        // reads as light falling unevenly across real paper instead of a
        // perfectly uniform color fill.
        backgroundImage: "linear-gradient(155deg, rgb(255 255 255 / 0.5), transparent 55%)",
      }}
    >
      {/* Paper fiber, over the whole card including the border strip. */}
      <Grain opacity={0.1} />
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted shadow-[inset_0_1px_4px_rgb(0_0_0_/_0.35)]">
        {children}
        {/* A vignette and a sheen across the photo emulsion — light falls
            off toward the corners and catches unevenly, rather than the
            photo reading as a flat, evenly-lit render. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/15" />
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_45%,rgb(0_0_0_/_0.24)_100%)]" />
        {/* Print grain sits directly on the image, a touch heavier than the
            paper's own fiber so it reads as the photo's own grain. */}
        <Grain opacity={0.09} />
      </div>
      {caption ? (
        <p className={cn("relative mt-3 text-center text-lg leading-none text-tape-ink", font?.className)}>
          {caption}
        </p>
      ) : null}
    </div>
  );
}
