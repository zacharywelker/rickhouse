import type { Sharp } from "sharp";

export type CropBox = { left: number; top: number; width: number; height: number };

/** Alpha at or below this counts as empty (soft shadows and fringes included). */
const ALPHA_THRESHOLD = 8;
/** Breathing room kept around the subject, as a fraction of its own size. */
const PADDING = 0.04;
/** Not worth re-cropping if it would only shave off this much. */
const MIN_SAVING = 0.03;
/** A photo is a cutout once this share of its pixels is empty. Opaque photos have none. */
const CUTOUT_MIN_TRANSPARENT = 0.02;

export type AlphaAnalysis = {
  /** Where to crop, or null when there is nothing to do. */
  box: CropBox | null;
  /** Whether the photo is a cutout: it has real transparency, not just an alpha channel. */
  isCutout: boolean;
};

/**
 * Where the visible part of an image sits inside its transparent canvas, and
 * whether the image is a cutout at all, from one walk over its alpha values.
 *
 * Takes already-oriented pixels (sharp's `.rotate()` applied) so the box is in
 * the same coordinate space the crop will run in. The box is null when there
 * is nothing to do: no alpha channel, fully transparent, or already tight.
 */
export async function analyzeAlpha(oriented: Sharp): Promise<AlphaAnalysis> {
  const meta = await oriented.clone().metadata();
  if (!meta.hasAlpha) return { box: null, isCutout: false };

  const { data, info } = await oriented
    .clone()
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let empty = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[row + x]! > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        empty++;
      }
    }
  }
  // A blank image has transparency but no subject, so it is not a cutout of anything.
  if (maxX < 0) return { box: null, isCutout: false };
  const isCutout = empty / (width * height) >= CUTOUT_MIN_TRANSPARENT;

  const padX = Math.round((maxX - minX + 1) * PADDING);
  const padY = Math.round((maxY - minY + 1) * PADDING);
  const left = Math.max(0, minX - padX);
  const top = Math.max(0, minY - padY);
  const right = Math.min(width - 1, maxX + padX);
  const bottom = Math.min(height - 1, maxY + padY);
  const box = { left, top, width: right - left + 1, height: bottom - top + 1 };

  if (box.width * box.height > width * height * (1 - MIN_SAVING)) return { box: null, isCutout };
  return { box, isCutout };
}

/** Where to crop away transparent margins, or null when there is nothing to crop. */
export async function transparentCropBox(oriented: Sharp): Promise<CropBox | null> {
  return (await analyzeAlpha(oriented)).box;
}
