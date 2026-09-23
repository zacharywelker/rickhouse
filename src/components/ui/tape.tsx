import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Painter's tape — the recurring physical device from DESIGN.md §10 and
 * DESIGN-TOKENS.md §27. Used for category labels, OPEN/BACK BAR/GIFT tags,
 * warnings, and other contextual annotations. It should look like something
 * somebody physically stuck down, not a generic UI badge — so unlike Badge,
 * it always carries a slight tilt and a lifted shadow, and its color range
 * is the eight controlled tape hues rather than the app's semantic palette.
 */
export type TapeColor = "coral" | "orange" | "yellow" | "green" | "blue" | "pink" | "purple" | "neutral";

const TAPE_BG: Record<TapeColor, string> = {
  coral: "bg-tape-coral/90",
  orange: "bg-tape-orange/90",
  yellow: "bg-tape-yellow/90",
  green: "bg-tape-green/90",
  blue: "bg-tape-blue/90",
  pink: "bg-tape-pink/90",
  purple: "bg-tape-purple/90",
  neutral: "bg-tape-neutral/90",
};

// A small, restrained set of tilts (DESIGN.md §10 wants "optional tiny
// rotation," not randomness). Picked deterministically from the label text
// itself so the same tape always leans the same way on both server and
// client renders, rather than from Math.random().
const TILTS_DEG = [-2, -1.25, -0.5, 0.5, 1.25, 2];

function tiltForLabel(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) | 0;
  }
  return TILTS_DEG[Math.abs(hash) % TILTS_DEG.length] ?? 0;
}

export interface TapeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color"> {
  /** One of the eight controlled tape colors (DESIGN-TOKENS.md §27). */
  color?: TapeColor;
  /**
   * Overrides the swatch with an arbitrary CSS color — e.g.
   * `categoryColorVar(fieldGroup)` — for a category label, whose color comes
   * from the category system rather than the eight generic tape hues.
   */
  swatch?: string;
  /**
   * Degrees of tilt. Defaults to a small deterministic value derived from
   * the label so repeat renders agree. Pass `0` to keep it straight.
   */
  rotate?: number;
}

export function Tape({ color = "neutral", swatch, rotate, className, style, children, ...props }: TapeProps) {
  const tilt = rotate ?? (typeof children === "string" ? tiltForLabel(children) : 0);
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-tl-[2px] rounded-tr-[6px] rounded-br-[2px] rounded-bl-[6px]",
        "px-2.5 py-1 text-xs font-bold tracking-wider text-tape-ink uppercase shadow-sm",
        !swatch && TAPE_BG[color],
        className,
      )}
      style={{ backgroundColor: swatch, transform: `rotate(${tilt}deg)`, ...style }}
      {...props}
    >
      {children}
    </span>
  );
}
