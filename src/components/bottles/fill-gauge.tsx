"use client";

import * as React from "react";
import type { FieldGroup } from "@/db/schema";
import { categoryColorVar } from "@/lib/bottles/category-color";
import { fillSpoken } from "@/lib/bottles/fill-state";
import { FILL_TICK_STEP, clampPct, needleDeg, nudgePct, pctFromDial } from "@/lib/bottles/geometry";
import { cn } from "@/lib/utils";

/**
 * The fill gauge — a fuel dial for a bottle.
 *
 * Empty at the left, Full at the right, twenty fine ticks, and a needle that
 * swings with a little overshoot when the level changes. The sweep is tinted with the spirit's
 * category color, and the last stretch before Empty is the red "low fuel"
 * zone. The photo already shows what the bottle looks like; this only has to
 * say how much is left, in as little space as possible.
 *
 * Interactive on a bottle's page and read-only in the grid, from the same
 * component: `readOnly` drops the pointer and keyboard handling, nothing else
 * changes. Dragging detents onto the nearest tick (see `pctFromDial`); the
 * keys move one tick, or a quarter with Shift. A sealed bottle draws as a
 * hatched dial with a wax seal and no needle. Deliberately self-contained — no data
 * fetching, no server actions, just a number in and a number out.
 */

const VIEW_W = 120;
const VIEW_H = 72;
const HUB_X = 60;
const HUB_Y = 62;
const RADIUS = 48;
const SWEEP_PATH = `M ${HUB_X - RADIUS} ${HUB_Y} A ${RADIUS} ${RADIUS} 0 0 1 ${HUB_X + RADIUS} ${HUB_Y}`;
/** Where the red zone ends: the same line the quick states use between Almost gone and ¼. */
const LOW_FUEL_PCT = 18;

/** A point on the dial, `pct` of the way from Empty to Full, `r` out from the hub. */
function dialPoint(pct: number, r: number): [number, number] {
  const a = Math.PI - (pct / 100) * Math.PI;
  return [HUB_X + Math.cos(a) * r, HUB_Y - Math.sin(a) * r];
}

export type FillGaugeProps = {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  /**
   * The bottle's spirit family (DESIGN.md §4.3) — the sweep is tinted with
   * this category's accent color instead of the neutral one, so the gauge
   * reads as whiskey, rum, agave… at a glance. Falls back to the "other"
   * color where a category isn't known (or doesn't apply).
   */
  fieldGroup?: FieldGroup;
  /** Rendered height in pixels; the width follows (about 1.7x). */
  height?: number;
  label?: string;
  /**
   * Hide it from assistive tech entirely. For the mobile card, where the same
   * level is already stated as text beside it — announcing it twice is noise,
   * and two gauges with one name is an ambiguous reference.
   */
  decorative?: boolean;
  /** Unopened: hatched track, a seal where the hub is, no needle (see `isSealedBottle`). */
  sealed?: boolean;
  className?: string;
};

