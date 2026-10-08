import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { analyzeAlpha, transparentCropBox } from "../trim-transparent";

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

describe("analyzeAlpha isCutout", () => {
  it("calls a subject on a transparent canvas a cutout", async () => {
    const result = await analyzeAlpha(sharp(await canvas(1000, { x: 400, y: 100, w: 100, h: 800 })));
    expect(result.isCutout).toBe(true);
    expect(result.box).not.toBeNull();
    // 100 x 800 opaque on a 1000 x 1000 canvas leaves 92% empty.
    expect(result.transparentShare).toBeCloseTo(0.92, 2);
  });

  it("calls a tight rectangular bottle a cutout when its neck leaves room around it", async () => {
    // A decanter: a wide body with a narrow neck, trimmed to its own bounds.
    const body = await sharp({ create: { width: 200, height: 160, channels: 4, background: { r: 60, g: 30, b: 20, alpha: 1 } } })
      .png()
      .toBuffer();
    const neck = await sharp({ create: { width: 60, height: 40, channels: 4, background: { r: 60, g: 30, b: 20, alpha: 1 } } })
      .png()
      .toBuffer();
    const image = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([
        { input: body, left: 0, top: 40 },
        { input: neck, left: 70, top: 0 },
      ])
      .png()
      .toBuffer();
    expect((await analyzeAlpha(sharp(image))).isCutout).toBe(true);
  });

  it("does not call an opaque photo a cutout", async () => {
    const jpeg = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#888" } }).jpeg().toBuffer();
    const result = await analyzeAlpha(sharp(jpeg));
    expect(result.isCutout).toBe(false);
    expect(result.transparentShare).toBe(0);
  });

  it("does not call a PNG with an unused alpha channel a cutout", async () => {
    const opaque = await canvas(200, { x: 0, y: 0, w: 200, h: 200 });
    const result = await analyzeAlpha(sharp(opaque));
    expect(result.isCutout).toBe(false);
    expect(result.box).toBeNull();
  });

  it("does not call a blank transparent image a cutout", async () => {
    expect((await analyzeAlpha(sharp(await canvas(200)))).isCutout).toBe(false);
  });
});
