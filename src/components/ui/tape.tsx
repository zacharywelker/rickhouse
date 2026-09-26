"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { TAPE_FONTS } from "@/lib/tape-fonts";

/**
 * Painter's tape — the recurring physical device from DESIGN.md §10 and
 * DESIGN-TOKENS.md §27. It should look like a torn-off strip somebody
 * actually stuck down — imperfect, not printed — so every mount rerolls its
 * tilt, its torn-edge jitter, its handwriting font, and a tiny positional
 * nudge, from `randomLook()` below. That reroll is also what makes a tape
 * look different across a page refresh: it's a fresh mount, so it's a fresh
 * roll. Its color range is the eight controlled tape hues rather than the
 * app's semantic palette.
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

const TOOTH_DEPTH_PX = 3;
const TOOTH_JITTER_PX = 1.75;
const TEETH_PER_EDGE = 5;
const TILT_RANGE_DEG = 3;
const NUDGE_RANGE_PX = 1.5;

type TapeLook = {
  clipPath: string;
  rotateDeg: number;
  nudgeX: number;
  nudgeY: number;
  fontIndex: number;
};

function tornEdges(toothDepth: (jagged: boolean) => number): string {
  const steps = TEETH_PER_EDGE * 2;
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = ((100 * i) / steps).toFixed(2);
    const jagged = i > 0 && i < steps && i % 2 === 1;
    const leftDepth = toothDepth(jagged);
    const rightDepth = toothDepth(jagged);
    left.push(`${jagged ? `${leftDepth.toFixed(1)}px` : "0%"} ${y}%`);
    right.push(`${jagged ? `calc(100% - ${rightDepth.toFixed(1)}px)` : "100%"} ${y}%`);
  }
  return `polygon(${[...left, ...right.reverse()].join(", ")})`;
}

// The server-rendered, pre-hydration look: even teeth, no tilt, no nudge.
// Real tape is never actually this tidy — randomLook() overwrites it in a
// useEffect right after mount, both to make it imperfect and to make it
// reroll on every fresh page load.
const DEFAULT_LOOK: TapeLook = {
  clipPath: tornEdges(() => TOOTH_DEPTH_PX),
  rotateDeg: 0,
  nudgeX: 0,
  nudgeY: 0,
  fontIndex: 0,
};

function randomLook(): TapeLook {
  return {
    clipPath: tornEdges((jagged) =>
      jagged ? Math.max(0.5, TOOTH_DEPTH_PX + (Math.random() * 2 - 1) * TOOTH_JITTER_PX) : 0,
    ),
    rotateDeg: (Math.random() * 2 - 1) * TILT_RANGE_DEG,
    nudgeX: (Math.random() * 2 - 1) * NUDGE_RANGE_PX,
    nudgeY: (Math.random() * 2 - 1) * NUDGE_RANGE_PX,
    fontIndex: Math.floor(Math.random() * TAPE_FONTS.length),
  };
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
  /** Pins the tilt instead of letting it reroll on mount. */
  rotate?: number;
}

export function Tape({ color = "neutral", swatch, rotate, className, style, children, ...props }: TapeProps) {
  const [look, setLook] = React.useState<TapeLook>(DEFAULT_LOOK);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration reroll, see DEFAULT_LOOK
    setLook(randomLook());
  }, []);

  const font = TAPE_FONTS[look.fontIndex];
  const tilt = rotate ?? look.rotateDeg;

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap px-3 py-2 text-xl leading-none text-tape-ink uppercase",
        font?.className,
        !swatch && TAPE_BG[color],
        className,
      )}
      style={{
        backgroundColor: swatch,
        clipPath: look.clipPath,
        transform: `translate(${look.nudgeX.toFixed(1)}px, ${look.nudgeY.toFixed(1)}px) rotate(${tilt.toFixed(2)}deg)`,
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
