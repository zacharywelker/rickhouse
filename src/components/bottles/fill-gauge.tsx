"use client";

import * as React from "react";
import type { FieldGroup } from "@/db/schema";
import { categoryColorVar } from "@/lib/bottles/category-color";
import { fillStateDescription } from "@/lib/bottles/fill-state";
import { LIQUID_BOTTOM, clampPct, pctFromY, surfaceY } from "@/lib/bottles/geometry";
import { cn } from "@/lib/utils";

/**
 * The fill gauge — a bottle you can pour.
 *
 * Drawn as one SVG path (lip, neck, shoulder, body) with the liquid clipped to
 * that outline, so the level narrows through the shoulder the way it does in a
 * real bottle rather than sliding up a rectangle.
 *
 * Interactive on a bottle's page and read-only in the grid, from the same
 * component: `readOnly` drops the pointer and keyboard handling, nothing else
 * changes. Deliberately self-contained — no data fetching, no server actions,
 * just a number in and a number out.
 */

const VIEW_W = 100;
const VIEW_H = 220;

const BOTTLE_PATH = [
  "M 36 6",
  "L 36 44",
  "C 36 58, 11 68, 11 94",
  "L 11 196",
  "Q 11 212, 27 212",
  "L 73 212",
  "Q 89 212, 89 196",
  "L 89 94",
  "C 89 68, 64 58, 64 44",
  "L 64 6",
  "Z",
].join(" ");

export type FillGaugeProps = {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  /**
   * The bottle's spirit family (DESIGN.md §4.3) — the liquid is tinted with
   * this category's accent color instead of the generic amber, so the gauge
   * reads as whiskey, rum, agave… at a glance. Falls back to the amber/oak
   * default where a category isn't known (or doesn't apply).
   */
  fieldGroup?: FieldGroup;
  /** Rendered height in pixels; the SVG scales to it. */
  height?: number;
  label?: string;
  /**
   * Hide it from assistive tech entirely. For the mobile card, where the same
   * level is already stated as text beside it — announcing it twice is noise,
   * and two gauges with one name is an ambiguous reference.
   */
  decorative?: boolean;
  className?: string;
};

export function FillGauge({
  value,
  onChange,
  readOnly = false,
  fieldGroup,
  height = 240,
  label = "Fill level",
  decorative = false,
  className,
}: FillGaugeProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const clipId = React.useId();
  const gradientId = React.useId();
  const spirit = fieldGroup ? categoryColorVar(fieldGroup) : null;

  const pct = clampPct(value);
  const interactive = !readOnly && onChange !== undefined;

  /** Turns a pointer position into a percentage along the liquid range. */
  const pctFromPointer = React.useCallback((clientY: number): number => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    return pctFromY(((clientY - rect.top) / rect.height) * VIEW_H);
  }, []);

  React.useEffect(() => {
    if (!dragging || !interactive) return;
    const move = (event: PointerEvent) => onChange?.(pctFromPointer(event.clientY));
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, interactive, onChange, pctFromPointer]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (!interactive) return;
    const step = event.shiftKey ? 10 : 1;
    const nudge: Record<string, number> = {
      ArrowUp: step,
      ArrowRight: step,
      ArrowDown: -step,
      ArrowLeft: -step,
      PageUp: 10,
      PageDown: -10,
    };
    if (event.key in nudge) {
      event.preventDefault();
      onChange?.(clampPct(pct + nudge[event.key]!));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      onChange?.(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange?.(100);
    }
  }

  const y = surfaceY(pct);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      height={height}
      className={cn(
        "select-none overflow-visible",
        interactive && "cursor-ns-resize touch-none focus-visible:outline-none",
        className,
      )}
      role={interactive ? "slider" : decorative ? undefined : "img"}
      {...(interactive
        ? {
            tabIndex: 0,
            "aria-label": label,
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": pct,
            "aria-valuetext": fillStateDescription(pct),
            "aria-orientation": "vertical" as const,
            onKeyDown,
            onPointerDown: (event: React.PointerEvent) => {
              event.preventDefault();
              svgRef.current?.focus();
              setDragging(true);
              onChange?.(pctFromPointer(event.clientY));
            },
          }
        : decorative
        ? { "aria-hidden": true, role: undefined }
        : { "aria-label": `${label}: ${fillStateDescription(pct)}` })}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={BOTTLE_PATH} />
        </clipPath>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          {spirit ? (
            <>
              <stop offset="0%" stopColor={`color-mix(in srgb, ${spirit} 65%, white)`} />
              <stop offset="55%" stopColor={spirit} />
              <stop offset="100%" stopColor={`color-mix(in srgb, ${spirit} 70%, black)`} />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="var(--color-rye-gold)" />
              <stop offset="55%" stopColor="var(--color-amber-spirit)" />
              <stop offset="100%" stopColor="#a8531f" />
            </>
          )}
        </linearGradient>
      </defs>

      <path d={BOTTLE_PATH} className="fill-muted" />

      <g clipPath={`url(#${clipId})`}>
        <rect
          x="0"
          y={y}
          width={VIEW_W}
          height={LIQUID_BOTTOM - y + 12}
          fill={`url(#${gradientId})`}
          className="motion-safe:transition-all motion-safe:duration-300"
        />
        {/* Meniscus, so the surface reads as liquid rather than a cut edge. */}
        {pct > 0 && pct < 100 ? (
          <ellipse
            cx={VIEW_W / 2}
            cy={y}
            rx={VIEW_W / 2}
            ry="3"
            className="fill-accent/70 motion-safe:transition-all motion-safe:duration-300"
          />
        ) : null}
      </g>

      {/* Cap and outline last, so they sit above the liquid. */}
      <rect x="33" y="0" width="34" height="12" rx="3" className="fill-oak-700" />
      <path d={BOTTLE_PATH} fill="none" strokeWidth="2.5" className="stroke-border" />
    </svg>
  );
}
