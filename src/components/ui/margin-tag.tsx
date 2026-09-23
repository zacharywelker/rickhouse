import * as React from "react";
import { cn } from "@/lib/utils";
import { seededRandom, seededRange } from "@/lib/seeded-random";
import { TAPE_FONTS } from "@/lib/tape-fonts";

/**
 * A badge fact rewritten as something jotted in the margin — handwriting,
 * a slight tilt, a wavy pen-underline — instead of a pill in a box. Seeded
 * per label so the same tag looks the same on every visit, but different
 * tags on the same bottle don't all reroll identically.
 */
export function MarginTag({ children, seed = 0, className }: { children: React.ReactNode; seed?: number; className?: string }) {
  const rng = seededRandom(seed);
  const rotateDeg = seededRange(rng, -4, 4);
  const font = TAPE_FONTS[Math.floor(rng() * TAPE_FONTS.length)];

  return (
    <span
      className={cn(
        "inline-block text-lg leading-none text-accent decoration-accent/70 decoration-2 underline underline-offset-4 [text-decoration-style:wavy]",
        font?.className,
        className,
      )}
      style={{ transform: `rotate(${rotateDeg.toFixed(2)}deg)` }}
    >
      {children}
    </span>
  );
}
