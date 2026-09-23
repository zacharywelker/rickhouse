import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Painter's tape — the recurring physical device from DESIGN.md §10 and
 * DESIGN-TOKENS.md §27. Used for category labels, OPEN/BACK BAR/GIFT tags,
 * warnings, and other contextual annotations. It should look like a torn-off
 * strip somebody stuck down, not a generic UI badge: straight long edges,
 * a jagged torn edge on each short end, and its color range is the eight
 * controlled tape hues rather than the app's semantic palette.
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

// A torn edge, not a cut one: teeth on the two short ends only, straight top
// and bottom. Tooth depth is a fixed pixel amount (not a percentage of
// width), so the jag reads the same whether the label is "GIFT" or
// "POWDERED SUGAR" — only the tooth *count* should track height, which stays
// close to constant for a single line of text.
const TOOTH_DEPTH_PX = 3;
const TEETH_PER_EDGE = 5;

function tornEdgeClipPath(): string {
  // Walk both edges top-to-bottom in lockstep, then trace back up the right
  // edge, so the path stays a simple (non-self-intersecting) polygon.
  const steps = TEETH_PER_EDGE * 2;
  const leftPoints: string[] = [];
  const rightPoints: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = ((100 * i) / steps).toFixed(2);
    const jagged = i > 0 && i < steps && i % 2 === 1;
    leftPoints.push(`${jagged ? `${TOOTH_DEPTH_PX}px` : "0%"} ${y}%`);
    rightPoints.push(`${jagged ? `calc(100% - ${TOOTH_DEPTH_PX}px)` : "100%"} ${y}%`);
  }
  return `polygon(${[...leftPoints, ...rightPoints.reverse()].join(", ")})`;
}

const TORN_EDGES = tornEdgeClipPath();

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
   * Degrees of tilt. Real tape applied as a straight label band (wrapped
   * across a jar, a photo corner) usually isn't tilted — this defaults to
   * `0`. Pass a small value (1-3deg) for a more casually-stuck annotation.
   */
  rotate?: number;
}

export function Tape({ color = "neutral", swatch, rotate = 0, className, style, children, ...props }: TapeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap px-3 py-1.5 text-sm font-bold text-tape-ink uppercase",
        !swatch && TAPE_BG[color],
        className,
      )}
      style={{
        backgroundColor: swatch,
        clipPath: TORN_EDGES,
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
