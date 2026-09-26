import { describe, expect, it } from "vitest";
import { OBSTACLE_WEIGHT, placeStamps, type Obstacle } from "../stamp-placement";

const W = 800;
const H = 600;
const center = { x: 0.5, y: 0.5 };

function overlapArea(a: { x: number; y: number; size: number }, b: { x: number; y: number; w: number; h: number }) {
  const x = Math.max(0, Math.min(a.x + a.size, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.size, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

describe("placeStamps", () => {
  it("keeps every stamp fully on the page", () => {
    const placed = placeStamps(W, H, [], [
      { size: 200, anchor: { x: 0, y: 0 } },
      { size: 200, anchor: { x: 1, y: 1 } },
    ]);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.size).toBeLessThanOrEqual(W);
      expect(p.y + p.size).toBeLessThanOrEqual(H);
    }
  });

  it("goes to the blank half of the page, whatever its anchor says", () => {
    const leftHalf: Obstacle = { x: 0, y: 0, w: W / 2, h: H, weight: OBSTACLE_WEIGHT.text };
    const [p] = placeStamps(W, H, [leftHalf], [{ size: 160, anchor: { x: 0, y: 0 } }]);
    expect(overlapArea(p!, leftHalf)).toBe(0);
  });

  it("settles behind text before it settles behind a control", () => {
    // No blank space anywhere: the top half is text, the bottom half buttons.
    const text: Obstacle = { x: 0, y: 0, w: W, h: H / 2, weight: OBSTACLE_WEIGHT.text };
    const controls: Obstacle = { x: 0, y: H / 2, w: W, h: H / 2, weight: OBSTACLE_WEIGHT.control };
    const [p] = placeStamps(W, H, [text, controls], [{ size: 120, anchor: { x: 0.5, y: 1 } }]);
    expect(overlapArea(p!, controls)).toBe(0);
  });

  it("lets stamps catch an edge but never stack", () => {
    // A small blank window, so the stamps are forced close together.
    const obstacles: Obstacle[] = [
      { x: 0, y: 0, w: W, h: 200, weight: OBSTACLE_WEIGHT.control },
      { x: 0, y: 440, w: W, h: 160, weight: OBSTACLE_WEIGHT.control },
    ];
    const placed = placeStamps(W, H, obstacles, [
      { size: 180, anchor: center },
      { size: 180, anchor: center },
      { size: 180, anchor: center },
    ]);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const shared = overlapArea(a, { x: b.x, y: b.y, w: b.size, h: b.size });
        expect(shared / Math.min(a.size, b.size) ** 2).toBeLessThanOrEqual(0.15);
      }
    }
  });

  it("shrinks a stamp that is bigger than the page", () => {
    const [p] = placeStamps(120, 90, [], [{ size: 400, anchor: center }]);
    expect(p!.size).toBeLessThanOrEqual(90);
  });

  it("gives the same answer for the same page", () => {
    const obstacles: Obstacle[] = [{ x: 100, y: 50, w: 300, h: 40, weight: OBSTACLE_WEIGHT.text }];
    const requests = [
      { size: 150, anchor: { x: 0.2, y: 0.7 } },
      { size: 150, anchor: { x: 0.9, y: 0.1 } },
    ];
    expect(placeStamps(W, H, obstacles, requests)).toEqual(placeStamps(W, H, obstacles, requests));
  });

  it("uses the anchor to choose between equally blank places", () => {
    const [left] = placeStamps(W, H, [], [{ size: 100, anchor: { x: 0, y: 0 } }]);
    const [right] = placeStamps(W, H, [], [{ size: 100, anchor: { x: 1, y: 1 } }]);
    expect(left!.x).toBeLessThan(right!.x);
    expect(left!.y).toBeLessThan(right!.y);
  });

  it("places nothing on a page with no room at all", () => {
    expect(placeStamps(0, 0, [], [{ size: 100, anchor: center }])).toEqual([]);
  });
});
