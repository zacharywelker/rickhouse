import * as React from "react";
import { CHAR_LEVELS, type CharLevel } from "@/db/schema";
import { CHAR_LEVEL_DETAILS } from "@/lib/char-levels";
import { cn } from "@/lib/utils";

/** The drawing's own coordinate width; it stretches to its container. */
const VIEW_W = 600;
const SECTIONS = CHAR_LEVELS.length;
const CHAR_FILL: Record<CharLevel, string | null> = {
  none: null,
  toasted: null,
  "1": "var(--color-stave-char-1)",
  "2": "var(--color-stave-char-2)",
  "3": "var(--color-stave-char-3)",
  "4": "var(--color-stave-char-4)",
};

/**
 * One barrel stave lying on its side, cut into six sections from No Char to
 * 4, each charred to its level: the toast band and the black char layer get
 * deeper from left to right, so the stave itself is the scale. The inside of
 * the barrel is the top edge.
 *
 * Colour only, by design: drawn cracks and alligator scales read as cartoons
 * at this size (issue #117). Sections past `level` fade back, so the stave
 * reads as burned up to that point; `null` (unknown) fades the whole board.
 *
 * Pure SVG with no hooks, so it renders on the server for the label pages
 * and inside the client slider alike.
 */
export function CharStave({
  level,
  thickness,
  caret = false,
  className,
}: {
  level: CharLevel | null;
  /** Board thickness in px. */
  thickness: number;
  /** The form's slider points at the selected section. */
  caret?: boolean;
  className?: string;
}) {
  const H = thickness;
  const arc = Math.max(2, H * 0.12);
  const pad = 2;
  const totalH = H + arc + pad * 2;
  const step = VIEW_W / 120;
  const seg = VIEW_W / SECTIONS;
  // A bent stave: the middle sits higher than the ends.
  const top = (x: number) => pad + arc * (1 - 4 * (x / VIEW_W) * (1 - x / VIEW_W));
  const edge = (x0: number, x1: number, f: (x: number) => number): Array<[number, number]> => {
    const points: Array<[number, number]> = [];
    for (let x = x0; x < x1 - step * 0.3; x += step) points.push([x, f(x)]);
    points.push([x1, f(x1)]);
    return points;
  };
  const toPoints = (points: Array<[number, number]>) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const toPath = (points: Array<[number, number]>) => `M${toPoints(points).replaceAll(" ", " L")} Z`;
  const band = (x0: number, x1: number, depth: number) =>
    toPath([...edge(x0, x1, top), ...edge(x0, x1, (x) => top(x) + depth * H).reverse()]);

  const grainLines = Math.max(2, Math.round(H / 7));
  const grain = (x0: number, x1: number, k: number) =>
    toPoints(
      edge(x0, x1, (x) => top(x) + H * (k / (grainLines + 1)) + Math.sin(x / 41 + k * 1.7) * H * 0.04 + Math.sin(x / 13 + k) * H * 0.012),
    );

  const selected = level === null ? -1 : CHAR_LEVELS.indexOf(level);

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${totalH}`}
        preserveAspectRatio="none"
        width="100%"
        height={totalH}
        aria-hidden="true"
        className="block text-foreground"
      >
        {CHAR_LEVELS.map((value, i) => {
          const x0 = i * seg;
          const x1 = (i + 1) * seg;
          const { toast, char } = CHAR_LEVEL_DETAILS[value];
          const fill = CHAR_FILL[value];
          return (
            <g key={value} opacity={selected === -1 || i > selected ? 0.4 : 1} className="transition-opacity duration-150">
              <path d={band(x0, x1, 1)} fill="var(--color-stave-oak)" />
              {Array.from({ length: grainLines }, (_, k) => (
                <polyline
                  key={k}
                  points={grain(x0, x1, k + 1)}
                  fill="none"
                  stroke="var(--color-stave-grain)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {/* Toast fades down into the raw oak: stacked translucent bands, not a gradient. */}
              {toast > 0
                ? [1, 0.8, 0.6, 0.45].map((f) => (
                    <path key={f} d={band(x0, x1, toast * f)} fill="var(--color-stave-toast)" fillOpacity={0.28} />
                  ))
                : null}
              {fill ? <path d={band(x0, x1, char)} fill={fill} /> : null}
            </g>
          );
        })}
        {/* Saw-cut seams between the sections. */}
        {Array.from({ length: SECTIONS - 1 }, (_, i) => {
          const x = (i + 1) * seg;
          return (
            <line
              key={i}
              x1={x}
              x2={x}
              y1={top(x)}
              y2={top(x) + H}
              stroke="var(--color-stave-seam)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        <path
          d={band(0, VIEW_W, 1)}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.3}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {selected >= 0 ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -inset-y-1.5 border-2 border-foreground transition-[left] duration-150 ease-out motion-reduce:transition-none",
            caret &&
              "before:absolute before:-top-2 before:left-1/2 before:-translate-x-1/2 before:border-x-[5px] before:border-t-[5px] before:border-x-transparent before:border-t-foreground",
          )}
          style={{ left: `calc(${(selected * 100) / SECTIONS}% - 2px)`, width: `calc(${100 / SECTIONS}% + 4px)` }}
        />
      ) : null}
    </div>
  );
}