export function FillGauge({
  value,
  onChange,
  readOnly = false,
  fieldGroup,
  height = 120,
  label = "Fill level",
  decorative = false,
  sealed = false,
  className,
}: FillGaugeProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const hatchId = React.useId();
  const [dragging, setDragging] = React.useState(false);
  const spirit = fieldGroup ? categoryColorVar(fieldGroup) : "var(--category-other)";

  const pct = clampPct(value);
  const interactive = !readOnly && onChange !== undefined;
  // Tick marks and the E/F pegs are noise below about the size of a table row.
  const detailed = height >= 64;

  /** Turns a pointer position into a tick, measured from the dial's hub. */
  const pctFromPointer = React.useCallback((clientX: number, clientY: number): number => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const hubX = rect.left + (HUB_X / VIEW_W) * rect.width;
    const hubY = rect.top + (HUB_Y / VIEW_H) * rect.height;
    return pctFromDial(clientX - hubX, clientY - hubY);
  }, []);

  React.useEffect(() => {
    if (!dragging || !interactive) return;
    const move = (event: PointerEvent) => onChange?.(pctFromPointer(event.clientX, event.clientY));
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
    const direction: Record<string, 1 | -1> = { ArrowUp: 1, ArrowRight: 1, PageUp: 1, ArrowDown: -1, ArrowLeft: -1, PageDown: -1 };
    const dir = direction[event.key];
    if (dir) {
      event.preventDefault();
      onChange?.(nudgePct(pct, dir, event.shiftKey || event.key.startsWith("Page")));
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange?.(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange?.(100);
    }
  }

  const strokeWidth = detailed ? 9 : 12;
  const hatch = detailed ? 5 : 8;
  const low = pct < LOW_FUEL_PCT;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      height={height}
      width={(height * VIEW_W) / VIEW_H}
      className={cn(
        "shrink-0 select-none overflow-visible",
        interactive && "cursor-pointer touch-none focus-visible:outline-none",
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
            "aria-valuetext": fillSpoken(pct, sealed),
            onKeyDown,
            onPointerDown: (event: React.PointerEvent) => {
              event.preventDefault();
              svgRef.current?.focus();
              setDragging(true);
              onChange?.(pctFromPointer(event.clientX, event.clientY));
            },
          }
        : decorative
        ? { "aria-hidden": true, role: undefined }
        : { "aria-label": `${label}: ${fillSpoken(pct, sealed)}` })}
    >
      <defs>
        {/* Coarser and darker when small, where a fine light hatch would read as the plain track. */}
        <pattern id={hatchId} width={hatch} height={hatch} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={hatch} height={hatch} fill="var(--color-muted)" />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2={hatch}
            strokeWidth={detailed ? 2 : 3.5}
            stroke={detailed ? "var(--color-border)" : "var(--color-muted-foreground)"}
            strokeOpacity={detailed ? 1 : 0.45}
          />
        </pattern>
      </defs>

      {/* Track, then the sweep up to the needle. Sealed: the track is hatched and nothing sweeps. */}
      <path
        d={SWEEP_PATH}
        fill="none"
        strokeWidth={strokeWidth}
        {...(sealed ? { stroke: `url(#${hatchId})` } : { className: "stroke-muted" })}
      />
      {sealed ? null : (
        <path
          d={SWEEP_PATH}
          fill="none"
          strokeWidth={strokeWidth}
          pathLength={100}
          strokeDasharray={`${pct} 100`}
          stroke={low ? "var(--color-destructive)" : spirit}
          className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        />
      )}

      {detailed
        ? Array.from({ length: 100 / FILL_TICK_STEP + 1 }, (_, i) => i * FILL_TICK_STEP).map((tickPct) => {
            const major = tickPct % 25 === 0;
            const [x1, y1] = dialPoint(tickPct, RADIUS - strokeWidth / 2 - 1);
            const [x2, y2] = dialPoint(tickPct, RADIUS - strokeWidth / 2 - (major ? 7 : 3.5));
            return (
              <line
                key={tickPct}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={major ? 1.8 : 1}
                strokeLinecap="round"
                className="stroke-foreground/60"
              />
            );
          })
        : null}

      {detailed ? (
        <g className="fill-muted-foreground" fontSize="8" fontWeight="600" textAnchor="middle">
          <text x={HUB_X - RADIUS} y={HUB_Y + 9}>
            E
          </text>
          <text x={HUB_X + RADIUS} y={HUB_Y + 9}>
            F
          </text>
          {[25, 50, 75].map((labelPct) => {
            const [x, y] = dialPoint(labelPct, RADIUS - strokeWidth / 2 - 13);
            return (
              <text key={labelPct} x={x} y={y + 3}>
                {labelPct === 50 ? "½" : labelPct === 25 ? "¼" : "¾"}
              </text>
            );
          })}
        </g>
      ) : null}

      {sealed ? (
        detailed ? (
          <g transform={`translate(${HUB_X} ${HUB_Y - 10})`}>
            <circle r="11" className="fill-foreground" />
            <circle r="8" fill="none" strokeWidth="1.1" strokeDasharray="2 1.5" stroke="var(--background)" />
            <rect x="-3.8" y="-0.8" width="7.6" height="6" rx="1" fill="var(--background)" />
            <path d="M-2.1 -0.8 v-2.1 a2.1 2.1 0 0 1 4.2 0 V-0.8" fill="none" strokeWidth="1.2" stroke="var(--background)" />
          </g>
        ) : null
      ) : (
        <>
          {/* The needle points straight up and is rotated about the hub, so the swing is one CSS transition. */}
          <g
            style={{ transform: `rotate(${needleDeg(pct)}deg)`, transformOrigin: `${HUB_X}px ${HUB_Y}px` }}
            className="motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          >
            <line
              x1={HUB_X}
              y1={HUB_Y}
              x2={HUB_X}
              y2={HUB_Y - RADIUS + (detailed ? 12 : 8)}
              strokeWidth={detailed ? 2.5 : 3}
              strokeLinecap="round"
              className="stroke-foreground"
            />
          </g>
          <circle cx={HUB_X} cy={HUB_Y} r={detailed ? 4.5 : 5} className="fill-foreground" />
        </>
      )}
    </svg>
  );
}
