import * as React from "react";
import { cn } from "@/lib/utils";
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
  const clipPath = torn ? tornRectClipPath(rng, 6, 3, 5) : undefined;
  const font = TAPE_FONTS[Math.floor(rng() * TAPE_FONTS.length)];

  return (
    <div
      className={cn("flex flex-col bg-paper p-3 pb-8 shadow-md", !torn && "rounded-sm", className)}
      style={{ clipPath, transform: `rotate(${rotateDeg.toFixed(2)}deg)` }}
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted">{children}</div>
      {caption ? (
        <p className={cn("mt-3 text-center text-lg leading-none text-tape-ink", font?.className)}>{caption}</p>
      ) : null}
    </div>
  );
}
