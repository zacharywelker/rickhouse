/**
 * Deterministic RNG keyed off a stable id (bottle id, image id) rather than
 * `Math.random()`. Unlike Tape's `randomLook()` — which is meant to reroll
 * on every mount so the same tape flag looks different across refreshes —
 * a Polaroid's torn edge or a stamp's tilt is a property of *that bottle's
 * page*, not of the render. It should look the same on every visit and only
 * change if the bottle itself changes.
 */
export function seededRandom(seed: number): () => number {
  let t = (seed >>> 0) + 0x6d2b79f5;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Turns an arbitrary string into a seed, so text (a label, a filename) can drive `seededRandom()` too. */
export function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(h, 31) + input.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
