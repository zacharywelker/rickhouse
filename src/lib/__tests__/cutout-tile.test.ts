import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { TILE_HEIGHT, TILE_WIDTH, buildTile, thumbPathForTile, tilePathFor } from "../cutout-tile";

/** A bottle-ish block on a transparent canvas, with margin the tile must ignore. */
async function bottle(w = 100, h = 400) {
  const block = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 120, g: 60, b: 20, alpha: 1 } } })
    .png()
    .toBuffer();
  return sharp({ create: { width: 300, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: block, left: 100, top: 80 }])
    .png()
    .toBuffer();
}

async function alphaAt(tile: Buffer, x: number, y: number) {
  const { data, info } = await sharp(tile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3]!;
}

describe("tile paths", () => {
  it("maps a thumbnail to its tile and back", () => {
    expect(tilePathFor("bottles/thumbs/abc.webp")).toBe("bottles/tiles/abc.webp");
    expect(thumbPathForTile("bottles/tiles/abc.webp")).toBe("bottles/thumbs/abc.webp");
  });

  it("has no tile for a path that is not a thumbnail", () => {
    expect(tilePathFor("bottles/abc.webp")).toBeNull();
    expect(thumbPathForTile("bottles/thumbs/abc.webp")).toBeNull();
  });
});

describe("buildTile", () => {
  it("makes a fixed-size transparent tile with the bottle standing on the plate's base line", async () => {
    const tile = (await buildTile(await bottle()))!;
    const meta = await sharp(tile).metadata();
    expect([meta.width, meta.height, meta.hasAlpha]).toEqual([TILE_WIDTH, TILE_HEIGHT, true]);
    const base = Math.round(TILE_HEIGHT * 0.93);
    expect(await alphaAt(tile, TILE_WIDTH / 2, base - 5)).toBeGreaterThan(200); // the bottle is there...
    expect(await alphaAt(tile, TILE_WIDTH / 2, base + 12)).toBeLessThan(20); // ...and stops at its base
    expect(await alphaAt(tile, TILE_WIDTH / 2, 5)).toBe(0); // nothing above it
  });

  it("casts a shadow on the floor to the right of the bottle, and none on the wall", async () => {
    const tile = (await buildTile(await bottle()))!;
    const floorY = Math.round(TILE_HEIGHT * 0.76);
    const nearBase = Math.round(TILE_HEIGHT * 0.93) - 6;
    // Past the bottle's right edge, at floor height: shadow (partly transparent, not empty).
    const shadow = await alphaAt(tile, TILE_WIDTH / 2 + 70, nearBase - 40);
    expect(shadow).toBeGreaterThan(10);
    expect(shadow).toBeLessThan(150);
    // The same offset up on the wall: clear.
    expect(await alphaAt(tile, TILE_WIDTH / 2 + 70, floorY - 40)).toBe(0);
  });

  it("is the same size for a wide bottle and puts it on the same base line", async () => {
    const tile = (await buildTile(await bottle(280, 300)))!;
    const meta = await sharp(tile).metadata();
    expect([meta.width, meta.height]).toEqual([TILE_WIDTH, TILE_HEIGHT]);
    expect(await alphaAt(tile, TILE_WIDTH / 2, Math.round(TILE_HEIGHT * 0.93) - 5)).toBeGreaterThan(200);
  });

  it("has no tile for an opaque photo", async () => {
    const jpeg = await sharp({ create: { width: 200, height: 300, channels: 3, background: "#888" } }).jpeg().toBuffer();
    expect(await buildTile(jpeg)).toBeNull();
  });
});
