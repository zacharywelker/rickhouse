import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { transparentCropBox } from "../trim-transparent";

async function canvas(size: number, rect?: { x: number; y: number; w: number; h: number }) {
  const base = sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  if (!rect) return base.png().toBuffer();
  const block = await sharp({
    create: { width: rect.w, height: rect.h, channels: 4, background: { r: 200, g: 100, b: 20, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return base.composite([{ input: block, left: rect.x, top: rect.y }]).png().toBuffer();
}

describe("transparentCropBox", () => {
  it("finds the visible subject with a little padding", async () => {
    const box = await transparentCropBox(sharp(await canvas(1000, { x: 400, y: 100, w: 100, h: 800 })));
    expect(box).not.toBeNull();
    expect(box!.left).toBeLessThan(400);
    expect(box!.left).toBeGreaterThanOrEqual(390);
    expect(box!.top).toBeLessThan(100);
    expect(box!.width).toBeLessThan(150);
    expect(box!.height).toBeLessThanOrEqual(900);
  });

  it("leaves a tight image, a blank one, and an opaque one alone", async () => {
    expect(await transparentCropBox(sharp(await canvas(200, { x: 0, y: 0, w: 200, h: 200 })))).toBeNull();
    expect(await transparentCropBox(sharp(await canvas(200)))).toBeNull();
    const jpeg = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#888" } }).jpeg().toBuffer();
    expect(await transparentCropBox(sharp(jpeg))).toBeNull();
  });
});
