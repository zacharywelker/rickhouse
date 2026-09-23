/**
 * The die-cut wavy edge on a modern self-adhesive US Forever stamp — a
 * continuous, perfectly regular scalloped ribbon, not the round-hole
 * perforation of older water-activated stamps. Unlike `tornRectClipPath`
 * this is a machine-cut shape: no randomness, same wave on every stamp.
 */
export function scallopRectClipPath(bumpsPerSide = 7, ampPx = 4.5, samplesPerBump = 6): string {
  const samples = bumpsPerSide * samplesPerBump;
  // Each bump is a shallow inward bite; the cosine keeps the corners (t=0,
  // t=1 on every edge) sitting right at depth 0 so adjacent edges meet
  // cleanly instead of leaving a notch at the corner.
  const depthAt = (t: number) => (ampPx * (1 - Math.cos(2 * Math.PI * bumpsPerSide * t))) / 2;

  function edge(pointAt: (t: number, d: number) => string): string[] {
    const pts: string[] = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      pts.push(pointAt(t, depthAt(t)));
    }
    return pts;
  }

  const top = edge((t, d) => `${(t * 100).toFixed(2)}% ${d.toFixed(1)}px`);
  const right = edge((t, d) => `calc(100% - ${d.toFixed(1)}px) ${(t * 100).toFixed(2)}%`);
  const bottom = edge((t, d) => `${(100 - t * 100).toFixed(2)}% calc(100% - ${d.toFixed(1)}px)`);
  const left = edge((t, d) => `${d.toFixed(1)}px ${(100 - t * 100).toFixed(2)}%`);

  return `polygon(${[...top, ...right, ...bottom, ...left].join(", ")})`;
}
