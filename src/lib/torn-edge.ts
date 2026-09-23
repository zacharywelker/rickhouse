/**
 * A hand-torn rectangle edge, in the spirit of Tape's `tornEdges()` but
 * generalized to all four sides for a torn photo edge rather than a torn
 * tape strip. Takes an rng function so callers can drive it with
 * `seededRandom()` for a stable-per-item look instead of Tape's
 * reroll-on-mount look.
 *
 * A real tear isn't a symmetric sawtooth (equal-width teeth alternating
 * with equal-length flats reads as "cut with pinking shears," not torn) —
 * it's a continuous ragged line: irregular spacing, and depth that
 * wanders via a random walk rather than snapping between two fixed
 * values. `raggedEdge` builds that walk once per side.
 */
function raggedEdge(rng: () => number, pointCount: number, maxDepthPx: number): Array<{ t: number; d: number }> {
  const points: Array<{ t: number; d: number }> = [{ t: 0, d: rng() * maxDepthPx * 0.3 }];
  let depth = points[0]!.d;
  for (let i = 1; i < pointCount; i++) {
    // Irregular spacing: some teeth are narrow slivers, some are wide fibers.
    const t = (i / pointCount) + (rng() * 2 - 1) * (0.5 / pointCount);
    depth = Math.min(maxDepthPx, Math.max(0, depth + (rng() * 2 - 1) * maxDepthPx * 0.55));
    // Occasionally the tear catches and pulls a deeper chunk out.
    if (rng() < 0.12) depth = Math.min(maxDepthPx, depth + maxDepthPx * 0.5);
    points.push({ t: Math.min(0.98, Math.max(0.02, t)), d: depth });
  }
  points.push({ t: 1, d: rng() * maxDepthPx * 0.3 });
  return points;
}

export function tornRectClipPath(rng: () => number, maxDepthPx = 7, pointsPerEdge = 9): string {
  const top = raggedEdge(rng, pointsPerEdge, maxDepthPx).map((p) => `${(p.t * 100).toFixed(2)}% ${p.d.toFixed(1)}px`);
  const right = raggedEdge(rng, pointsPerEdge, maxDepthPx).map(
    (p) => `calc(100% - ${p.d.toFixed(1)}px) ${(p.t * 100).toFixed(2)}%`,
  );
  const bottom = raggedEdge(rng, pointsPerEdge, maxDepthPx).map(
    (p) => `${(100 - p.t * 100).toFixed(2)}% calc(100% - ${p.d.toFixed(1)}px)`,
  );
  const left = raggedEdge(rng, pointsPerEdge, maxDepthPx).map(
    (p) => `${p.d.toFixed(1)}px ${(100 - p.t * 100).toFixed(2)}%`,
  );

  return `polygon(${[...top, ...right, ...bottom, ...left].join(", ")})`;
}
