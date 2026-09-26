/**
 * Where designation stamps go on a bottle page: the emptiest spots that fit.
 *
 * The page measures what is actually on it (see BottleStamps) and hands over
 * a list of obstacle boxes; this module does the arithmetic, so it can be
 * tested without a browser. The page is laid over a coarse grid, each cell
 * recording the heaviest thing covering it, and a summed-area table makes
 * "how much is under this square?" a constant-time question for every
 * candidate spot.
 *
 * Weights say how much a stamp behind something matters: faint ink behind a
 * line of text still reads, behind a photo it vanishes, and behind a button
 * it looks like part of the control. Blank space always wins; when there is
 * none, a stamp settles behind text before it settles behind a control.
 */

export type Obstacle = { x: number; y: number; w: number; h: number; weight: number };

export type StampRequest = {
  /** Edge of the stamp's square, in px, before any shrinking to fit. */
  size: number;
  /**
   * A seeded preferred spot, as fractions of the page. Only breaks ties
   * between equally empty places, so each bottle gets its own arrangement
   * instead of every stamp settling into the same top-left gap.
   */
  anchor: { x: number; y: number };
};

export type StampPlacement = { x: number; y: number; size: number };

export const OBSTACLE_WEIGHT = { text: 1, surface: 2, control: 3 } as const;
const MAX_WEIGHT = OBSTACLE_WEIGHT.control;

const CELL = 8;
/** Breathing room kept around everything a stamp should avoid. */
const PAD = 8;
/** Candidates are tried every STEP cells: 16px is finer than anyone can see. */
const STEP = 2;
/** Stamps may catch each other's edge, the way a passport page's do, but never stack. */
const MAX_STAMP_OVERLAP = 0.15;
/** How much the seeded anchor matters next to emptiness. Small on purpose. */
const ANCHOR_WEIGHT = 0.06;
/** A crowded page gets a smaller stamp before it gets a stamp on top of something. */
const SCALES = [1, 0.8] as const;
const SMALLER_PENALTY = 0.03;

class Grid {
  readonly cells: Float32Array;
  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.cells = new Float32Array(cols * rows);
  }

  /** Raises every cell the box touches to at least `value`. */
  mark(x: number, y: number, w: number, h: number, value: number) {
    const c0 = Math.max(0, Math.floor(x / CELL));
    const r0 = Math.max(0, Math.floor(y / CELL));
    const c1 = Math.min(this.cols, Math.ceil((x + w) / CELL));
    const r1 = Math.min(this.rows, Math.ceil((y + h) / CELL));
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const i = r * this.cols + c;
        if (this.cells[i]! < value) this.cells[i] = value;
      }
    }
  }

  /** Summed-area table: sum of any rectangle of cells in four lookups. */
  integral(): (c: number, r: number, span: number) => number {
    const w = this.cols + 1;
    const sat = new Float64Array(w * (this.rows + 1));
    for (let r = 0; r < this.rows; r++) {
      let row = 0;
      for (let c = 0; c < this.cols; c++) {
        row += this.cells[r * this.cols + c]!;
        sat[(r + 1) * w + (c + 1)] = sat[r * w + (c + 1)]! + row;
      }
    }
    return (c, r, span) =>
      sat[(r + span) * w + (c + span)]! - sat[r * w + (c + span)]! - sat[(r + span) * w + c]! + sat[r * w + c]!;
  }
}

/**
 * One placement per request, in order, each avoiding the obstacles and the
 * stamps placed before it. Deterministic: the same page and the same
 * requests always give the same answer. Every placement lies fully inside
 * the page; a request too large for the page is shrunk to fit.
 */
export function placeStamps(
  width: number,
  height: number,
  obstacles: Obstacle[],
  requests: StampRequest[],
): StampPlacement[] {
  const cols = Math.floor(width / CELL);
  const rows = Math.floor(height / CELL);
  if (cols < 1 || rows < 1) return [];

  const page = new Grid(cols, rows);
  for (const o of obstacles) page.mark(o.x - PAD, o.y - PAD, o.w + PAD * 2, o.h + PAD * 2, o.weight);
  const pageSum = page.integral();

  const stamps = new Grid(cols, rows);
  const placements: StampPlacement[] = [];
  const diagonal = Math.hypot(cols, rows);

  for (const request of requests) {
    const stampSum = stamps.integral();
    let best: { c: number; r: number; span: number; score: number } | null = null;

    for (const scale of SCALES) {
      const span = Math.max(1, Math.min(cols, rows, Math.round((request.size * scale) / CELL)));
      const area = span * span;
      const anchorC = request.anchor.x * (cols - span);
      const anchorR = request.anchor.y * (rows - span);

      for (let r = 0; r <= rows - span; r += STEP) {
        for (let c = 0; c <= cols - span; c += STEP) {
          const stampOverlap = stampSum(c, r, span) / area;
          const occupied = pageSum(c, r, span) / (area * MAX_WEIGHT);
          const distance = Math.hypot(c - anchorC, r - anchorR) / diagonal;
          const score =
            occupied +
            // Past the edge-catching allowance, another stamp is worse than anything.
            (stampOverlap > MAX_STAMP_OVERLAP ? 10 + stampOverlap : stampOverlap * 0.5) +
            ANCHOR_WEIGHT * distance +
            (scale < 1 ? SMALLER_PENALTY : 0);
          if (!best || score < best.score) best = { c, r, span, score };
        }
      }
    }

    if (!best) continue;
    stamps.mark(best.c * CELL, best.r * CELL, best.span * CELL, best.span * CELL, 1);
    placements.push({ x: best.c * CELL, y: best.r * CELL, size: best.span * CELL });
  }

  return placements;
}
