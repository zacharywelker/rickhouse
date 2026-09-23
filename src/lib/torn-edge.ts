/**
 * A hand-torn rectangle edge, in the spirit of Tape's `tornEdges()` but
 * generalized to all four sides for a torn photo edge rather than a torn
 * tape strip. Takes an rng function so callers can drive it with
 * `seededRandom()` for a stable-per-item look instead of Tape's
 * reroll-on-mount look.
 */
export function tornRectClipPath(rng: () => number, toothDepthPx = 3, jitterPx = 1.75, teethPerEdge = 6): string {
  const depth = () => Math.max(0.5, toothDepthPx + (rng() * 2 - 1) * jitterPx).toFixed(1);
  const steps = teethPerEdge * 2;
  const isJagged = (i: number) => i > 0 && i < steps && i % 2 === 1;

  const top: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = ((100 * i) / steps).toFixed(2);
    top.push(`${x}% ${isJagged(i) ? depth() : "0"}px`);
  }
  const right: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = ((100 * i) / steps).toFixed(2);
    right.push(`calc(100% - ${isJagged(i) ? depth() : "0"}px) ${y}%`);
  }
  const bottom: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (100 - (100 * i) / steps).toFixed(2);
    bottom.push(`${x}% calc(100% - ${isJagged(i) ? depth() : "0"}px)`);
  }
  const left: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = (100 - (100 * i) / steps).toFixed(2);
    left.push(`${isJagged(i) ? depth() : "0"}px ${y}%`);
  }

  return `polygon(${[...top, ...right, ...bottom, ...left].join(", ")})`;
}
