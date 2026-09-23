import { cn } from "@/lib/utils";

/**
 * A texture overlay for the physical-object components (Polaroid, stamp).
 * Defaults to `multiply`: `overlay`/`soft-light` barely move a pixel that's
 * already near white or near black (the formula pins toward the backdrop
 * at the extremes), and the paper/card tokens this sits on are exactly
 * that — near white. `multiply` darkens proportionally to the noise at any
 * backdrop brightness, which is what actually reads as grain here. Always
 * `pointer-events-none` and purely decorative.
 */
export function Grain({
  opacity = 0.16,
  blend = "multiply",
  className,
}: {
  opacity?: number;
  blend?: "multiply" | "overlay" | "soft-light";
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 bg-grain", className)}
      style={{ opacity, mixBlendMode: blend }}
    />
  );
}
