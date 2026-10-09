import sharp, { type Sharp } from "sharp";
import { analyzeAlpha } from "./trim-transparent";

/**
 * A cutout photo's tile: the bottle placed where the gallery plate puts it, with
 * a soft shadow cast along the floor, baked into one transparent WebP. The
 * gallery draws the plate (wall, floor, frame) and this on top, so a shadow
 * costs one image per tile instead of a live filter on every tile while
 * scrolling.
 *
 * The geometry copies the plate: bottle-gallery.tsx (image box inset 4% at the
 * sides, 9% from the top, 7% from the bottom; floor is the bottom 24%) and
 * BottleCard.swift. Change the plate and this together, then rebuild tiles.
 */
export const TILE_WIDTH = 480;
export const TILE_HEIGHT = 640;
const BOX = {
  left: Math.round(TILE_WIDTH * 0.04),
  right: Math.round(TILE_WIDTH * 0.96),
  top: Math.round(TILE_HEIGHT * 0.09),
  bottom: Math.round(TILE_HEIGHT * 0.93),
};
const FLOOR_TOP = Math.round(TILE_HEIGHT * 0.76);

/** Light from the front left: the shadow runs back along the floor at this angle (0 = sideways, 90 = straight back)... */
const ANGLE = 30;
/** ...and is this long for every unit of bottle height. */
const LENGTH = 0.65;
const SHADOW_OPACITY = 0.38;
const SHADOW_BLUR = 1.6;

/** Blur the edge and pull it in a hair, so the pale fringe a mask leaves around a bottle goes. */
const EDGE_BLUR_PER_PX = 0.0017;
const EDGE_THRESHOLD = 0.8;

/** Where a cutout's tile lives, given where its thumbnail does (`bottles/thumbs/<id>.webp`). */
export function tilePathFor(thumbPath: string): string | null {
  return thumbPath.includes("/thumbs/") ? thumbPath.replace("/thumbs/", "/tiles/") : null;
}

/** The thumbnail a tile path stands for, or null when it is not a tile path. */
export function thumbPathForTile(tilePath: string): string | null {
  return tilePath.includes("/tiles/") ? tilePath.replace("/tiles/", "/thumbs/") : null;
}

async function oneChannel(image: Sharp): Promise<Buffer> {
  return image.extractChannel(0).raw().toBuffer();
}

/** The same picture with its alpha blurred and re-contrasted. */
async function cleanEdge(png: Buffer): Promise<Buffer> {
  const { data: alpha, info } = await sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const sigma = Math.max(0.8, height * EDGE_BLUR_PER_PX);
  const soft = await oneChannel(
    sharp(alpha, { raw: { width, height, channels: 1 } })
      .blur(sigma)
      .linear(1 / (1 - EDGE_THRESHOLD), (-255 * EDGE_THRESHOLD) / (1 - EDGE_THRESHOLD)),
  );
  const rgb = await sharp(png).removeAlpha().raw().toBuffer();
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(soft, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

/**
 * The silhouette laid flat on the floor: each point's height above the base
 * becomes distance back and to the side. Built leaning left and mirrored
 * afterwards, because the SVG renderer drops a skewed image whose origin lands
 * far past the right edge.
 */
async function floorShadow(bottle: Buffer, left: number, width: number, height: number): Promise<Buffer> {
  const rad = (ANGLE * Math.PI) / 180;
  const sideways = -LENGTH * Math.cos(rad);
  const back = LENGTH * Math.sin(rad);
  const flipped = await sharp(bottle).flop().png().toBuffer();
  const originX = left + sideways * height;
  const originY = BOX.bottom - back * height;
  const svg = `<svg width="${TILE_WIDTH}" height="${TILE_HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>
    <filter id="ink" filterUnits="userSpaceOnUse" x="0" y="0" width="${TILE_WIDTH}" height="${TILE_HEIGHT}"><feColorMatrix type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.13  0 0 0 0 0.24  0 0 0 ${SHADOW_OPACITY} 0"/><feGaussianBlur stdDeviation="${SHADOW_BLUR}"/></filter>
    <linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="0" y1="${BOX.bottom}" x2="0" y2="${BOX.bottom - back * height}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient>
    <mask id="mk" maskUnits="userSpaceOnUse" x="0" y="0" width="${TILE_WIDTH}" height="${TILE_HEIGHT}"><rect width="${TILE_WIDTH}" height="${TILE_HEIGHT}" fill="url(#fade)"/></mask></defs>
    <g mask="url(#mk)"><g filter="url(#ink)"><image xlink:href="data:image/png;base64,${flipped.toString("base64")}" width="${width}" height="${height}" transform="matrix(1 0 ${-sideways} ${back} ${originX} ${originY})"/></g></g></svg>`;
  const leaning = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(leaning).flop().png().toBuffer();
}

/**
 * The tile for a cutout, or null when the image is not a cutout (no real
 * transparency). Works from any stored rendition: it trims to the bottle itself,
 * so the padding a stored file carries does not matter.
 */
export async function buildTile(cutout: Buffer): Promise<Buffer | null> {
  const source = sharp(cutout).rotate();
  const { box, isCutout } = await analyzeAlpha(source, 0);
  if (!isCutout) return null;

  const trimmed = await (box ? source.clone().extract(box) : source.clone()).png().toBuffer();
  const bottle = await sharp(await cleanEdge(trimmed))
    .resize({ width: BOX.right - BOX.left, height: BOX.bottom - BOX.top, fit: "inside" })
    .png()
    .toBuffer();
  const { width, height } = await sharp(bottle).metadata();
  if (!width || !height) return null;
  const left = Math.round((TILE_WIDTH - width) / 2);
  const top = BOX.bottom - height;

  // Only the floor takes the shadow; it stops at the wall line.
  const floorTop = FLOOR_TOP + 2;
  const shadow = await sharp(await floorShadow(bottle, left, width, height))
    .extract({ left: 0, top: floorTop, width: TILE_WIDTH, height: TILE_HEIGHT - floorTop })
    .png()
    .toBuffer();

  return sharp({ create: { width: TILE_WIDTH, height: TILE_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: shadow, left: 0, top: floorTop },
      { input: bottle, left, top },
    ])
    .webp({ quality: 82 })
    .toBuffer();
}
