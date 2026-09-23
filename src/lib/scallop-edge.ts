/**
 * The die-cut wavy edge on a modern self-adhesive US Forever stamp — a
 * continuous, perfectly regular scalloped ribbon, not the round-hole
 * perforation of older water-activated stamps. Unlike `tornRectClipPath`
 * this is a machine-cut shape: no randomness, same wave on every stamp.
 */
export function scallopRectClipPath(bumpsPerSide = 7, ampPx = 4.5, samplesPerBump = 6): string {
  const samples = bumpsPerSide * samplesPerBump;
  // Pinning depth to 0 at every corner (t=0/t=1) left a sharp, perfectly
  // square corner jammed between two soft waves — that mismatch is what
  // read as "wrong." Phasing it so each edge instead *peaks* at both ends
  // means the corner sits inside a bump like the rest of the edge, and the
  // two adjacent edges' half-bumps join into one continuous rounded corner
  // instead of a right angle.
  const depthAt = (t: number) => (ampPx * (1 + Math.cos(2 * Math.PI * bumpsPerSide * t))) / 2;

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
